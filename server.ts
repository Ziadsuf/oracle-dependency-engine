import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"], quiet: true });

import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { FormsAnalyzerService } from "./server/services/formsParser";
import { PlsqlAnalyzerService } from "./server/services/plsqlParser";
import { ReportsAnalyzerService } from "./server/services/reportsParser";
import { connectGraphEngineFromEnv, type GraphEngine } from "./server/graph";
import { createV2Router } from "./server/api/v2";

const upload = multer({ storage: multer.memoryStorage() });
const formsAnalyzerService = new FormsAnalyzerService();
const plsqlAnalyzerService = new PlsqlAnalyzerService();
const reportsAnalyzerService = new ReportsAnalyzerService();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Dependency Engine graph store: optional — the analyzer screens keep
  // working without Neo4j; configure NEO4J_* env vars to enable the engine.
  let graphEngine: GraphEngine | null = null;
  let graphStatus: "connected" | "unconfigured" | "error" = "unconfigured";
  try {
    graphEngine = await connectGraphEngineFromEnv();
    if (graphEngine) {
      graphStatus = "connected";
      console.log("Neo4j connected — graph schema ensured.");
    } else {
      console.log("NEO4J_URI not set — running without the dependency graph.");
    }
  } catch (error: any) {
    graphStatus = "error";
    console.warn(`Neo4j configured but unreachable: ${error.message}`);
  }

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Dependency Engine health: reports Neo4j connectivity and live graph stats.
  app.get("/api/v2/health", async (req, res) => {
    if (!graphEngine) {
      return res.json({ status: "ok", neo4j: graphStatus });
    }
    try {
      const graph = await graphEngine.repository.getStats();
      res.json({ status: "ok", neo4j: "connected", graph });
    } catch (error: any) {
      res.json({ status: "ok", neo4j: "error", error: error.message });
    }
  });

  // Dependency Engine APIs (graph, impact, objects, stats, ingestion)
  if (graphEngine) {
    app.use("/api/v2", createV2Router(graphEngine));
  } else {
    app.use("/api/v2", (req, res) => {
      res.status(503).json({
        error:
          graphStatus === "error"
            ? "Neo4j is configured but unreachable. Check NEO4J_URI / docker compose up -d."
            : "Dependency Engine is offline: set NEO4J_URI (see .env.example) and restart.",
      });
    });
  }

  // 1. Oracle Forms Analyzer
  app.post("/api/analyze/forms", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const result = formsAnalyzerService.analyze(file.originalname, file.buffer);
      res.json(result);
    } catch (error: any) {
      console.error("Forms analysis failed:", error);
      res.status(500).json({ error: error.message || "Failed to analyze form" });
    }
  });

  // 1.5. Oracle Reports Analyzer
  app.post("/api/analyze/reports", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const result = reportsAnalyzerService.analyze(file.originalname, file.buffer);
      res.json(result);
    } catch (error: any) {
      console.error("Reports analysis failed:", error);
      res.status(500).json({ error: error.message || "Failed to analyze report" });
    }
  });


  // 2. PL/SQL Analyzer
  app.post("/api/analyze/plsql", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const content = file.buffer.toString("utf-8");
      const result = plsqlAnalyzerService.analyze(file.originalname, content);
      res.json(result);
    } catch (error: any) {
      console.error("PL/SQL analysis failed:", error);
      res.status(500).json({ error: error.message || "Failed to analyze PL/SQL" });
    }
  });

  // Metadata discovery moved to the engine: POST /api/v2/ingest/discover (live
  // Oracle) and /api/v2/ingest/schema (DDL), surfaced via /api/v2/discovery/summary.

  // 4. React Generator API
  app.post("/api/generate/react", (req, res) => {
    try {
      const { entityName } = req.body;
      const baseName = entityName ? entityName.charAt(0).toUpperCase() + entityName.slice(1).toLowerCase() : 'Entity';
      
      const component = `import React, { useState } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, TextField 
} from '@mui/material';
import { use${baseName} } from '../hooks/use${baseName}';

export default function ${baseName}List() {
  const { data, loading, error } = use${baseName}();
  const [search, setSearch] = useState('');

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">Error loading data</Typography>;

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">${baseName} Management</Typography>
        <Button variant="contained" color="primary">Add New</Button>
      </Box>
      
      <Paper sx={{ mb: 3, p: 2 }}>
        <TextField 
          fullWidth 
          variant="outlined" 
          placeholder="Search..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.createdAt}</TableCell>
                <TableCell align="right">
                  <Button size="small">Edit</Button>
                  <Button size="small" color="error">Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}`;

      const hook = `import { useState, useEffect } from 'react';
import { ${baseName} } from '../types';

export function use${baseName}() {
  const [data, setData] = useState<${baseName}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch('/api/v1/${baseName.toLowerCase()}')
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}`;

      const types = `export interface ${baseName} {
  id: number;
  name: string;
  createdAt: string;
  updatedAt?: string;
}`;

      const springController = `package com.enterprise.app.controller;

import com.enterprise.app.entity.${baseName};
import com.enterprise.app.service.${baseName}Service;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/${baseName.toLowerCase()}")
@CrossOrigin(origins = "*")
public class ${baseName}Controller {

    private final ${baseName}Service service;

    public ${baseName}Controller(${baseName}Service service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<${baseName}>> getAll() {
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${baseName}> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @PostMapping
    public ResponseEntity<${baseName}> create(@RequestBody ${baseName} entity) {
        return ResponseEntity.ok(service.save(entity));
    }

    @PutMapping("/{id}")
    public ResponseEntity<${baseName}> update(@PathVariable Long id, @RequestBody ${baseName} entity) {
        return ResponseEntity.ok(service.update(id, entity));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}`;

      const springService = `package com.enterprise.app.service;

import com.enterprise.app.entity.${baseName};
import com.enterprise.app.repository.${baseName}Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ${baseName}Service {

    private final ${baseName}Repository repository;

    public ${baseName}Service(${baseName}Repository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<${baseName}> findAll() {
        return repository.findAll();
    }

    @Transactional(readOnly = true)
    public ${baseName} findById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new RuntimeException("${baseName} not found"));
    }

    @Transactional
    public ${baseName} save(${baseName} entity) {
        return repository.save(entity);
    }

    @Transactional
    public ${baseName} update(Long id, ${baseName} details) {
        ${baseName} existing = findById(id);
        existing.setName(details.getName());
        return repository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        repository.deleteById(id);
    }
}`;

      const springEntity = `package com.enterprise.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "${entityName.toUpperCase()}")
public class ${baseName} {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "${entityName.toLowerCase()}_seq")
    @SequenceGenerator(name = "${entityName.toLowerCase()}_seq", sequenceName = "${entityName.toUpperCase()}_SEQ", allocationSize = 1)
    private Long id;

    @Column(name = "NAME", nullable = false)
    private String name;

    @Column(name = "CREATED_AT")
    private LocalDateTime createdAt;
    
    @Column(name = "UPDATED_AT")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}`;

      res.json({
        component,
        hook,
        types
      });
    } catch (error: any) {
      console.error("React Gen failure:", error);
      res.status(500).json({ error: error.message || "Failed to generate code" });
    }
  });

  app.post("/api/generate/springboot", (req, res) => {
    try {
      const { entityName } = req.body;
      const baseName = entityName ? entityName.charAt(0).toUpperCase() + entityName.slice(1).toLowerCase() : 'Entity';
      
      const controller = `package com.enterprise.app.controller;

import com.enterprise.app.dto.${baseName}Dto;
import com.enterprise.app.service.${baseName}Service;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/${baseName.toLowerCase()}")
@CrossOrigin(origins = "*")
public class ${baseName}Controller {

    private final ${baseName}Service service;

    public ${baseName}Controller(${baseName}Service service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<${baseName}Dto>> getAll() {
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${baseName}Dto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @PostMapping
    public ResponseEntity<${baseName}Dto> create(@RequestBody ${baseName}Dto dto) {
        return ResponseEntity.ok(service.save(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<${baseName}Dto> update(@PathVariable Long id, @RequestBody ${baseName}Dto dto) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}`;

      const service = `package com.enterprise.app.service;

import com.enterprise.app.dto.${baseName}Dto;
import com.enterprise.app.entity.${baseName};
import com.enterprise.app.repository.${baseName}Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.stream.Collectors;
import java.util.List;

@Service
public class ${baseName}Service {

    private final ${baseName}Repository repository;

    public ${baseName}Service(${baseName}Repository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<${baseName}Dto> findAll() {
        return repository.findAll().stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ${baseName}Dto findById(Long id) {
        ${baseName} entity = repository.findById(id)
            .orElseThrow(() -> new RuntimeException("${baseName} not found"));
        return mapToDto(entity);
    }

    @Transactional
    public ${baseName}Dto save(${baseName}Dto dto) {
        ${baseName} entity = new ${baseName}();
        entity.setName(dto.getName());
        return mapToDto(repository.save(entity));
    }

    @Transactional
    public ${baseName}Dto update(Long id, ${baseName}Dto details) {
        ${baseName} existing = repository.findById(id)
            .orElseThrow(() -> new RuntimeException("${baseName} not found"));
        existing.setName(details.getName());
        return mapToDto(repository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        repository.deleteById(id);
    }
    
    // Simple Mapper Reference
    private ${baseName}Dto mapToDto(${baseName} entity) {
        ${baseName}Dto dto = new ${baseName}Dto();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setCreatedAt(entity.getCreatedAt());
        return dto;
    }
}`;

      const repository = `package com.enterprise.app.repository;

import com.enterprise.app.entity.${baseName};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${baseName}Repository extends JpaRepository<${baseName}, Long> {
    // Custom query methods derived from Oracle conventions can be added here
}`;

      const entity = `package com.enterprise.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "${entityName.toUpperCase()}")
public class ${baseName} {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "${entityName.toLowerCase()}_seq")
    @SequenceGenerator(name = "${entityName.toLowerCase()}_seq", sequenceName = "${entityName.toUpperCase()}_SEQ", allocationSize = 1)
    private Long id;

    @Column(name = "NAME", nullable = false)
    private String name;

    @Column(name = "CREATED_AT")
    private LocalDateTime createdAt;
    
    @Column(name = "UPDATED_AT")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}`;

      const dto = `package com.enterprise.app.dto;

import java.time.LocalDateTime;

public class ${baseName}Dto {
    private Long id;
    private String name;
    private LocalDateTime createdAt;

    // Default constructor
    public ${baseName}Dto() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}`;

      res.json({
        controller,
        service,
        repository,
        entity,
        dto
      });
    } catch (error: any) {
      console.error("Spring Boot Gen failure:", error);
      res.status(500).json({ error: error.message || "Failed to generate code" });
    }
  });

  // Demo endpoints retired: /api/db/metadata, /api/graph, /api/impact/:nodeId
  // and /api/dashboard are replaced by the computed /api/v2 equivalents.

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
