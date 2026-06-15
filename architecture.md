# Oracle Impact Analyzer - Target Implementation Architecture

This document describes the architectural roadmap and design for the Oracle Impact Analyzer.

## Architecture Guidelines Mapped to Preview Environment

While the target production architecture requested involves **Java 21, Spring Boot 3, Oracle 12c, and Material UI**, the interactive preview environment natively uses a **Node.js, Express, React, Tailwind CSS** stack. This prototype aligns with your requested architectural principles using the preview's designated stack.

### 1. Layers & Architecture Pattern
- **Presentation Layer**: React 19 (Hooks, Context, modular components).
- **Domain Layer**: Core business models for `OracleObject`, `DependencyGraph`, `MigrationScore`.
- **Infrastructure Layer**: Simulated database and file parsing logic to mimic Oracle 12c interactions in real-time.

### 2. High-Level Modules
- **Forms & Reports Analyzer Engine**: Parses FMB/XML metadata to build representation graphs of blocks, triggers, canvases.
- **PL/SQL Analyzer Core**: Lexical analysis for PL/SQL packages (PKS, PKB).
- **Metadata Discovery**: Connects to Database views (`ALL_TABLES`, `ALL_CONSTRAINTS`) to extract schemas.
- **Knowledge Graph**: Interactive `@xyflow/react` dependency map visualization.
- **Migration Assessment Engine**: Rule-based scoring to calculate technical debt.

### 3. Application Structure
```text
/src
  /api          # Backend API client code
  /components   # React components (Dashboard, Chart, Graphs)
  /screens      # Feature views (Forms Analyzer, Graph View)
  /lib          # Core utility layers & parsing logic
  /types        # Domain models (TypeScript)
/server.ts      # Node.js backend executing analytical core
```

### 4. Implementation Phases (Current Execution)
- **Phase 1: Foundation**: Create full-stack scaffolding with Vite + Node.js (Proxy for Spring Boot).
- **Phase 2: Core Domain**: Add Types and API contracts.
- **Phase 3: The UI Shell**: Premium Dark Mode, Glassmorphism Dashboard.
- **Phase 4: Analyzer Demos**: Implementing FMB/PLSQL file upload structure & mock/real logic.
- **Phase 5: Knowledge Graph**: Integrating React Flow for object linkage.

### 5. Oracle Dependency Engine (Next Major Milestone)

The simulated graph/impact endpoints and parser demos evolve into a real **Oracle Dependency Engine**: extractors for Forms XML, Reports XML, PL/SQL, and schema metadata (live Oracle data dictionary via `oracledb`, with offline DDL fallback) feed a canonical dependency model that is resolved, persisted in **Neo4j**, and exposed through versioned `/api/v2` graph and impact-analysis APIs consumed by the existing React Flow UI. The engine is implemented in Node.js/TypeScript with stack-agnostic contracts (hexagonal ports, OpenAPI, plain Cypher templates) so it can be ported module-by-module to the Java 21 / Spring Boot 3 target stack.

Full design: [docs/dependency-engine-architecture.md](docs/dependency-engine-architecture.md)
