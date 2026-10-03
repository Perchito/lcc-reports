#!/usr/bin/env bash
# Push the working tree to perchito and restart the service.
set -euo pipefail
cd "$(dirname "$0")"
rsync -az --delete --exclude .git --exclude node_modules --exclude .env ./ perchito:lcc-reports/
ssh perchito 'cd lcc-reports && npm ci --omit=dev --silent && (set -a; . ./.env; psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/schema.sql) && (sudo -n systemctl restart lcc-reports 2>/dev/null || echo "service not installed yet — run setup-perchito.sh")'
