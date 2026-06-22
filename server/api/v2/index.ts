// /api/v2 — Dependency Engine REST endpoints (graph, impact, objects, stats,
// ingestion). Mounted by server.ts only when Neo4j is connected.

import { Router } from 'express';
import multer from 'multer';
import type { GraphRepository } from '../../graph/graphRepository';
import type { CypherRunner } from '../../graph/neo4jClient';
import { GraphQueryService, type Direction } from '../../graph/graphQueryService';
import { ImpactAnalysisService } from '../../impact/impactService';
import { IngestionPipeline } from '../../ingestion/ingestionPipeline';
import { FormsExtractor } from '../../extractors/forms/formsExtractor';
import { ReportsExtractor } from '../../extractors/reports/reportsExtractor';
import { PlsqlExtractor } from '../../extractors/plsql/plsqlExtractor';
import { DdlFileSource } from '../../extractors/schema/ddlFileSource';
import { LiveOracleSource, oracleConfigFromEnv } from '../../extractors/schema/liveOracleSource';
import type { SourceType } from '../../domain/model';
import type { ExtractionFragment } from '../../extractors/types';
import { MAX_UPLOAD_BYTES } from '../../config';
import { errorMessage } from '../../util/errors';
import { createApiAuth } from '../../middleware/apiAuth';
import { createGeneralLimiter, createIngestLimiter } from '../../middleware/rateLimit';

// Cap uploaded artifacts (held in memory) to avoid memory-exhaustion DoS.
// Errors bubble up to the app-level MulterError handler in server.ts (→ 413).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function csv(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function createV2Router(deps: { runner: CypherRunner; repository: GraphRepository }): Router {
  const router = Router();
  const graphQuery = new GraphQueryService(deps.runner);
  const impact = new ImpactAnalysisService(deps.runner);
  const pipeline = new IngestionPipeline(deps.repository);

  // Rate limit the whole surface; auth (when API_TOKEN is set) guards the
  // mutating endpoints; ingest/discovery also get a stricter rate limit.
  const auth = createApiAuth();
  router.use(createGeneralLimiter());
  const ingestLimiter = createIngestLimiter();

  // ---- Graph APIs -----------------------------------------------------------

  router.get('/graph', async (req, res) => {
    try {
      const data = await graphQuery.getGraphWindow({
        types: csv(req.query.types),
        schema: str(req.query.schema),
        search: str(req.query.search),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // Wipe the whole graph — used by "Replace graph" so an upload reflects exactly one file.
  router.delete('/graph', auth.requireToken, async (req, res) => {
    try {
      await deps.repository.clearGraph();
      res.json({ status: 'cleared' });
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/graph/nodes/:id', async (req, res) => {
    try {
      const detail = await graphQuery.getNodeDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: `Unknown object: ${req.params.id}` });
      res.json(detail);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/graph/nodes/:id/neighbors', async (req, res) => {
    try {
      const direction = (str(req.query.direction) ?? 'both') as Direction;
      if (!['in', 'out', 'both'].includes(direction)) {
        return res.status(400).json({ error: `direction must be in|out|both` });
      }
      const data = await graphQuery.getNeighbors(req.params.id, direction, req.query.depth ? Number(req.query.depth) : 1);
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/objects', async (req, res) => {
    try {
      const result = await graphQuery.searchObjects({
        search: str(req.query.search),
        type: str(req.query.type),
        schema: str(req.query.schema),
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/discovery/summary', async (req, res) => {
    try {
      const summary = await graphQuery.getDiscoverySummary(
        str(req.query.schema),
        req.query.limit ? Number(req.query.limit) : undefined
      );
      res.json(summary);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      const stats = await graphQuery.getEngineStats();
      const valid = stats.totalNodes - stats.invalidObjects - stats.unresolvedRefs;
      const migrationReadiness = stats.totalNodes === 0 ? 0 : Math.round((valid / stats.totalNodes) * 100);
      const debtRatio = stats.totalNodes === 0 ? 0 : (stats.invalidObjects + stats.unresolvedRefs) / stats.totalNodes;
      res.json({
        ...stats,
        // DashboardStats-compatible projection
        totalForms: stats.byType.form ?? 0,
        totalReports: stats.byType.report ?? 0,
        totalPackages: (stats.byType.package ?? 0) + (stats.byType.packagebody ?? 0),
        totalTables: stats.byType.table ?? 0,
        migrationReadiness,
        technicalDebt: debtRatio > 0.25 ? 'Critical' : debtRatio > 0.12 ? 'High' : debtRatio > 0.05 ? 'Medium' : 'Low',
      });
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // ---- Impact APIs ----------------------------------------------------------

  router.get('/impact/:id/paths', async (req, res) => {
    try {
      const to = str(req.query.to);
      if (!to) return res.status(400).json({ error: 'Query parameter "to" is required' });
      res.json({ paths: await impact.findPaths(req.params.id, to) });
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.get('/impact/:id', async (req, res) => {
    try {
      const direction = str(req.query.direction) as 'upstream' | 'downstream' | 'both' | undefined;
      if (direction && !['upstream', 'downstream', 'both'].includes(direction)) {
        return res.status(400).json({ error: 'direction must be upstream|downstream|both' });
      }
      const result = await impact.analyze(req.params.id, {
        depth: req.query.depth ? Number(req.query.depth) : undefined,
        direction,
      });
      if (!result) return res.status(404).json({ error: `Unknown object: ${req.params.id}` });
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // ---- Ingestion APIs -------------------------------------------------------

  const ingestUpload = (
    source: SourceType,
    extract: (fileName: string, buffer: Buffer, defaultSchema: string | null) => ExtractionFragment
  ) =>
    async (req: any, res: any) => {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const defaultSchema = str(req.body?.defaultSchema) ?? null;
      try {
        const result = await pipeline.run({
          artifact: file.originalname,
          source,
          defaultSchema,
          extract: () => extract(file.originalname, file.buffer, defaultSchema),
        });
        res.json(result);
      } catch (error: unknown) {
        res.status(422).json({ error: errorMessage(error) });
      }
    };

  const formsExtractor = new FormsExtractor();
  const reportsExtractor = new ReportsExtractor();
  const plsqlExtractor = new PlsqlExtractor();
  const ddlSource = new DdlFileSource();

  // Mutating ingest routes: auth (if enabled) + stricter rate limit, then upload.
  const ingestGuards = [auth.requireToken, ingestLimiter, upload.single('file')];

  router.post('/ingest/forms', ...ingestGuards, ingestUpload('FORMS_XML', (name, buffer, schema) =>
    formsExtractor.extract(name, buffer, { defaultSchema: schema })
  ));
  router.post('/ingest/reports', ...ingestGuards, ingestUpload('REPORTS_XML', (name, buffer, schema) =>
    reportsExtractor.extract(name, buffer, { defaultSchema: schema })
  ));
  router.post('/ingest/plsql', ...ingestGuards, ingestUpload('PLSQL_SOURCE', (name, buffer, schema) =>
    plsqlExtractor.extract(name, buffer.toString('utf-8'), { defaultSchema: schema })
  ));
  router.post('/ingest/schema', ...ingestGuards, ingestUpload('DDL_FILE', (name, buffer, schema) =>
    ddlSource.extract(name, buffer.toString('utf-8'), { defaultSchema: schema })
  ));

  router.post('/ingest/discover', auth.requireToken, ingestLimiter, async (req, res) => {
    const config = oracleConfigFromEnv();
    if (!config) {
      return res.status(503).json({
        error: 'Live Oracle discovery is not configured. Set ORACLE_USER, ORACLE_PASSWORD and ORACLE_CONNECT_STRING.',
      });
    }
    try {
      const schemas = Array.isArray(req.body?.schemas) ? req.body.schemas.map(String) : undefined;
      const source = new LiveOracleSource(config);
      const result = await pipeline.run({
        artifact: 'LIVE_CONNECTION',
        source: 'DICTIONARY',
        extract: () => source.discover({ schemas }),
      });
      res.json(result);
    } catch (error: unknown) {
      res.status(502).json({ error: `Oracle discovery failed: ${errorMessage(error)}` });
    }
  });

  router.get('/ingest/runs/:id', async (req, res) => {
    try {
      const run = await deps.repository.getIngestionRun(req.params.id);
      if (!run) return res.status(404).json({ error: `Unknown run: ${req.params.id}` });
      res.json(run);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  return router;
}
