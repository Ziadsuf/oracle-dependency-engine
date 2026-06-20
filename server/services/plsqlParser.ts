import { PlsqlAnalysisResult, PlsqlSubprogram } from '../../src/types';

export class PlsqlAnalyzerService {
  public analyze(fileName: string, content: string): PlsqlAnalysisResult {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Extract package name
    const pkgMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:PACKAGE\s+BODY|PACKAGE)\s+(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)/i);
    const packageName = pkgMatch ? pkgMatch[1].toUpperCase() : 'UNKNOWN_PACKAGE';

    const procedures: PlsqlSubprogram[] = [];
    const functions: PlsqlSubprogram[] = [];
    const globalDependencies = new Set<string>();

    let currentSubprogram: PlsqlSubprogram | null = null;
    // Track block nesting (BEGIN/IF/LOOP/CASE openers vs END closers) so a
    // subprogram's own terminating END is found regardless of its length —
    // replaces a fragile "more than 5 lines in" heuristic.
    let blockDepth = 0;
    let openedBody = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();

      // Check for Procedure
      const procMatch = upperLine.match(/PROCEDURE\s+([A-Za-z0-9_]+)/);
      if (procMatch && !upperLine.includes('END ') && !upperLine.includes('--')) {
        if (currentSubprogram) {
          if (currentSubprogram.type === 'PROCEDURE') procedures.push(currentSubprogram);
          else functions.push(currentSubprogram);
        }
        currentSubprogram = {
          name: procMatch[1].toUpperCase(),
          type: 'PROCEDURE',
          startLine: i + 1,
          endLine: totalLines,
          complexity: 1,
          dependencies: []
        };
        blockDepth = 0;
        openedBody = false;
      }

      // Check for Function
      const funcMatch = upperLine.match(/FUNCTION\s+([A-Za-z0-9_]+)/);
      if (funcMatch && !upperLine.includes('END ') && !upperLine.includes('--')) {
        if (currentSubprogram) {
          if (currentSubprogram.type === 'PROCEDURE') procedures.push(currentSubprogram);
          else functions.push(currentSubprogram);
        }
        currentSubprogram = {
          name: funcMatch[1].toUpperCase(),
          type: 'FUNCTION',
          startLine: i + 1,
          endLine: totalLines,
          complexity: 1,
          dependencies: []
        };
        blockDepth = 0;
        openedBody = false;
      }

      // Complexity and Dependencies Metrics
      if (currentSubprogram && !upperLine.trim().startsWith('--')) {
        if (upperLine.match(/\b(IF|ELSIF|FOR|WHILE|LOOP|CASE|EXCEPTION|WHEN)\b/)) {
          currentSubprogram.complexity += 1;
        }
        
        // Dependency extractors (Tables/Views via FROM/UPDATE/JOIN/INSERT INTO)
        const depMatches = Array.from(upperLine.matchAll(/\b(?:FROM|UPDATE|JOIN|INSERT\s+INTO)\s+([A-Za-z0-9_]+)/g));
        for (const depMatch of depMatches) {
          const depName = depMatch[1].toUpperCase();
          if (!['DUAL', 'XMLTABLE', 'TABLE', 'V', 'T'].includes(depName)) {
            if (!currentSubprogram.dependencies.includes(depName)) {
              currentSubprogram.dependencies.push(depName);
            }
            globalDependencies.add(depName);
          }
        }

        // End of subprogram: track nesting depth, then close on the END that
        // balances the body's BEGIN (or an explicit `END <name>`).
        const openers =
          (upperLine.match(/\bBEGIN\b/g) || []).length +
          (upperLine.match(/(?<!END\s+)\bIF\b/g) || []).length +
          (upperLine.match(/(?<!END\s+)\bLOOP\b/g) || []).length +
          (upperLine.match(/(?<!END\s+)\bCASE\b/g) || []).length;
        const closers = (upperLine.match(/\bEND\b/g) || []).length;
        blockDepth += openers - closers;
        if (blockDepth > 0) openedBody = true;

        const namedEnd = new RegExp(`\\bEND\\s+${currentSubprogram.name}\\b`).test(upperLine);
        if (namedEnd || (openedBody && blockDepth <= 0 && closers > 0)) {
          currentSubprogram.endLine = i + 1;
          if (currentSubprogram.type === 'PROCEDURE') procedures.push(currentSubprogram);
          else functions.push(currentSubprogram);
          currentSubprogram = null;
        }
      } else if (!upperLine.trim().startsWith('--')) {
         // global dependency matched outside subprogram scope
         const depMatches = Array.from(upperLine.matchAll(/\b(?:FROM|UPDATE|JOIN|INSERT\s+INTO)\s+([A-Za-z0-9_]+)/g));
         for (const depMatch of depMatches) {
           const depName = depMatch[1].toUpperCase();
           if (!['DUAL', 'XMLTABLE', 'TABLE', 'V', 'T'].includes(depName)) {
             globalDependencies.add(depName);
           }
         }
      }
    }

    // Flush any pending subprogram
    if (currentSubprogram) {
      if (currentSubprogram.type === 'PROCEDURE') procedures.push(currentSubprogram);
      else functions.push(currentSubprogram);
    }

    // Deduplicate logic for overloaded functions/procedures
    const sanitizeSubPrograms = (progs: PlsqlSubprogram[]) => {
      const map = new Map<string, PlsqlSubprogram>();
      for (const p of progs) {
        if (!map.has(p.name)) {
          map.set(p.name, p);
        } else {
          const existing = map.get(p.name)!;
          existing.complexity += p.complexity;
          existing.endLine = Math.max(existing.endLine, p.endLine);
          p.dependencies.forEach(d => {
            if (!existing.dependencies.includes(d)) existing.dependencies.push(d);
          });
        }
      }
      return Array.from(map.values());
    }

    const uniqueProcs = sanitizeSubPrograms(procedures);
    const uniqueFuncs = sanitizeSubPrograms(functions);

    const totalComplexity = uniqueProcs.reduce((acc, p) => acc + p.complexity, 0) + 
                            uniqueFuncs.reduce((acc, p) => acc + p.complexity, 0);

    let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    if (totalComplexity > 50 || globalDependencies.size > 15) riskLevel = 'Critical';
    else if (totalComplexity > 25 || globalDependencies.size > 8) riskLevel = 'High';
    else if (totalComplexity > 10) riskLevel = 'Medium';

    return {
      fileName,
      packageName,
      procedures: uniqueProcs,
      functions: uniqueFuncs,
      dependencies: Array.from(globalDependencies),
      totalLines,
      complexity: totalComplexity,
      riskLevel
    };
  }
}
