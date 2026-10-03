#!/usr/bin/env bash
# One-off root setup for LCC Property Reports on perchito:
#   sudo bash ~/lcc-reports/setup-perchito.sh <admin-email> "<admin name>"
set -euo pipefail
ADMIN_EMAIL=${1:?admin email}; ADMIN_NAME=${2:?admin name}
cd /home/perchito/lcc-reports
DBPASS=$(openssl rand -hex 18)
STORAGE_KEY="hs_$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)"

# database (same pattern as the panel's createProject)
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
create role p_lcc_reports login password '$DBPASS';
grant hs_projects to p_lcc_reports;
create database p_lcc_reports owner p_lcc_reports;
revoke all on database p_lcc_reports from public;
SQL
# register with the panel (storage api reads this per request): nightly + offsite backups pick up the db, storage holds photos
sudo -u perchito node -e '
const f="/etc/perchito/projects.json", fs=require("fs"), d=JSON.parse(fs.readFileSync(f));
d.projects["lcc-reports"]={name:"LCC Property Reports",createdAt:new Date().toISOString(),key:process.argv[2],publicRead:false,storage:true,db:{name:"p_lcc_reports",user:"p_lcc_reports",password:process.argv[1]}};
fs.writeFileSync(f,JSON.stringify(d,null,2))' "$DBPASS" "$STORAGE_KEY"

sed -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://p_lcc_reports:$DBPASS@127.0.0.1:5432/p_lcc_reports|" \
    -e "s|^HOME_STORAGE_KEY=.*|HOME_STORAGE_KEY=$STORAGE_KEY|" .env.example > .env
sudo -u perchito node -e 'const k=require("web-push").generateVAPIDKeys(); console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`)' > /tmp/vapid.$$ && sed -i -e "/^VAPID_P/d" .env && cat /tmp/vapid.$$ >> .env && rm /tmp/vapid.$$
chown perchito:perchito .env && chmod 600 .env
sudo -u perchito bash -c 'set -a; . ./.env; psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/schema.sql'

cat > /etc/systemd/system/lcc-reports.service <<UNIT
[Unit]
Description=LCC Property Reports (jobs + before/after property reports)
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service
[Service]
User=perchito
WorkingDirectory=/home/perchito/lcc-reports
EnvironmentFile=/home/perchito/lcc-reports/.env
ExecStart=/usr/bin/node /home/perchito/lcc-reports/server.mjs
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
# let perchito (deploys + the perchito control panel) manage this service without a password
for a in start stop restart enable disable; do echo "perchito ALL=(root) NOPASSWD: /usr/bin/systemctl $a lcc-reports, /usr/bin/systemctl $a lcc-reports.service"; done > /etc/sudoers.d/lcc-reports
chmod 440 /etc/sudoers.d/lcc-reports && visudo -cf /etc/sudoers.d/lcc-reports
systemctl daemon-reload
systemctl enable --now lcc-reports.service

# public hostname on the perchito tunnel (the unit reads /etc/cloudflared/config.yml, not ~/.cloudflared)
CF=/etc/cloudflared/config.yml
if ! grep -q 'lcc.perchito.app' $CF; then
  cp $CF $CF.bak-lcc-reports
  sed -i 's|^  - service: http_status:404|  - hostname: lcc.perchito.app\n    service: http://localhost:4630\n  - service: http_status:404|' $CF
  sudo -u perchito cloudflared tunnel route dns perchito lcc.perchito.app || true
  systemctl restart cloudflared
fi

echo
sudo -u perchito bash -c 'set -a; . ./.env; node scripts/create-user.mjs "$0" "$1" admin' "$ADMIN_EMAIL" "$ADMIN_NAME"
echo "Local: http://127.0.0.1:4630 — public at https://lcc.perchito.app once the tunnel route is added."
