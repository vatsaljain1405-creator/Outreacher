import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

let dbUrl = process.env.DATABASE_URL || "file:mailmerge.db";
if (dbUrl.startsWith("postgres:") || dbUrl.startsWith("postgresql:")) {
  console.log("[Database] PostgreSQL connection URL ignored. Falling back to local SQLite: file:mailmerge.db");
  dbUrl = "file:mailmerge.db";
}

const client = createClient({
  url: dbUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
