import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';

export interface Database {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(work: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function postgresDatabase(connectionString: string, tlsMode: 'verify-full' | 'require' = 'verify-full'): Database {
  const verifiedUrl = new URL(connectionString);
  verifiedUrl.searchParams.set('sslmode', tlsMode);
  verifiedUrl.searchParams.set('uselibpqcompat', 'true');
  const pool = new Pool({ connectionString: verifiedUrl.toString(), max: 8, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  return {
    async query<T>(sql: string, values?: unknown[]) { return { rows: (await pool.query(sql, values)).rows as T[] }; },
    async transaction<T>(work: (db: Database) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const db: Database = {
          async query<R>(sql: string, values?: unknown[]) { return { rows: (await client.query(sql, values)).rows as R[] }; },
          transaction: async nested => nested(db), close: async () => {},
        };
        const value = await work(db); await client.query('COMMIT'); return value;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
}

/** Real embedded PostgreSQL for local demo/tests, explicitly without TimescaleDB. */
export function localDatabase(directory?: string): Database {
  const pg = new PGlite(directory);
  return {
    query: (sql, values) => pg.query(sql, values),
    transaction: work => pg.transaction(async tx => {
      const db: Database = { query: (sql, values) => tx.query(sql, values), transaction: async nested => nested(db), close: async () => {} };
      return work(db);
    }),
    close: () => pg.close(),
  };
}

export async function migrate(db: Database, timescale = true) {
  // Each file is transactional and repeatable; only apply Timescale in the configured cloud DB.
  for (const name of timescale ? ['001_schema.sql', '002_timescale.sql'] : ['001_schema.sql']) {
    const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
    await db.transaction(async tx => {
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.query(statement);
    });
  }
}
