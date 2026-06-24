#!/usr/bin/env node
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const [usernameArg, passwordArg, displayNameArg = 'Admin User'] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

if (!usernameArg || !passwordArg) {
  console.error('Usage: node scripts/create-admin-user.mjs <username> <password> [displayName]');
  process.exit(1);
}

const username = usernameArg.trim().toLowerCase();
const passwordHash = await bcrypt.hash(passwordArg, 12);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const result = await pool.query(
    `INSERT INTO local_users (username, "passwordHash", "displayName", role, "isActive", "mustChangePassword")
     VALUES ($1, $2, $3, 'admin', true, false)
     ON CONFLICT (username) DO UPDATE SET
       "passwordHash" = EXCLUDED."passwordHash",
       "displayName" = EXCLUDED."displayName",
       role = 'admin',
       "isActive" = true,
       "mustChangePassword" = false,
       "updatedAt" = now()
     RETURNING id, username, "displayName", role`,
    [username, passwordHash, displayNameArg]
  );
  console.log('Admin user ready:', result.rows[0]);
} finally {
  await pool.end();
}
