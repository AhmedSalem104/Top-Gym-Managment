#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_SHA='__RELEASE_SHA__'
APP_ROOT='__APP_ROOT__'
NODE_IMAGE='__NODE_IMAGE__'
CONTAINER_NAME='__CONTAINER_NAME__'
INTERNAL_PORT='__INTERNAL_PORT__'
CANDIDATE_PORT='__CANDIDATE_PORT__'
ARCHIVE_PATH='/tmp/__ARCHIVE_NAME__'
RELEASE_DIR="${APP_ROOT}/app-${RELEASE_SHA:0:12}"
LOCK_DIR="${APP_ROOT}/.production-release-lock"
STAGE='start'

fail_release() {
    code="$?"
    printf 'RELEASE_REMOTE_FAIL stage=%s code=%s\n' "$STAGE" "$code" >&2
    exit "$code"
}
trap fail_release ERR

if [ -e "$LOCK_DIR" ]; then
    if [ -f "$LOCK_DIR/pid" ] && kill -0 "$(cat "$LOCK_DIR/pid" 2>/dev/null)" 2>/dev/null; then
        STAGE='release-lock'
        printf 'RELEASE_LOCK=BUSY\n' >&2
        exit 73
    fi
    mv "$LOCK_DIR" "${LOCK_DIR}.stale.$(date -u +%Y%m%d%H%M%S)"
fi
mkdir -p "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"
printf '%s\n' "$RELEASE_SHA" > "$LOCK_DIR/sha"
cleanup_lock() { rm -f "$LOCK_DIR/pid" "$LOCK_DIR/sha" 2>/dev/null || true; rmdir "$LOCK_DIR" 2>/dev/null || true; }
trap cleanup_lock EXIT
printf 'RELEASE_LOCK=ACQUIRED\n'

STAGE='preflight'
docker inspect "$CONTAINER_NAME" >/dev/null 2>&1
OLD_CONTAINER="$CONTAINER_NAME"
OLD_RELEASE="$(docker inspect "$OLD_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}')"
[ -n "$OLD_RELEASE" ]
printf 'CURRENT_CONTAINER=PASS\n'

STAGE='stage-release'
mkdir -p "$APP_ROOT"
if [ -e "$RELEASE_DIR" ]; then
    [ -f "$RELEASE_DIR/.logicfit-release-sha" ]
    [ "$(cat "$RELEASE_DIR/.logicfit-release-sha")" = "$RELEASE_SHA" ]
else
    mkdir "$RELEASE_DIR"
    tar -xf "$ARCHIVE_PATH" -C "$RELEASE_DIR"
    printf '%s\n' "$RELEASE_SHA" > "$RELEASE_DIR/.logicfit-release-sha"
fi
rm -f "$ARCHIVE_PATH"
printf 'RELEASE_ARCHIVE=PASS\n'

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

STAGE='backup'
backup_started_at="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
backup_log="$(mktemp)"
if ! docker exec "$OLD_CONTAINER" node scripts/run-server-scheduled-backup.js >"$backup_log" 2>&1; then
    rm -f "$backup_log"
    exit 76
fi
rm -f "$backup_log"
printf 'BACKUP_JOB=PASS\n'

STAGE='backup-verification'
docker exec -e "BACKUP_STARTED_AT=$backup_started_at" -e PRODUCTION_BACKUP_VERIFY_CONFIRM=YES -i "$OLD_CONTAINER" node - <<'NODE'
const { closePool, getPool, sql } = require('./src/database');
const { runTenantContext } = require('./src/tenancy/tenant-context');
const { createBackupRecoveryService } = require('./src/services/backup-recovery-service');
(async () => {
    const startedAt = new Date(process.env.BACKUP_STARTED_AT || '');
    if (Number.isNaN(startedAt.getTime())) throw new Error('backup_marker_invalid');
    await runTenantContext({ mode: 'platform', tenantId: null, readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const row = (await pool.request().input('startedAt', sql.DateTime2(3), startedAt).query("SELECT TOP (1) id,status,size_bytes,checksum_sha256,verified_at FROM dbo.gym_platform_backup_records WHERE backup_type='platform_daily' AND status='VERIFIED' AND created_at>=@startedAt ORDER BY created_at DESC,id DESC;")).recordset[0];
        if (!row || !row.verified_at || Number(row.size_bytes || 0) <= 0 || !/^[a-f0-9]{64}$/i.test(String(row.checksum_sha256 || ''))) throw new Error('backup_record_invalid');
        const service = createBackupRecoveryService();
        await service.downloadPlatformBackup(Number(row.id), { readOnly: true, auditDownload: false });
        const health = await service.getPlatformBackupHealth({ readOnly: true });
        if (health.summary.missingToday !== 0 || health.summary.failedToday !== 0 || health.lastVerifiedPlatformBackup?.status !== 'VERIFIED') throw new Error('backup_coverage_incomplete');
    });
    process.stdout.write('BACKUP_VERIFY_PASS\n');
})().catch(() => { process.stderr.write('BACKUP_VERIFY_FAIL\n'); process.exitCode = 1; }).finally(() => closePool().catch(() => {}));
NODE
printf 'BACKUP_VERIFICATION=PASS\n'

STAGE='migration-plan'
if [ -f "$RELEASE_DIR/scripts/production-migration-gate.js" ]; then
    plan_output="$(run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -e MIGRATION_ENV=production -e MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node scripts/production-migration-gate.js --plan --expected-pending 031 --json)"
else
    plan_output="$(docker exec -i "$OLD_CONTAINER" node - <<'NODE'
const { closePool, getPool } = require('./src/database');
(async () => {
    const pool = await getPool();
    const exists = (await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'dbo.__TenantEFMigrationsHistory',N'U') IS NULL THEN 0 ELSE 1 END AS present;")).recordset[0]?.present;
    if (Number(exists) !== 1) throw new Error('ledger_missing');
    const rows = (await pool.request().query("SELECT MigrationId FROM dbo.__TenantEFMigrationsHistory;")).recordset.map((row) => String(row.MigrationId));
    process.stdout.write(JSON.stringify({ ledger: 'verified', pending: rows.includes('031-central-notifications.sql') ? [] : ['031-central-notifications.sql'] }) + '\n');
})().catch(() => { process.stderr.write('MIGRATION_PLAN_FAIL\n'); process.exitCode = 1; }).finally(() => closePool().catch(() => {}));
NODE
)"
fi
printf '%s\n' "$plan_output" | grep -Eq '"pending"[[:space:]]*:[[:space:]]*\['
if printf '%s\n' "$plan_output" | grep -Eq '029|030'; then
    exit 78
fi
printf 'MIGRATION_PLAN=PASS\n'

if printf '%s\n' "$plan_output" | grep -q '031-central-notifications.sql'; then
    STAGE='migration-031'
    if [ -f "$RELEASE_DIR/scripts/production-migration-gate.js" ]; then
        run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -e MIGRATION_ENV=production -e MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION -e RELEASE_MIGRATION_APPLY_CONFIRM=YES -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node scripts/production-migration-gate.js --apply --expected-pending 031 --json >/dev/null
    else
        run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -e MIGRATION_ENV=production -e MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node scripts/migrate-tenancy.js --only 031 >/dev/null
    fi
    printf 'MIGRATION_031=PASS\n'
else
    printf 'MIGRATION_031=ALREADY_APPLIED\n'
fi

STAGE='rls-tenancy'
if [ -f "$RELEASE_DIR/scripts/production-security-gate.js" ]; then
    run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -e RELEASE_PRODUCTION_SECURITY_CONFIRM=YES -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node scripts/production-security-gate.js >/dev/null
else
    docker exec -i "$OLD_CONTAINER" node - <<'NODE'
const { closePool, getPool } = require('./src/database');
const { runTenantContext } = require('./src/tenancy/tenant-context');
const { getTenantSecuritySnapshot, tenantSecuritySnapshotIsReady } = require('./src/services/tenant-service');
(async () => {
    const result = await runTenantContext({ mode: 'platform', tenantId: 1, readOnlyBaseline: true }, async () => getTenantSecuritySnapshot(await getPool()));
    if (!tenantSecuritySnapshotIsReady(result)
        || Number(result.unprotected_tenant_tables || 0) !== 0
        || Number(result.missing_registry_tables || 0) !== 0
        || Number(result.invalid_predicates || 0) !== 0) throw new Error('security_gap');
    process.stdout.write('SECURITY_GATE_PASS\n');
})().catch(() => { process.stderr.write('SECURITY_GATE_FAIL\n'); process.exitCode = 1; }).finally(() => closePool().catch(() => {}));
NODE
fi
printf 'RLS_TENANCY=PASS\n'

STAGE='candidate'
CANDIDATE_NAME="${CONTAINER_NAME}-candidate-${RELEASE_SHA:0:12}"
docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true
run_with_current_env "$OLD_CONTAINER" -e NODE_ENV=production -e PORT="$CANDIDATE_PORT" -e APP_RELEASE_ID="$RELEASE_SHA" -d --name "$CANDIDATE_NAME" --network host --restart no -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node -e 'const app=require("./server"); const {closePool}=require("./src/database"); const port=Number(process.env.PORT||3027); const server=app.listen(port,"127.0.0.1",()=>process.stdout.write("candidate-ready\n")); const shutdown=()=>server.close(()=>closePool().finally(()=>process.exit(0))); process.once("SIGTERM",shutdown); process.once("SIGINT",shutdown);' >/dev/null
candidate_ok=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${CANDIDATE_PORT}/api/health/live" >/dev/null 2>&1; then candidate_ok=1; break; fi
    sleep 1
done
if [ "$candidate_ok" -ne 1 ]; then docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true; exit 79; fi
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
    exit 80
fi
if ! run_with_current_env "$PREVIOUS_NAME" -e NODE_ENV=production -e PORT="$INTERNAL_PORT" -e APP_RELEASE_ID="$RELEASE_SHA" -d --name "$CONTAINER_NAME" --network host --restart unless-stopped -v "$RELEASE_DIR:/app" -w /app "$NODE_IMAGE" node -e 'const app=require("./server"); const {closePool}=require("./src/database"); const port=Number(process.env.PORT||3017); const server=app.listen(port,"127.0.0.1",()=>process.stdout.write("production-ready\n")); const shutdown=()=>server.close(()=>closePool().finally(()=>process.exit(0))); process.once("SIGTERM",shutdown); process.once("SIGINT",shutdown);' >/dev/null; then
    docker rename "$PREVIOUS_NAME" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    exit 80
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
    exit 81
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
