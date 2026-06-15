// MetadataSource port: how the engine acquires Oracle schema metadata.
// Implementations: LiveOracleSource (oracledb, data dictionary) and
// DdlFileSource (offline DDL scripts).

import type { ExtractionFragment } from '../types';

export interface DiscoverOptions {
  /** Schemas to discover; empty/omitted = current schema only (live source). */
  schemas?: string[];
  defaultSchema?: string | null;
}

export interface MetadataSource {
  discover(options?: DiscoverOptions): Promise<ExtractionFragment>;
}
