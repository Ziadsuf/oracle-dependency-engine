-- Sample PL/SQL package body. Ingest with defaultSchema=HR:
-- curl -F "file=@samples/hr_pkg.pkb" -F "defaultSchema=HR" http://localhost:3000/api/v2/ingest/plsql

CREATE OR REPLACE PACKAGE BODY hr.hr_pkg AS

  PROCEDURE validate_emp(p_emp_id IN NUMBER) IS
    v_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM employees WHERE emp_id = p_emp_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Employee not found');
    END IF;
  END validate_emp;

  PROCEDURE hire_emp(p_name IN VARCHAR2, p_dept_id IN NUMBER) IS
    v_id NUMBER;
  BEGIN
    v_id := emp_seq.NEXTVAL;
    INSERT INTO employees (emp_id, name, dept_id) VALUES (v_id, p_name, p_dept_id);
    system_util.log_event('HIRED ' || p_name);
  END hire_emp;

  FUNCTION calculate_bonus(p_emp_id IN NUMBER) RETURN NUMBER IS
    v_salary NUMBER;
  BEGIN
    SELECT salary INTO v_salary FROM employees WHERE emp_id = p_emp_id;
    UPDATE salary_hist SET new_salary = v_salary WHERE emp_id = p_emp_id;
    RETURN v_salary * 0.1;
  END calculate_bonus;

END hr_pkg;
