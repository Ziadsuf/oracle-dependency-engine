# Oracle Impact Analyzer — Dependency Engine

Analyze legacy Oracle systems (Forms 6i, Reports 6i, PL/SQL packages, and schema objects), build a **dependency graph in Neo4j**, and compute the **blast radius / migration risk** of changing any object.

It parses real artifacts (Forms XML, Reports XML, PL/SQL, DDL) and the live Oracle data dictionary into one canonical graph, then exposes graph + impact-analysis APIs consumed by a React Flow UI.

> Architecture details: [docs/dependency-engine-architecture.md](docs/dependency-engine-architecture.md)

## Features

- **Ingestion** — Forms XML, Reports XML, PL/SQL (`.pks`/`.pkb`/`.sql`), Oracle DDL scripts, and **live Oracle discovery** (`ALL_OBJECTS` / `ALL_DEPENDENCIES` via the `oracledb` thin driver).
- **Canonical dependency model** — deterministic IDs, confidence-scored edges (1.0 dictionary · 0.8 parsed static SQL · 0.4 dynamic SQL), unresolved-reference tracking with automatic re-resolution.
- **Neo4j persistence** — idempotent `MERGE` ingestion, provenance per ingestion run.
- **Impact analysis** — variable-depth blast-radius traversal with a computed, tunable risk score (type weights × depth decay × confidence).
- **React Flow visualization** — knowledge graph with dagre layout, progressive expansion, type filters, impact mode.
- **100% source fidelity** — "Replace graph" wipes before ingest so the graph reflects exactly the uploaded source.

## Tech stack

React 19 · @xyflow/react (React Flow) · Vite · Express · TypeScript · Neo4j 5 (`neo4j-driver`) · Oracle (`oracledb`, thin mode) · Vitest.

The engine is implemented in Node/TypeScript with stack-agnostic contracts (hexagonal ports, portable `.cypher` templates) so it can be ported to the documented Java 21 / Spring Boot 3 target.

## Prerequisites

- Node.js 20+
- Docker (for the local Neo4j container)
- *(optional)* An Oracle 12.1+ database for live discovery — Forms/Reports/PL-SQL/DDL ingestion works without it.

## Quick start

```bash
npm install
cp .env.example .env.local          # then adjust values
docker compose up -d                 # starts Neo4j 5 on 7474/7687
npm run dev                          # serves on http://localhost:3000 (or PORT)
```

Open the app, go to **Metadata Discovery → DDL Upload**, and drop a `.sql` file (e.g. [samples/hr_schema.sql](samples/hr_schema.sql)). Then explore **Knowledge Graph** and **Impact Analysis**.

### Configuration (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | Graph store (defaults match `docker-compose.yml`). Unset `NEO4J_URI` to run analyzers without the graph. |
| `ORACLE_USER` / `ORACLE_PASSWORD` / `ORACLE_CONNECT_STRING` | Optional live Oracle discovery (read-only). |
| `IMPACT_MAX_DEPTH` | Max impact traversal depth (default 8). |
| `PORT` | HTTP port (default 3000). |

## API (`/api/v2`)

| Endpoint | Purpose |
|---|---|
| `POST /ingest/{forms\|reports\|plsql\|schema}` | Ingest an uploaded artifact. |
| `POST /ingest/discover` | Live Oracle discovery (`{ "schemas": [...] }`). |
| `DELETE /graph` | Wipe the graph (used by "Replace graph"). |
| `GET /graph?types=&schema=&search=&limit=` | Windowed subgraph in React-Flow shape. |
| `GET /graph/nodes/:id` · `/neighbors` | Node detail / progressive expansion. |
| `GET /objects?search=&type=&page=` | Paginated object search. |
| `GET /discovery/summary` | Object counts, schemas, effort estimate. |
| `GET /impact/:id?depth=&direction=` | Blast radius + risk score. |
| `GET /impact/:id/paths?to=:id` | Shortest dependency path between two objects. |
| `GET /stats` | Engine + dashboard stats. |

## Testing

```bash
npm run lint                         # tsc --noEmit
npm test                             # vitest (unit)
# integration tests run automatically when NEO4J_URI is set:
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=oracleimpact npm test
```

## Samples & utilities

- `samples/hr_schema.sql`, `samples/oracle_demo_schema.sql` — ready-to-upload DDL.
- `samples/*_form.xml`, `samples/*_report.xml`, `samples/hr_pkg.pkb` — Forms/Reports/PL-SQL examples.
- `samples/oracle_probe.ts` — read-only Oracle connectivity/survey probe (`npx tsx samples/oracle_probe.ts`).
- `samples/extract_ddl.ts` / `extract_all_tables.ts` — export real DDL from a live Oracle DB into `.sql` for upload.

## Project layout

```
server/
  domain/        canonical model + IDs (+ JSON Schema)
  extractors/    forms · reports · plsql · schema (live Oracle + DDL)
  resolution/    catalog + reference resolver
  graph/         GraphRepository port, Neo4j adapter, cypher/ templates, query services
  impact/        blast-radius traversal + risk scoring
  ingestion/     extract → resolve → persist pipeline
  api/v2/        REST routes
src/             React 19 + React Flow UI
docs/            architecture
samples/         example artifacts + utilities
```
