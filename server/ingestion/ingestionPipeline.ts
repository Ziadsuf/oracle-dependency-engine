// Ingestion pipeline: orchestrates extract → resolve → persist with
// IngestionRun provenance, then re-resolves previously unresolved references
// against the now-richer catalog.

import { randomUUID } from 'crypto';
import { dedupeEdges, type IngestionStats, type SourceType } from '../domain/model';
import type { GraphRepository } from '../graph/graphRepository';
import type { ExtractionFragment } from '../extractors/types';
import { ObjectCatalog } from '../resolution/catalog';
import { resolveFragment } from '../resolution/resolver';

export interface IngestionRequest {
  artifact: string; // file name or 'LIVE_CONNECTION'
  source: SourceType;
  defaultSchema?: string | null;
  extract: () => ExtractionFragment | Promise<ExtractionFragment>;
}

export interface IngestionResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED';
  stats: IngestionStats & { resolvedRefs: number; reresolved: number };
}

export class IngestionPipeline {
  constructor(private readonly repository: GraphRepository) {}

  async run(request: IngestionRequest): Promise<IngestionResult> {
    const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
    await this.repository.createIngestionRun({
      id: runId,
      startedAt: new Date().toISOString(),
      source: request.source,
      fileName: request.artifact,
      status: 'RUNNING',
    });

    try {
      const fragment = await request.extract();
      for (const node of fragment.nodes) {
        node.source = node.source.map((s) => ({ ...s, runId }));
      }

      // Catalog = everything already in the graph + this fragment's own nodes
      const [existing, synonymTargets] = await Promise.all([
        this.repository.getCatalogEntries(),
        this.repository.getSynonymTargets(),
      ]);
      const catalog = new ObjectCatalog(existing, synonymTargets);
      for (const node of fragment.nodes) {
        if (node.type !== 'unresolved') {
          catalog.add({ id: node.id, type: node.type, schema: node.schema, name: node.name });
        }
      }
      // Synonym targets declared in this very fragment (SYNONYM_FOR refs are
      // resolved below, so only previously persisted targets chase here).

      const resolution = resolveFragment(fragment, catalog, {
        defaultSchema: request.defaultSchema ?? null,
        artifact: request.artifact,
      });

      const nodesUpserted = await this.repository.upsertNodes(
        [...fragment.nodes, ...resolution.unresolvedNodes],
        runId
      );
      const edgesUpserted = await this.repository.upsertEdges(
        dedupeEdges([...fragment.edges, ...resolution.edges])
      );

      // Re-resolution: earlier runs may have produced UnresolvedRef nodes that
      // this run's objects can now satisfy.
      const reresolved = await this.reresolve(catalog);

      const stats: IngestionStats = {
        nodesUpserted,
        edgesUpserted,
        unresolvedRefs: resolution.unresolvedCount,
      };
      await this.repository.finishIngestionRun(runId, 'COMPLETED', stats);
      return {
        runId,
        status: 'COMPLETED',
        stats: { ...stats, resolvedRefs: resolution.resolvedCount, reresolved },
      };
    } catch (error) {
      await this.repository
        .finishIngestionRun(runId, 'FAILED', { nodesUpserted: 0, edgesUpserted: 0, unresolvedRefs: 0 })
        .catch(() => {});
      throw error;
    }
  }

  private async reresolve(catalog: ObjectCatalog): Promise<number> {
    const unresolved = await this.repository.getUnresolved();
    if (unresolved.length === 0) return 0;
    const mappings = unresolved.flatMap((u) => {
      const kind = (u.kind as 'TABLE_OR_VIEW' | 'CALL' | 'SEQUENCE' | 'ANY' | undefined) ?? 'ANY';
      const target = catalog.resolve(u.name, kind);
      return target ? [{ unresolvedId: u.id, targetId: target.id }] : [];
    });
    if (mappings.length === 0) return 0;
    return this.repository.reresolveUnresolved(mappings);
  }
}
