import importlib.util
import io
import pathlib
import unittest
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('cache_gateway', ROOT / 'infra/redis/cache-gateway.py')
gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gateway)


class CacheGatewayRateLimitTests(unittest.TestCase):
    def test_atomic_increment_uses_single_script_and_returns_counter(self):
        key = 'logicfit:v1:test:ratelimit:' + ('a' * 64)
        with patch.object(gateway, 'redis_command', return_value=[3, 42000]) as command:
            result = gateway.increment_rate_limit(key, 60000)
        self.assertEqual(result, {'count': 3, 'resetInMs': 42000})
        args = command.call_args.args[0]
        self.assertEqual(args[:4], ['EVAL', gateway.RATE_LIMIT_INCREMENT_SCRIPT, '1', key])
        self.assertEqual(args[4], 60000)

    def test_rejects_non_rate_limit_keys_and_invalid_windows_before_redis(self):
        with patch.object(gateway, 'redis_command') as command:
            for key, window in [
                ('logicfit:v1:test:members:x', 60000),
                ('other:v1:test:ratelimit:x', 60000),
                ('logicfit:v1:test:ratelimit:x', True),
                ('logicfit:v1:test:ratelimit:x', 999),
                ('logicfit:v1:test:ratelimit:x', gateway.MAX_RATE_LIMIT_WINDOW_MS + 1),
            ]:
                with self.subTest(key=key, window=window):
                    with self.assertRaises(ValueError):
                        gateway.increment_rate_limit(key, window)
        command.assert_not_called()

    def test_redis_error_response_arrays_are_parsed(self):
        self.assertEqual(gateway.read_response(io.BytesIO(b'*2\r\n:7\r\n:3500\r\n')), [7, 3500])
        with self.assertRaises(gateway.RedisProtocolError):
            gateway.read_response(io.BytesIO(b'*-2\r\n'))

    def test_gateway_preserves_the_compound_rate_limit_operation_path(self):
        self.assertEqual(gateway.gateway_operation('/cache/rate-limit/increment'), 'rate-limit/increment')
        self.assertEqual(gateway.gateway_operation('/cache/get'), 'get')


if __name__ == '__main__':
    unittest.main()
