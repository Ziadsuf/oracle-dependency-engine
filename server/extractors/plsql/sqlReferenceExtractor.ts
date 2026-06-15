// Shared SQL/PL-SQL reference scanner used by the PL/SQL, Forms, Reports and
// DDL extractors so every artifact produces consistent candidate references.
// Pragmatic lexical scanning (not a grammar): static references get
// CONFIDENCE.PARSED_STATIC, anything found inside dynamic SQL strings gets
// CONFIDENCE.DYNAMIC_HEURISTIC.

export interface ScannedTableRef {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  line: number;
  dynamic: boolean;
}

export interface ScannedCallRef {
  name: string; // qualified: "PKG.PROC" or "SCHEMA.PKG.PROC"
  line: number;
}

export interface ScannedSequenceRef {
  name: string;
  line: number;
}

export interface ScannedRefs {
  tables: ScannedTableRef[];
  calls: ScannedCallRef[];
  sequences: ScannedSequenceRef[];
  hasDynamicSql: boolean;
}

// Names that match table-position regexes but are never tables.
const NOISE = new Set([
  'DUAL', 'TABLE', 'XMLTABLE', 'V', 'T', 'OF', 'NOWAIT', 'SET', 'WHERE', 'SELECT',
  'THE', 'ALL', 'DISTINCT', 'LOOP', 'IF', 'THEN', 'ELSE', 'CASE', 'WHEN', 'NULL',
]);

// Qualified-call prefixes that are record/cursor accesses rather than packages
// cannot be distinguished lexically; standard SQL functions are unqualified so
// the qualified-call pattern is already fairly selective.
const IDENT = String.raw`[A-Za-z_][\w$#]*`;
const QUALIFIED = String.raw`${IDENT}(?:\.${IDENT})?`;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// Blanks out -- and /* */ comments while preserving offsets/line numbers.
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'string' = 'code';
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (ch === '-' && next === '-') {
        mode = 'line';
        out += '  ';
        i += 2;
      } else if (ch === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        i += 2;
      } else if (ch === "'") {
        mode = 'string';
        out += ch;
        i++;
      } else {
        out += ch;
        i++;
      }
    } else if (mode === 'line') {
      if (ch === '\n') {
        mode = 'code';
        out += ch;
      } else {
        out += ' ';
      }
      i++;
    } else if (mode === 'block') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i++;
      }
    } else {
      // string literal: keep content ('' is an escaped quote)
      if (ch === "'" && next === "'") {
        out += "''";
        i += 2;
      } else {
        if (ch === "'") mode = 'code';
        out += ch;
        i++;
      }
    }
  }
  return out;
}

interface TablePattern {
  regex: RegExp;
  operation: ScannedTableRef['operation'];
  /** Skip the match when the text right before it matches (e.g. FROM inside DELETE FROM). */
  notPrecededBy?: RegExp;
}

const TABLE_PATTERNS: TablePattern[] = [
  { regex: new RegExp(String.raw`\bFROM\s+(${QUALIFIED})`, 'gi'), operation: 'SELECT', notPrecededBy: /DELETE\s*$/i },
  { regex: new RegExp(String.raw`\bJOIN\s+(${QUALIFIED})`, 'gi'), operation: 'SELECT' },
  { regex: new RegExp(String.raw`\bINSERT\s+INTO\s+(${QUALIFIED})`, 'gi'), operation: 'INSERT' },
  { regex: new RegExp(String.raw`\bUPDATE\s+(${QUALIFIED})`, 'gi'), operation: 'UPDATE', notPrecededBy: /FOR\s*$/i },
  { regex: new RegExp(String.raw`\bDELETE\s+(?:FROM\s+)?(${QUALIFIED})`, 'gi'), operation: 'DELETE' },
  { regex: new RegExp(String.raw`\bMERGE\s+INTO\s+(${QUALIFIED})`, 'gi'), operation: 'UPDATE' },
];

function isNoise(name: string): boolean {
  const last = name.split('.').pop()!.toUpperCase();
  return NOISE.has(name.toUpperCase()) || NOISE.has(last);
}

function scanTables(text: string, dynamic: boolean, lineOffset = 0): ScannedTableRef[] {
  const refs: ScannedTableRef[] = [];
  for (const { regex, operation, notPrecededBy } of TABLE_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1].toUpperCase();
      if (isNoise(name)) continue;
      if (notPrecededBy && notPrecededBy.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
      refs.push({ name, operation, line: lineOffset + lineOf(text, match.index), dynamic });
    }
  }
  return refs;
}

// Blanks the contents of '…' literals (keeping the quotes and line breaks) so
// static scans don't match SQL embedded in strings — dynamic-SQL extraction
// handles those separately at lower confidence.
function blankStrings(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "'" && text[i + 1] === "'") {
        out += '  ';
        i++;
      } else if (ch === "'") {
        inString = false;
        out += ch;
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
    } else {
      if (ch === "'") inString = true;
      out += ch;
    }
  }
  return out;
}

export function scanPlsql(source: string): ScannedRefs {
  const code = stripComments(source);
  const staticCode = blankStrings(code);

  const tables = scanTables(staticCode, false);

  // Qualified calls: PKG.PROC( — sequences (X.NEXTVAL) have no parenthesis
  const calls: ScannedCallRef[] = [];
  const callRegex = new RegExp(String.raw`\b(${IDENT}(?:\.${IDENT}){1,2})\s*\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = callRegex.exec(staticCode)) !== null) {
    const name = match[1].toUpperCase();
    const last = name.split('.').pop()!;
    if (last === 'NEXTVAL' || last === 'CURRVAL' || isNoise(name)) continue;
    calls.push({ name, line: lineOf(staticCode, match.index) });
  }

  const sequences: ScannedSequenceRef[] = [];
  const seqRegex = new RegExp(String.raw`\b(${QUALIFIED})\s*\.\s*(?:NEXTVAL|CURRVAL)\b`, 'gi');
  while ((match = seqRegex.exec(staticCode)) !== null) {
    sequences.push({ name: match[1].toUpperCase(), line: lineOf(staticCode, match.index) });
  }

  // Dynamic SQL: scan string literals that follow EXECUTE IMMEDIATE / OPEN-FOR
  let hasDynamicSql = false;
  const dynRegex = /\b(?:EXECUTE\s+IMMEDIATE|OPEN\s+\w+\s+FOR)\s+('(?:[^']|'')*')/gi;
  while ((match = dynRegex.exec(code)) !== null) {
    hasDynamicSql = true;
    const literal = match[1].slice(1, -1).replace(/''/g, "'");
    const line = lineOf(code, match.index);
    for (const ref of scanTables(literal, true)) {
      tables.push({ ...ref, line });
    }
  }
  if (!hasDynamicSql) {
    hasDynamicSql = /\bEXECUTE\s+IMMEDIATE\b/i.test(code);
  }

  return { tables, calls, sequences, hasDynamicSql };
}

/** Scans a standalone SQL statement (report query, view body) for table references. */
export function scanSqlTables(sql: string): ScannedTableRef[] {
  return scanTables(stripComments(sql), false);
}
