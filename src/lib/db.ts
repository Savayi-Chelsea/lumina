import "server-only";
import { Pool } from "pg";

const databaseGlobal = globalThis as typeof globalThis & { luminaPool?: Pool };

export function database() {
  if (!databaseGlobal.luminaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString && (!process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD || !process.env.POSTGRES_DB)) {
      throw new Error("Database configuration unavailable");
    }
    const pool = new Pool({
      ...(connectionString ? { connectionString } : {
        host: process.env.POSTGRES_HOST || "localhost",
        port: Number(process.env.POSTGRES_PORT || "5432"),
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
      }),
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
    });
    pool.on("error", (error) => console.error("Authentication database connection failed", error.name));
    databaseGlobal.luminaPool = pool;
  }
  return databaseGlobal.luminaPool;
}
