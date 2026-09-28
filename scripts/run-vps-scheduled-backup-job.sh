#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT='@@APP_ROOT@@'
CONTAINER_NAME='@@CONTAINER_NAME@@'
NODE_IMAGE='@@NODE_IMAGE@@'
BACKUP_RELEASE_DIR='@@BACKUP_RELEASE_DIR@@'
STATE_DIR="${APP_ROOT}/job-state"
RELEASE_LOCK="${APP_ROOT}/.production-release-lock"

# A release owns the same host lock as the backup job. Skipping during a
# release is safe because the timer is persistent and systemd will invoke the
# next scheduled run; it also prevents a backup from racing a cutover.
if [ -e "$RELEASE_LOCK" ]; then
    printf '%s\n' 'BACKUP_SKIPPED=RELEASE_LOCK'
    exit 0
fi

command -v docker >/dev/null 2>&1
container_id="$(docker inspect "$CONTAINER_NAME" --format '{{.Id}}' 2>/dev/null || true)"
if [ -z "$container_id" ]; then
    printf '%s\n' 'BACKUP_FAILED=PRODUCTION_CONTAINER_UNAVAILABLE' >&2
    exit 1
fi

case "$BACKUP_RELEASE_DIR" in
    "$APP_ROOT"/app-*) ;;
    *)
        printf '%s\n' 'BACKUP_FAILED=RELEASE_PATH_INVALID' >&2
        exit 1
        ;;
esac

[ -f "$BACKUP_RELEASE_DIR/scripts/run-server-scheduled-backup.js" ]
mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

# Run the release-pinned backup tooling against the live application's current
# schema/config. Pinning the tooling independently lets OLD_RELEASE serve as
# rollback source after an additive migration without losing new-table coverage.
# Environment is passed through an anonymous pipe; no secret is stored here.
docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' |
    docker run --rm --network host --env-file /dev/stdin \
        -e NODE_ENV=production \
        -e LOGIC_FIT_JOB_STATE_DIR=/var/lib/logicfit/jobs \
        -v "$STATE_DIR:/var/lib/logicfit/jobs" \
        -v "$BACKUP_RELEASE_DIR:/app:ro" \
        -w /app \
        "$NODE_IMAGE" node --max-old-space-size=1024 scripts/run-server-scheduled-backup.js
