import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Fresh schema in the e2e database before each run. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/dadleague_e2e";
  const admin = postgres(url.replace(/\/[^/]+$/, "/postgres"), { onnotice: () => {} });
  const name = new URL(url).pathname.slice(1);
  const exists = await admin`select 1 from pg_database where datname = ${name}`;
  if (exists.length === 0) await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const sql = postgres(url, { onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(import.meta.dirname, "../server/db/migrations") });
  await sql.end();
}
