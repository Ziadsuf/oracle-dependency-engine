// Thin lifecycle wrapper around the official neo4j-driver. The only file in
// the codebase that imports the driver directly.

import neo4j, { type Driver } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

/** Returns null when NEO4J_URI is unset — the engine then runs without a graph. */
export function neo4jConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Neo4jConfig | null {
  if (!env.NEO4J_URI) return null;
  return {
    uri: env.NEO4J_URI,
    user: env.NEO4J_USER ?? 'neo4j',
    password: env.NEO4J_PASSWORD ?? '',
    database: env.NEO4J_DATABASE,
  };
}

/** Minimal query-execution contract the repository depends on (mockable in tests). */
export interface CypherRunner {
  run(query: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export class Neo4jClient implements CypherRunner {
  private readonly driver: Driver;
  private readonly database?: string;

  constructor(config: Neo4jConfig) {
    // disableLosslessIntegers: counts come back as JS numbers, not Integer objects
    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
      disableLosslessIntegers: true,
    });
    this.database = config.database;
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity(this.database ? { database: this.database } : undefined);
  }

  async run(query: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const session = this.driver.session(this.database ? { database: this.database } : undefined);
    try {
      const result = await session.run(query, params);
      return result.records.map((record) => record.toObject());
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
