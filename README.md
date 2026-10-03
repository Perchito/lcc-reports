# LCC Property Reports (PWA)

Web/PWA version of the Flutter app (github.com/Perchito/lcc-property-reports) for
LCC Bathrooms & Services Ltd. Same screens and workflow: the Admin opens a job
(property → materials → assign), employees take the 8 fixed before photos, do the
work, take the 8 after photos, generate the report and submit it; the Admin reviews.
Everything stays connected under a unique Job ID (LCC-2026-00001).

Install on a phone: open the site in Safari/Chrome → Share → **Add to Home Screen**.

- **Admin**: Open the Work, How It Was Before, Results, Older Reports (date filter),
  Team (add employees, reset passwords, deactivate — replaces the Firebase console),
  assign/reassign jobs, edit materials, Mark Reviewed.
- **Employee**: My Jobs (filters), Notifications, Profile (change password), job
  details, before/after photos, Report a Problem (with photo), report + Submit to Admin.
- Report: on-screen preview + PDF (pdfkit, server side), Download or Share (native share sheet).

Stack: Node + Express 5, Postgres (one `jobs` row per job, the job as JSONB in the
Flutter app's shape), photos in perchito-storage (`jobs/<id>/<room>_<before|after>.jpg`),
plain JS front end with no build step (`public/app.js`; `lib/jobs.mjs` is shared with the browser).
Every write is a targeted server-side change (one photo slot, one problem, the
materials list), so two people on the same job never overwrite each other.

## Run locally

```sh
npm install
cp .env.example .env            # set DATABASE_URL (+ HOME_STORAGE_* for photos)
psql "$DATABASE_URL" -f db/schema.sql
node scripts/create-user.mjs you@example.com "Your Name" admin   # prints a password
npm start                       # http://localhost:4630
npm test                        # self-checks
```

## Deploy (perchito)

One-off: `sudo bash setup-perchito.sh <admin-email> "<name>"` (database, storage project,
`.env`, systemd unit `lcc-reports`, backups registration). Public at https://lcc.perchito.app.
Updates: rsync the repo (without `.env`/`node_modules`), `npm ci --omit=dev`, `sudo systemctl restart lcc-reports`.
