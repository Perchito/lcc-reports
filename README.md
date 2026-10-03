# LCC Property Reports

iPhone-first field-service PWA for **LCC Bathrooms & Services Ltd**. The admin opens a job,
assigns it, and the employee works through it on their phone: **start → 8 before photos →
materials → problems → 8 after photos → review → submit**. The admin reviews the finished
property condition / completion report (on screen and as a PDF). Everything stays connected
under a unique Job ID (`LCC-2026-00001`). Works offline.

Originally a Flutter app (github.com/Perchito/lcc-property-reports); this is the web version.

## Stack

- **Server:** Node + Express 5 (`server.mjs`), Postgres, perchito-storage for photos
  (`lib/home-storage.mjs`), PDFKit for the report PDF (`lib/pdf.mjs`), systemd on perchito.
- **Front end:** plain ES modules, no framework, no build step (`public/`). The job model
  (`lib/jobs.mjs`) is shared by the server and the browser (served as `/jobs.mjs`).

| File | What it does |
|---|---|
| `lib/jobs.mjs` | Constants (8 photo rooms, material areas/units/statuses, problem types, statuses), validation, and the **single source of truth for progress**: `progress()`, `displayStatus()`, `nextStep()`, `reviewChecklist()` |
| `public/app.js` | App shell (header, bottom tabs / desktop sidebar, fixed action bar), hash router, login, More, Sync status, Notifications |
| `public/store.js` | Offline store + sync engine (IndexedDB cache, outbox, photo blobs) |
| `public/ui.js` | Design-system helpers: status chips, bottom sheets, confirmations, photo viewer, toasts, skeletons, camera capture + compression |
| `public/home.js` | Employee home (continue job, your work, quick actions) and admin dashboard |
| `public/lists.js` | Jobs (search, filter chips, cards; sortable table for admins on desktop), Reports, notification events |
| `public/job.js` | Job details, guided photo capture, materials, problems, review & submit, report ready, report detail, PDF download/share |
| `public/admin.js` | New job, edit job / assign, Team (logins) |
| `public/style.css` | Tokens + components + responsive layout (320px → 1440px+) |
| `public/sw.js` | Service worker |

## Routes

`#/home` · `#/jobs` · `#/jobs/:id` · `#/jobs/:id/photos/before` · `#/jobs/:id/photos/after` ·
`#/jobs/:id/materials` · `#/jobs/:id/problems` · `#/jobs/:id/problems/new` · `#/jobs/:id/review` ·
`#/jobs/:id/done` · `#/reports` · `#/reports/:id` · `#/report-problem` · `#/notifications` · `#/sync` · `#/more`
Admin only: `#/new` · `#/jobs/:id/edit` · `#/team`. Links from the first version (`#/job/...`) redirect.

Navigation: phones and tablets get a bottom tab bar (Home · Jobs · Reports · More) on top-level
screens; focused screens (photo capture, materials, review, …) hide it and show Back. From
1024px a sidebar replaces the tabs and admins get a sortable jobs table.

## Photo spots

Each job has its own list of photo spots (`job.rooms`); one before and one after photo per spot,
paired by name. The admin sets them when creating the job (starts with the standard 8: remove any,
add your own, "Standard 8" / "Clear all"). On site anyone working on the job can add a spot, or remove
one that has no photos yet, from the photo screen ("Add or remove") — offline too. Counts, progress,
the review checklist, the report and the PDF all follow the job's list. Jobs created before this
existed (no `rooms` field) keep the standard 8. API: `POST /api/jobs/:id/rooms {name}`,
`DELETE /api/jobs/:id/rooms/:slug`; photo URLs use the spot's slug (a number still works for old clients).

## Offline & sync

- After sign-in, the user's jobs are cached in **IndexedDB** (keyed by user, wiped on sign-out).
  The app opens and works with no signal: browse jobs, take photos, add/edit materials, report
  problems, start/submit jobs.
- Every change goes into an **outbox** in IndexedDB first. Photos are compressed on the phone
  (1920px, JPEG 0.82) and stored as blobs before any upload. Screens show *server copy + waiting
  changes*, so offline work appears straight away and survives closing the app.
- The outbox is replayed in order when the server is reachable (checked with `GET /api/health`,
  not just `navigator.onLine`), with back-off. Every write is idempotent (photo slots, ids made on
  the phone for materials and problems), so a resend never duplicates anything.
- A change the server refuses for good is **kept** and shown under *Sync status* with Retry /
  Discard — nothing is dropped silently. Signing out with unsent changes warns first.
- The sync pill (header, or sidebar on desktop) shows Synced / Syncing / Offline / N waiting /
  N not sent and opens the Sync status screen (connection, last sync, waiting photos/changes, Sync now).
- **New jobs work offline too.** A job created with no signal gets a temporary `NEW-…` id
  (shown as "Job ID on sync"); everything done to it is queued behind it. When it reaches the
  server it gets its real `LCC-YYYY-NNNNN` number, the queued changes move over, and the screen
  follows. A phone-made `clientId` means a resend returns the same job instead of a duplicate.
  The employee list is kept on the device so jobs can be assigned offline.
- **Drafts:** the new-job form, edit-job form and problem report (text *and* photo) are saved on
  the device as you type, per user, and restored if the app is closed. Wiped on sign-out.
- Team and PDF generation need a connection; the app says so clearly.

**Service worker:** app shell (versioned `?v=` files, font, icons) cache-first, refreshed on every
deploy; page navigation network-first with the cached shell offline; photos (`/api/jobs/:id/files/…`)
cache-first; all other `/api` responses are never cached by the service worker.

## API

All JSON, cookie session (`lcc_session`). Admins see every job; employees only jobs assigned to their email.

- `POST /api/login`, `POST /api/logout`, `GET /api/me`, `POST /api/password`, `GET /api/health`
- `GET/POST /api/users`, `PATCH /api/users/:id` (admin: add, reset password, (de)activate)
- `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs` (admin), `PATCH /api/jobs/:id`
  (whitelisted fields per role; stamps `reviewedAt` / `assignedAt`)
- `PUT|DELETE /api/jobs/:id/photos/:room(0-7)/:type(before|after)` (raw JPEG body)
- `POST /api/jobs/:id/materials`, `PATCH|DELETE /api/jobs/:id/materials/:mid` — employees can add and
  edit materials; they can delete only the ones they added
- `PUT /api/jobs/:id/files/problem?pid=…` (problem photo), `POST /api/jobs/:id/problems`
- `GET /api/jobs/:id/files/:file` (photo), `GET /api/jobs/:id/pdf` (PDFKit report)
- `GET /api/push/key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`

## Push notifications

Web push (`lib/push.mjs`, `web-push` library, VAPID keys in `.env`). Sent when a job is assigned
(to the employee), a report is submitted (to admins), a problem is reported (to admins) and a
report is reviewed (to the employee) — never to the person who did it. Tapping one opens the job
or report. Turn on from Home (one-time card) or More → Push notifications. **On iPhone this only
works in the app added to the Home Screen (iOS 16.4+)**; Android and desktop browsers work in the
browser too. Subscriptions of uninstalled apps are removed automatically. Signing out stops that
phone's notifications.

## Database

`db/schema.sql` is idempotent and runs on every deploy. Jobs are one row each (`jobs.data` JSONB,
same shape as the Flutter app). **Migrations (2026-10):** every material line gets an `id` (only lines
without one are touched; existing data is kept); new table `push_subscriptions`. New environment
variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (push; `setup-perchito.sh` generates them).

## Run locally

```sh
npm install
cp .env.example .env            # DATABASE_URL, HOME_STORAGE_URL/PROJECT/KEY
psql "$DATABASE_URL" -f db/schema.sql
node scripts/create-user.mjs you@example.com "Your Name" admin          # prints a password
node scripts/create-user.mjs worker@example.com "Worker Name" employee
npm start                       # http://localhost:4630
npm test                        # self-checks (auth, job model, progress rules)
```

## Deploy (perchito)

One-off: `sudo bash setup-perchito.sh <admin-email> "<name>"` (database, storage project, `.env`,
systemd unit `lcc-reports`, tunnel hostname, backups registration). Public at https://lcc.perchito.app.
Updates: `./deploy.sh` (rsync without `.env`/`node_modules`, `npm ci`, schema, restart).

## Testing

- **Workflow:** sign in as an admin, create a job and assign an employee; sign in as the employee
  (another browser/profile), Start job → 8 before photos → add a material → report a problem with
  a photo → 8 after photos → Review → Submit → Report ready → Download / Share. As admin: Reports →
  open it → Mark reviewed.
- **Offline:** load the job online, then switch on aeroplane mode (or DevTools → Offline). Take the
  after photos, add a material, report a problem. Close the app completely and reopen it — the job,
  photos and "unfinished work saved on this device" notice are still there, the pill shows
  *Offline · N waiting*. Turn the connection back on: it syncs by itself (or tap *Sync now*); check
  the job on another device / as admin.
- **iPhone:** open https://lcc.perchito.app in Safari → Share → *Add to Home Screen*. Launch it from
  the Home Screen and run the workflow above, including the camera, keyboard (fields never zoom),
  back swipes, offline + reopen, PDF download and the share sheet.
- **Sizes:** 320 / 375 / 390 / 393 / 414 / 430 / 768 / 1024 / 1280px+: no sideways scrolling, nothing
  under the home indicator or notch, bottom tabs ↔ sidebar at 1024px.

## Known limits

- PDFs are made by the server (PDFKit), so they need a connection; offline the full report is
  readable on screen and the PDF is ready as soon as the job has synced.
- The Team page (creating logins) needs a connection.
- iPhone push notifications need the Home Screen app on iOS 16.4 or later.
- "Properties" are part of each job (address, key safe, person in charge) — there is no separate
  property list.
