// Personal login link: opening it logs the person in for a year, no password to type.
//   node scripts/login-link.mjs <email>            make (or replace) their link and print it once
//   node scripts/login-link.mjs <email> --revoke   kill the link and log them out everywhere
import pg from 'pg';
import { newToken, tokenHash } from '../lib/auth.mjs';

const [email, flag] = process.argv.slice(2);
if (!email) { console.error('usage: node scripts/login-link.mjs <email> [--revoke]'); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const code = flag === '--revoke' ? null : newToken();
const { rows: [u] } = await pool.query('update users set login_link_hash = $2 where lower(email) = lower($1) returning id',
  [email.trim(), code && tokenHash(code)]);
if (!u) { console.error(`No user ${email}`); process.exit(1); }
if (code) console.log(`${process.env.PUBLIC_URL || 'https://lcc.perchito.app'}/l/${code}`);
else { await pool.query('delete from sessions where user_id = $1', [u.id]); console.log(`Login link revoked and ${email} logged out`); }
await pool.end();
