/** Applies pending SQL migrations. Railway runs this as the pre-deploy command. */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client.js";

// SQL migrations are generated into the source tree (npm run db:generate) and copied
// into the image as-is, so they're found relative to the app root in dev and in prod.
const migrationsFolder = path.resolve(process.cwd(), "server/db/migrations");

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => console.log("migrations applied"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
