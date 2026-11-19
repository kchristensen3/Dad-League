import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  onnotice: () => {},
});
export const db = drizzle(sql, { schema, casing: "snake_case" });
export type DB = typeof db;
export { schema };
