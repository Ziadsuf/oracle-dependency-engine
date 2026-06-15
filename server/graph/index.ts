import { Neo4jClient, neo4jConfigFromEnv, type CypherRunner } from './neo4jClient';
import { Neo4jGraphRepository } from './neo4jGraphRepository';
import type { GraphRepository } from './graphRepository';

export type { GraphRepository, GraphStats } from './graphRepository';

export interface GraphEngine {
  repository: GraphRepository;
  runner: CypherRunner;
}

/**
 * Connects to Neo4j from NEO4J_* env vars and bootstraps the graph schema.
 * Returns null when NEO4J_URI is unset (engine runs without a graph);
 * throws when configured but unreachable so callers can degrade explicitly.
 */
export async function connectGraphEngineFromEnv(): Promise<GraphEngine | null> {
  const config = neo4jConfigFromEnv();
  if (!config) return null;
  const client = new Neo4jClient(config);
  await client.verifyConnectivity();
  const repository = new Neo4jGraphRepository(client);
  await repository.ensureSchema();
  return { repository, runner: client };
}
