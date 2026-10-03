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
