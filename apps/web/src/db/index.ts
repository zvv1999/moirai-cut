import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { webEnv } from "@/env/web";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (!_db) {
		if (!webEnv.DATABASE_URL) {
			throw new Error(
				"Database-backed features require DATABASE_URL. The local editor does not require a database.",
			);
		}
		const client = postgres(webEnv.DATABASE_URL);
		_db = drizzle(client, { schema });
	}

	return _db;
}

export * from "./schema";
