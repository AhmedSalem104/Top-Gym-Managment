#!/usr/bin/env python3
"""Small authenticated HTTPS-facing Redis cache gateway.

The process listens on loopback only. Caddy is the public TLS boundary; it
routes one path prefix to this service. Redis remains loopback-only and the
gateway exposes only JSON cache operations under the logicfit:* namespace.
"""

import hmac
import json
import os
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


def env(name, fallback=''):
    return os.environ.get(name, fallback).strip()


GATEWAY_TOKEN = env('CACHE_GATEWAY_TOKEN')
REDIS_USER = env('REDIS_USER', 'logicfit-cache')
REDIS_PASSWORD = env('REDIS_PASSWORD')
REDIS_HOST = env('REDIS_HOST', '127.0.0.1')
REDIS_PORT = int(env('REDIS_PORT', '6379'))
REDIS_TIMEOUT = max(0.05, min(2.0, float(env('REDIS_TIMEOUT_SECONDS', '0.15'))))
ALLOWED_PREFIX = env('CACHE_KEY_PREFIX', 'logicfit:')
MAX_KEY_BYTES = 512
MAX_VALUE_BYTES = 768 * 1024
MAX_BODY_BYTES = MAX_VALUE_BYTES + 4096
MAX_RATE_LIMIT_WINDOW_MS = 86_400_000

RATE_LIMIT_INCREMENT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
"""


class RedisProtocolError(Exception):
    pass


def encode_command(parts):
    encoded = [str(part).encode('utf-8') for part in parts]
    payload = [f'*{len(encoded)}\r\n'.encode('ascii')]
    for item in encoded:
        payload.extend([f'${len(item)}\r\n'.encode('ascii'), item, b'\r\n'])
    return b''.join(payload)


def read_line(stream):
    line = stream.readline()
    if not line or not line.endswith(b'\r\n'):
        raise RedisProtocolError('Redis response ended unexpectedly.')
    return line[:-2]


def read_response(stream):
    prefix = stream.read(1)
    if prefix == b'+':
        return read_line(stream).decode('utf-8', 'replace')
    if prefix == b'-':
        raise RedisProtocolError('Redis command failed.')
    if prefix == b':':
        return int(read_line(stream))
    if prefix == b'*':
        count = int(read_line(stream))
        if count == -1:
            return None
        if count < 0 or count > 16:
            raise RedisProtocolError('Redis array response exceeded its limit.')
        return [read_response(stream) for _ in range(count)]
    if prefix == b'$':
        length = int(read_line(stream))
        if length == -1:
            return None
        value = stream.read(length)
        if len(value) != length or stream.read(2) != b'\r\n':
            raise RedisProtocolError('Redis bulk response was incomplete.')
        return value
    raise RedisProtocolError('Unsupported Redis response type.')


def redis_command(parts):
    if not REDIS_PASSWORD:
        raise RedisProtocolError('Redis credential is not configured.')
    with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=REDIS_TIMEOUT) as connection:
        connection.settimeout(REDIS_TIMEOUT)
        stream = connection.makefile('rwb', buffering=0)
        stream.write(encode_command(['AUTH', REDIS_USER, REDIS_PASSWORD]))
        if read_response(stream) != 'OK':
            raise RedisProtocolError('Redis authentication failed.')
        stream.write(encode_command(parts))
        return read_response(stream)


def valid_key(value):
    return isinstance(value, str) and 0 < len(value.encode('utf-8')) <= MAX_KEY_BYTES and value.startswith(ALLOWED_PREFIX)


def increment_rate_limit(key, window_ms):
    if (not valid_key(key) or ':ratelimit:' not in key
            or not isinstance(window_ms, int) or isinstance(window_ms, bool)
            or window_ms < 1000 or window_ms > MAX_RATE_LIMIT_WINDOW_MS):
        raise ValueError('Invalid rate-limit counter.')
    result = redis_command(['EVAL', RATE_LIMIT_INCREMENT_SCRIPT, '1', key, window_ms])
    if not isinstance(result, list) or len(result) != 2:
        raise RedisProtocolError('Invalid rate-limit counter response.')
    count, ttl = result
    if not isinstance(count, int) or not isinstance(ttl, int) or count < 1 or ttl < 1:
        raise RedisProtocolError('Invalid rate-limit counter result.')
    return {'count': count, 'resetInMs': ttl}


def gateway_operation(path):
    normalized = urlsplit(path).path.strip('/')
    if normalized.endswith('/rate-limit/increment') or normalized == 'rate-limit/increment':
        return 'rate-limit/increment'
    return normalized.split('/')[-1] if normalized else ''


def json_response(handler, status, payload):
    data = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('Content-Length', str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class CacheHandler(BaseHTTPRequestHandler):
    server_version = 'LogicFitCacheGateway/1'

    def log_message(self, *_args):
        # Do not write keys, values, authorization headers or member metadata.
        return

    def authorized(self):
        supplied = self.headers.get('Authorization', '')
        expected = f'Bearer {GATEWAY_TOKEN}'
        return bool(GATEWAY_TOKEN) and hmac.compare_digest(supplied, expected)

    def body(self):
        length = int(self.headers.get('Content-Length', '0') or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError('Invalid request size.')
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise ValueError('Incomplete request body.')
        return json.loads(raw.decode('utf-8'))

    def do_POST(self):
        if not self.authorized():
            json_response(self, 401, {'error': 'unauthorized'})
            return
        operation = gateway_operation(self.path)
        try:
            payload = self.body() if operation != 'ping' else {}
            if operation == 'ping':
                result = redis_command(['PING'])
                json_response(self, 200, {'ok': result == 'PONG'})
                return
            if operation == 'get':
                key = payload.get('key')
                if not valid_key(key):
                    raise ValueError('Invalid cache key.')
                value = redis_command(['GET', key])
                if value is None:
                    json_response(self, 200, {'hit': False})
                else:
                    json_response(self, 200, {'hit': True, 'value': value.decode('utf-8')})
                return
            if operation == 'set':
                key = payload.get('key')
                value = payload.get('value')
                ttl = int(payload.get('ttlSeconds', 60))
                if not valid_key(key) or not isinstance(value, str) or len(value.encode('utf-8')) > MAX_VALUE_BYTES or ttl < 1 or ttl > 3600:
                    raise ValueError('Invalid cache value.')
                result = redis_command(['SET', key, value, 'EX', ttl])
                json_response(self, 200, {'ok': result == 'OK'})
                return
            if operation == 'delete':
                keys = payload.get('keys')
                if not isinstance(keys, list) or not keys or len(keys) > 64 or not all(valid_key(key) for key in keys):
                    raise ValueError('Invalid cache keys.')
                redis_command(['DEL', *keys])
                json_response(self, 200, {'ok': True})
                return
            if operation == 'rate-limit/increment':
                result = increment_rate_limit(payload.get('key'), payload.get('windowMs'))
                json_response(self, 200, result)
                return
            json_response(self, 404, {'error': 'not_found'})
        except (ValueError, json.JSONDecodeError) as error:
            json_response(self, 400, {'error': str(error)})
        except (OSError, RedisProtocolError, UnicodeError):
            json_response(self, 503, {'error': 'cache_unavailable'})


def main():
    if not GATEWAY_TOKEN or not REDIS_PASSWORD:
        raise SystemExit('Cache gateway credentials are not configured.')
    server = ThreadingHTTPServer(('127.0.0.1', int(env('CACHE_GATEWAY_PORT', '9400'))), CacheHandler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == '__main__':
    main()
