import { describe, it, expect } from 'vitest';
import { PlsqlAnalyzerService } from './plsqlParser';

describe('PlsqlAnalyzerService', () => {
  const analyzer = new PlsqlAnalyzerService();

  it('should extract procedures, functions, variables, and complexities', () => {
    const plsql = `
CREATE OR REPLACE PACKAGE BODY HR_PKG AS

  PROCEDURE validate_emp(p_emp_id IN NUMBER) IS
    v_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM EMPLOYEES WHERE emp_id = p_emp_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Emp not found');
    END IF;
  END validate_emp;

  FUNCTION calculate_bonus(p_emp_id IN NUMBER) RETURN NUMBER IS
    v_sal NUMBER;
    v_bonus NUMBER := 0;
  BEGIN
    SELECT salary INTO v_sal FROM EMP_SALARIES WHERE emp_id = p_emp_id;
    
    FOR i IN 1..5 LOOP
        v_bonus := v_bonus + (v_sal * 0.01);
    END LOOP;
    
    RETURN v_bonus;
  EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
  END calculate_bonus;

END HR_PKG;
    `;

    const result = analyzer.analyze('hr_pkg.pkb', plsql);
    
    expect(result.fileName).toBe('hr_pkg.pkb');
    expect(result.packageName).toBe('HR_PKG');
    
    expect(result.procedures.length).toBe(1);
    expect(result.procedures[0].name).toBe('VALIDATE_EMP');
    expect(result.procedures[0].dependencies).toContain('EMPLOYEES');
    expect(result.procedures[0].complexity).toBeGreaterThan(1); // the IF statement
    
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].name).toBe('CALCULATE_BONUS');
    expect(result.functions[0].dependencies).toContain('EMP_SALARIES');
    expect(result.functions[0].complexity).toBeGreaterThan(1); // FOR, EXCEPTION, WHEN
    
    expect(result.dependencies).toContain('EMPLOYEES');
    expect(result.dependencies).toContain('EMP_SALARIES');
  });

  it('detects short subprograms that end with a bare END; (nesting-based end detection)', () => {
    const plsql = `CREATE OR REPLACE PACKAGE BODY P AS
  FUNCTION f RETURN NUMBER IS
  BEGIN
    RETURN 1;
  END;
  PROCEDURE noop IS
  BEGIN
    NULL;
  END;
END P;`;
    const result = analyzer.analyze('p.pkb', plsql);
    expect(result.functions.map((f) => f.name)).toEqual(['F']);
    expect(result.procedures.map((p) => p.name)).toEqual(['NOOP']);
    // Each ends at its own END; (not absorbed into the next), so end > start, tightly.
    expect(result.functions[0].endLine).toBe(5);
    expect(result.procedures[0].endLine).toBe(9);
  });
});
