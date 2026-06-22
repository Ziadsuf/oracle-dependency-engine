import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createV2Router } from './index';
import type { CypherRunner } from '../../graph/neo4jClient';
import type { GraphRepository } from '../../graph/graphRepository';

// Builds an app with the v2 router over stubbed graph deps — exercises the
// HTTP layer (routing, validation, error mapping) without a real Neo4j.
function makeApp(overrides: { run?: CypherRunner['run']; repository?: Partial<GraphRepository> } = {}) {
  const runner: CypherRunner = {
    run: overrides.run ?? (async () => []),
    close: async () => {},
  };
  const repository = {
    clearGraph: async () => {},
    getIngestionRun: async () => null,
    ...overrides.repository,
  } as unknown as GraphRepository;

  const app = express();
  app.use(express.json());
  app.use('/api/v2', createV2Router({ runner, repository }));
  return app;
}

describe('createV2Router', () => {
  it('rejects ingestion with no file (400)', async () => {
    const res = await request(makeApp()).post('/api/v2/ingest/forms');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file uploaded/i);
  });

  it('clears the graph via DELETE /graph', async () => {
    let cleared = false;
    const app = makeApp({ repository: { clearGraph: async () => { cleared = true; } } });
    const res = await request(app).delete('/api/v2/graph');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cleared');
    expect(cleared).toBe(true);
  });

  it('rejects an invalid neighbor direction (400)', async () => {
    const res = await request(makeApp()).get('/api/v2/graph/nodes/x/neighbors?direction=sideways');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/direction/i);
  });

  it('rejects an invalid impact direction (400)', async () => {
    const res = await request(makeApp()).get('/api/v2/impact/x?direction=sideways');
    expect(res.status).toBe(400);
  });

  it('404s impact analysis for an unknown node (node-detail returns no rows)', async () => {
    const res = await request(makeApp({ run: async () => [] })).get('/api/v2/impact/table:HR.NOPE');
    expect(res.status).toBe(404);
  });

  it('503s live discovery when Oracle is not configured', async () => {
    // oracleConfigFromEnv() is null without ORACLE_CONNECT_STRING.
    const prev = process.env.ORACLE_CONNECT_STRING;
    delete process.env.ORACLE_CONNECT_STRING;
    try {
      const res = await request(makeApp()).post('/api/v2/ingest/discover').send({ schemas: [] });
      expect(res.status).toBe(503);
    } finally {
      if (prev !== undefined) process.env.ORACLE_CONNECT_STRING = prev;
    }
  });

  it('returns 404 for an unknown ingestion run', async () => {
    const res = await request(makeApp()).get('/api/v2/ingest/runs/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('createV2Router — API token auth', () => {
  const TOKEN = 'secret-test-token';
  let prev: string | undefined;
  beforeEach(() => { prev = process.env.API_TOKEN; process.env.API_TOKEN = TOKEN; });
  afterEach(() => { if (prev === undefined) delete process.env.API_TOKEN; else process.env.API_TOKEN = prev; });

  it('401s a mutating request with no token', async () => {
    const res = await request(makeApp()).delete('/api/v2/graph');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await request(makeApp()).post('/api/v2/ingest/schema').set('X-API-Key', 'nope');
    expect(res.status).toBe(401);
  });

  it('allows a mutation with a valid X-API-Key', async () => {
    let cleared = false;
    const app = makeApp({ repository: { clearGraph: async () => { cleared = true; } } });
    const res = await request(app).delete('/api/v2/graph').set('X-API-Key', TOKEN);
    expect(res.status).toBe(200);
    expect(cleared).toBe(true);
  });

  it('accepts a valid Bearer token (then reaches the no-file 400)', async () => {
    const res = await request(makeApp()).post('/api/v2/ingest/forms').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400); // passed auth, then "No file uploaded"
  });

  it('leaves read endpoints open even when a token is configured', async () => {
    const res = await request(makeApp({ run: async () => [] })).get('/api/v2/objects');
    expect(res.status).toBe(200);
  });
});
