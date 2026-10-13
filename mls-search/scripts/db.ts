// MySQL connection module (handbook Week 3).
// The pool is created on first use, so tests that don't touch the database never need MySQL running.
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Load the .env file at the repo root, no matter which folder the script is run from.
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

// Close the pool so command-line scripts can exit.
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}