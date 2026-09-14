#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT='@@APP_ROOT@@'
CONTAINER_NAME='@@CONTAINER_NAME@@'
NODE_IMAGE='@@NODE_IMAGE@@'
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

release_dir="$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}')"
case "$release_dir" in
    "$APP_ROOT"/app-*) ;;
    *)
        printf '%s\n' 'BACKUP_FAILED=RELEASE_PATH_INVALID' >&2
        exit 1
        ;;
esac

[ -f "$release_dir/scripts/run-server-scheduled-backup.js" ]
mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

# Reuse the running application's environment through an anonymous pipe. No
# secret is placed in this wrapper, a command argument, or a host-side file.
docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' |
    docker run --rm --network host --env-file /dev/stdin \
        -e NODE_ENV=production \
        -e LOGIC_FIT_JOB_STATE_DIR=/var/lib/logicfit/jobs \
        -v "$STATE_DIR:/var/lib/logicfit/jobs" \
        -v "$release_dir:/app:ro" \
        -w /app \
        "$NODE_IMAGE" node --max-old-space-size=1024 scripts/run-server-scheduled-backup.js
