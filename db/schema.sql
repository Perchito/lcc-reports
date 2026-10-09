-- LCC Property Reports — Postgres schema. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text not null,
  role       text not null check (role in ('admin', 'employee')),
  pass_hash  text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_idx on users (lower(email));

-- personal login link (scripts/login-link.mjs): sha256 of the secret code in /l/<code>
alter table users add column if not exists login_link_hash text;

create table if not exists sessions (
  token_hash text primary key,  -- sha256 of the cookie value
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

-- One row per job, keyed by the Job ID (LCC-2026-00001). `data` holds the whole
-- job in the same shape the Flutter app used (property, materials, photos, problems).
create table if not exists jobs (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists jobs_assigned_idx on jobs (lower(data->>'assignedTo'));

-- 2026-10 redesign: every material line gets an id so it can be edited/removed on its own
-- (needed for offline edits). Only touches lines without one; safe to re-run.
update jobs set data = jsonb_set(data, '{materials}', (
  select jsonb_object_agg(area, (
    select coalesce(jsonb_agg(case when m ? 'id' then m
      else m || jsonb_build_object('id', left(replace(gen_random_uuid()::text, '-', ''), 16)) end), '[]'::jsonb)
    from jsonb_array_elements(items) m))
  from jsonb_each(data->'materials') e(area, items)))
where exists (select 1 from jsonb_each(data->'materials') e(area, items), jsonb_array_elements(items) m where not m ? 'id');

-- push notifications: one row per phone/browser that turned them on
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  keys       jsonb not null,  -- {p256dh, auth}
  created_at timestamptz not null default now()
);
