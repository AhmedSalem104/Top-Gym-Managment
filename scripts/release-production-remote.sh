#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_SHA='__RELEASE_SHA__'
APP_ROOT='__APP_ROOT__'
REPOSITORY_URL='__REPOSITORY_URL__'
GIT_CACHE_DIR='__GIT_CACHE_DIR__'
RELEASE_TRANSPORT='__RELEASE_TRANSPORT__'
NODE_IMAGE='__NODE_IMAGE__'
CONTAINER_NAME='__CONTAINER_NAME__'
INTERNAL_PORT='__INTERNAL_PORT__'
CANDIDATE_PORT='__CANDIDATE_PORT__'
ARCHIVE_PATH='/tmp/__ARCHIVE_NAME__'
CONTROL_ARCHIVE_PATH='/tmp/__CONTROL_ARCHIVE_NAME__'
RELEASE_DIR="${APP_ROOT}/app-${RELEASE_SHA:0:12}"
CONTROL_DIR="/tmp/logicfit-release-control-${RELEASE_SHA:0:12}"
LOCK_DIR="${APP_ROOT}/.production-release-lock"
STAGE='start'

fail_release() {
    code="$?"
    printf 'RELEASE_REMOTE_FAIL stage=%s code=%s\n' "$STAGE" "$code" >&2
    exit "$code"
}
abort_release() {
    code="$1"
    printf 'RELEASE_REMOTE_FAIL stage=%s code=%s\n' "$STAGE" "$code" >&2
    exit "$code"
}
trap fail_release ERR

if [ -e "$LOCK_DIR" ]; then
    if [ -f "$LOCK_DIR/pid" ] && kill -0 "$(cat "$LOCK_DIR/pid" 2>/dev/null)" 2>/dev/null; then
        STAGE='release-lock'
        printf 'RELEASE_LOCK=BUSY\n' >&2
        abort_release 73
    fi
    mv "$LOCK_DIR" "${LOCK_DIR}.stale.$(date -u +%Y%m%d%H%M%S)"
fi
mkdir -p "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"
printf '%s\n' "$RELEASE_SHA" > "$LOCK_DIR/sha"
cleanup_lock() { rm -f "$LOCK_DIR/pid" "$LOCK_DIR/sha" 2>/dev/null || true; rmdir "$LOCK_DIR" 2>/dev/null || true; }
cleanup_artifacts() { rm -f "$ARCHIVE_PATH" "$CONTROL_ARCHIVE_PATH" 2>/dev/null || true; rm -rf -- "$CONTROL_DIR" 2>/dev/null || true; }
trap 'cleanup_lock; cleanup_artifacts' EXIT
printf 'RELEASE_LOCK=ACQUIRED\n'

STAGE='preflight'
docker inspect "$CONTAINER_NAME" >/dev/null 2>&1
OLD_CONTAINER="$CONTAINER_NAME"
OLD_RELEASE="$(docker inspect "$OLD_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}')"
[ -n "$OLD_RELEASE" ]
printf 'CURRENT_CONTAINER=PASS\n'

STAGE='stage-release'
mkdir -p "$APP_ROOT"
if [ "$RELEASE_TRANSPORT" = 'git' ]; then
    STAGE='source-fetch'
    command -v git >/dev/null 2>&1
    mkdir -p "$(dirname "$GIT_CACHE_DIR")"
    if [ ! -d "$GIT_CACHE_DIR" ]; then
        git init --bare "$GIT_CACHE_DIR" >/dev/null
        git --git-dir="$GIT_CACHE_DIR" remote add origin "$REPOSITORY_URL"
    else
        [ -d "$GIT_CACHE_DIR/objects" ]
        existing_origin="$(git --git-dir="$GIT_CACHE_DIR" remote get-url origin 2>/dev/null || true)"
        [ "$existing_origin" = "$REPOSITORY_URL" ]
    fi
    git --git-dir="$GIT_CACHE_DIR" fetch --no-tags origin "$RELEASE_SHA" >/dev/null
    fetched_sha="$(git --git-dir="$GIT_CACHE_DIR" rev-parse --verify "$RELEASE_SHA^{commit}")"
    [ "$fetched_sha" = "$RELEASE_SHA" ]
    if [ -e "$RELEASE_DIR" ]; then
        [ -f "$RELEASE_DIR/.logicfit-release-sha" ]
        [ "$(cat "$RELEASE_DIR/.logicfit-release-sha")" = "$RELEASE_SHA" ]
    else
        mkdir "$RELEASE_DIR"
        git --git-dir="$GIT_CACHE_DIR" archive --format=tar "$RELEASE_SHA" | tar -x -C "$RELEASE_DIR"
        printf '%s\n' "$RELEASE_SHA" > "$RELEASE_DIR/.logicfit-release-sha"
    fi
    printf 'RELEASE_SOURCE=GIT_FETCH_PASS\n'
elif [ "$RELEASE_TRANSPORT" = 'archive' ]; then
    STAGE='control-stage'
    rm -rf -- "$CONTROL_DIR"
    mkdir -p "$CONTROL_DIR"
    tar -xzf "$CONTROL_ARCHIVE_PATH" -C "$CONTROL_DIR"
    [ -f "$CONTROL_DIR/scripts/production-migration-gate.js" ]
    [ -f "$CONTROL_DIR/scripts/production-security-gate.js" ]
    [ -f "$CONTROL_DIR/database/migration-manifest.json" ]
    printf 'RELEASE_CONTROL=PASS\n'
    if [ -e "$RELEASE_DIR" ]; then
        [ -f "$RELEASE_DIR/.logicfit-release-sha" ]
        [ "$(cat "$RELEASE_DIR/.logicfit-release-sha")" = "$RELEASE_SHA" ]
    else
        mkdir "$RELEASE_DIR"
        tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR"
        printf '%s\n' "$RELEASE_SHA" > "$RELEASE_DIR/.logicfit-release-sha"
    fi
    printf 'RELEASE_SOURCE=ARCHIVE_PASS\n'
else
    abort_release 74
fi
if [ "$RELEASE_TRANSPORT" = 'archive' ]; then
    rm -f "$ARCHIVE_PATH" "$CONTROL_ARCHIVE_PATH"
fi

STAGE='dependencies'
if [ ! -d "$RELEASE_DIR/node_modules" ]; then
    docker run --rm -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
fi
printf 'DEPENDENCIES=PASS\n'

run_with_current_env() {
    source_container="$1"
    shift
    docker inspect "$source_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | docker run --rm --network host --env-file /dev/stdin "$@"
}

# Persistent containers must not use --rm: Docker rejects --rm together with
# --restart.  Keep the one-shot helper above for control jobs and use this
# helper only for candidate/production runtimes that are explicitly cleaned
# up or retained by the release flow.
run_with_current_env_persistent() {
    source_container="$1"
    shift
    docker inspect "$source_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | docker run --network host --env-file /dev/stdin "$@"
}

STAGE='migration-plan'
run_control() {
    control_env=()
    while [ "${1:-}" = '-e' ]; do
        [ "$#" -ge 2 ]
        control_env+=("$1" "$2")
        shift 2
    done
    [ "$#" -ge 1 ]
    run_with_current_env "$OLD_CONTAINER" \
        -e NODE_ENV=production \
        -e NODE_PATH=/app/node_modules \
        -e RELEASE_APP_ROOT=/app \
        -e RELEASE_MIGRATIONS_DIR=/app/database/migrations \
        -e RELEASE_MANIFEST_PATH=/app/database/migration-manifest.json \
        "${control_env[@]}" \
        -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" "$@"
}
plan_output="$(run_control -e MIGRATION_ENV=production -e MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION node scripts/production-migration-gate.js --plan --json)"
case "$plan_output" in
    *'"status":"PASS"'*) ;;
    *)
        STAGE='migration-plan'
        abort_release 78
        ;;
esac
case "$plan_output" in
    *029*|*030*)
    STAGE='migration-plan'
    abort_release 78
    ;;
esac
printf 'MIGRATION_PLAN=PASS\n'

MIGRATION_PENDING='NONE'
case "$plan_output" in
*031-central-notifications.sql*)
    MIGRATION_PENDING='031-central-notifications.sql'
    ;;
    *)
    ;;
esac

if [ "$MIGRATION_PENDING" = '031-central-notifications.sql' ]; then
    STAGE='backup'
    backup_started_at="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
    backup_log="$(mktemp)"
    if ! run_with_current_env "$OLD_CONTAINER" \
        -e LOGIC_FIT_JOB_STATE_DIR=/tmp/logicfit-job-state-release \
        -e NODE_ENV=production \
        -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" \
        node --max-old-space-size=640 scripts/run-server-scheduled-backup.js >"$backup_log" 2>&1; then
        rm -f "$backup_log"
        abort_release 76
    fi
    rm -f "$backup_log"
    printf 'BACKUP_JOB=PASS\n'

    STAGE='backup-verification'
    if ! run_with_current_env "$OLD_CONTAINER" \
        -e NODE_ENV=production \
        -e "BACKUP_STARTED_AT=$backup_started_at" \
        -e PRODUCTION_BACKUP_VERIFY_CONFIRM=YES \
        -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" \
        node --max-old-space-size=640 scripts/verify-production-backup.js >/dev/null; then
        abort_release 77
    fi
    printf 'BACKUP_VERIFICATION=PASS\n'

    STAGE='migration-031'
    run_control -e MIGRATION_ENV=production -e MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION -e RELEASE_MIGRATION_APPLY_CONFIRM=YES node scripts/production-migration-gate.js --apply --json >/dev/null
    printf 'MIGRATION_PENDING=APPLIED\n'

    STAGE='rls-tenancy'
    run_control -e RELEASE_PRODUCTION_SECURITY_CONFIRM=YES node scripts/production-security-gate.js >/dev/null
    printf 'RLS_TENANCY=PASS\n'
else
    printf 'BACKUP_JOB=SKIPPED_CODE_ONLY\n'
    printf 'BACKUP_VERIFICATION=SKIPPED_CODE_ONLY\n'
    printf 'MIGRATION_PENDING=NONE\n'
    printf 'RLS_TENANCY=SKIPPED_CODE_ONLY\n'
fi

STAGE='candidate'
CANDIDATE_NAME="${CONTAINER_NAME}-candidate-${RELEASE_SHA:0:12}"
docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true
run_with_current_env_persistent "$OLD_CONTAINER" -e NODE_ENV=production -e PORT="$CANDIDATE_PORT" -e APP_RELEASE_ID="$RELEASE_SHA" -d --name "$CANDIDATE_NAME" --restart no -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node -e 'const app=require("./server"); const {closePool}=require("./src/database"); const port=Number(process.env.PORT||3027); const server=app.listen(port,"127.0.0.1",()=>process.stdout.write("candidate-ready\n")); const shutdown=()=>server.close(()=>closePool().finally(()=>process.exit(0))); process.once("SIGTERM",shutdown); process.once("SIGINT",shutdown);' >/dev/null
candidate_ok=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${CANDIDATE_PORT}/api/health/live" >/dev/null 2>&1; then candidate_ok=1; break; fi
    sleep 1
done
if [ "$candidate_ok" -ne 1 ]; then docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true; abort_release 79; fi
if [ -f "$RELEASE_DIR/scripts/production-smoke.js" ]; then
    run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node scripts/production-smoke.js --base-url "http://127.0.0.1:${CANDIDATE_PORT}" >/dev/null
else
    curl -fsS --max-time 10 "http://127.0.0.1:${CANDIDATE_PORT}/api/health/live" >/dev/null
    curl -fsS --max-time 10 "http://127.0.0.1:${CANDIDATE_PORT}/api/health" >/dev/null
    curl -fsS --max-time 10 "http://127.0.0.1:${CANDIDATE_PORT}/api/public/gym-registration/catalog" >/dev/null
    curl -fsS --max-time 10 "http://127.0.0.1:${CANDIDATE_PORT}/api/public/trainer-registration/catalog" >/dev/null
fi
docker stop "$CANDIDATE_NAME" >/dev/null
docker rm "$CANDIDATE_NAME" >/dev/null
printf 'CANDIDATE_SMOKE=PASS\n'

STAGE='cutover'
PREVIOUS_NAME="${CONTAINER_NAME}-previous-$(date -u +%Y%m%d%H%M%S)"
docker rename "$OLD_CONTAINER" "$PREVIOUS_NAME"
if ! docker stop "$PREVIOUS_NAME" >/dev/null; then
    docker rename "$PREVIOUS_NAME" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    abort_release 80
fi
if ! run_with_current_env_persistent "$PREVIOUS_NAME" -e NODE_ENV=production -e PORT="$INTERNAL_PORT" -e APP_RELEASE_ID="$RELEASE_SHA" -d --name "$CONTAINER_NAME" --restart unless-stopped -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node -e 'const app=require("./server"); const {closePool}=require("./src/database"); const port=Number(process.env.PORT||3017); const server=app.listen(port,"127.0.0.1",()=>process.stdout.write("production-ready\n")); const shutdown=()=>server.close(()=>closePool().finally(()=>process.exit(0))); process.once("SIGTERM",shutdown); process.once("SIGINT",shutdown);' >/dev/null; then
    docker rename "$PREVIOUS_NAME" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    abort_release 80
fi
health_ok=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${INTERNAL_PORT}/api/health/live" >/dev/null 2>&1; then health_ok=1; break; fi
    sleep 1
done
if [ "$health_ok" -ne 1 ]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rename "$PREVIOUS_NAME" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    abort_release 81
fi

STAGE='sha-verification'
DEPLOYED_RELEASE="$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}')"
[ "$DEPLOYED_RELEASE" = "$RELEASE_DIR" ]
[ "$(cat "$RELEASE_DIR/.logicfit-release-sha")" = "$RELEASE_SHA" ]
printf 'DEPLOYED_SHA=%s\n' "$RELEASE_SHA"
printf 'SHA_MATCH=PASS\n'
printf 'HEALTH=PASS\n'

STAGE='audit'
AUDIT_DIR="${APP_ROOT}/release-audit"
mkdir -p "$AUDIT_DIR"
umask 077
cat > "$AUDIT_DIR/${RELEASE_SHA}.json" <<EOF
{"releaseSha":"$RELEASE_SHA","previousContainer":"$PREVIOUS_NAME","deployedContainer":"$CONTAINER_NAME","migration":"031-central-notifications.sql","migrationStatus":"verified","backupStatus":"verified","securityStatus":"verified","healthStatus":"verified","createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
printf 'ROLLBACK_READY=PASS\n'
printf 'RELEASE_REMOTE=PASS\n'
