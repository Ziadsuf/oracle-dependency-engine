-- Demo schema for live Oracle discovery testing.
-- Run inside the DB (as SYSTEM), then discover it with:
--   curl -X POST -H "Content-Type: application/json" -d "{\"schemas\":[\"ORADEMO\"]}" http://127.0.0.1:3000/api/v2/ingest/discover
-- Remove afterwards with: DROP USER orademo CASCADE;

WHENEVER SQLERROR CONTINUE
DROP USER orademo CASCADE;

CREATE USER orademo IDENTIFIED BY "Demo#12345";
GRANT CONNECT, RESOURCE TO orademo;
ALTER USER orademo QUOTA UNLIMITED ON USERS;

CREATE TABLE orademo.departments (
  dept_id   NUMBER PRIMARY KEY,
  dept_name VARCHAR2(60)
);

CREATE TABLE orademo.employees (
  emp_id  NUMBER PRIMARY KEY,
  name    VARCHAR2(120),
  salary  NUMBER(10,2),
  dept_id NUMBER REFERENCES orademo.departments(dept_id)
);

CREATE TABLE orademo.salary_hist (
  emp_id     NUMBER REFERENCES orademo.employees(emp_id),
  changed_at DATE,
  old_salary NUMBER(10,2),
  new_salary NUMBER(10,2)
);

CREATE SEQUENCE orademo.emp_seq;

CREATE VIEW orademo.emp_dept_v AS
  SELECT e.emp_id, e.name, d.dept_name
    FROM orademo.employees e
    JOIN orademo.departments d ON e.dept_id = d.dept_id;

CREATE OR REPLACE TRIGGER orademo.trg_emp_audit
  AFTER UPDATE OF salary ON orademo.employees
  FOR EACH ROW
BEGIN
  INSERT INTO orademo.salary_hist VALUES (:OLD.emp_id, SYSDATE, :OLD.salary, :NEW.salary);
END;
/

CREATE OR REPLACE PACKAGE orademo.hr_pkg AS
  PROCEDURE hire(p_name VARCHAR2, p_dept NUMBER);
  FUNCTION bonus(p_emp NUMBER) RETURN NUMBER;
END hr_pkg;
/

CREATE OR REPLACE PACKAGE BODY orademo.hr_pkg AS
  PROCEDURE hire(p_name VARCHAR2, p_dept NUMBER) IS
  BEGIN
    INSERT INTO employees (emp_id, name, dept_id) VALUES (emp_seq.NEXTVAL, p_name, p_dept);
  END hire;

  FUNCTION bonus(p_emp NUMBER) RETURN NUMBER IS
    v_salary NUMBER;
  BEGIN
    SELECT salary INTO v_salary FROM employees WHERE emp_id = p_emp;
    RETURN v_salary * 0.1;
  END bonus;
END hr_pkg;
/

CREATE SYNONYM orademo.emp FOR orademo.employees;

SELECT object_type, COUNT(*) FROM all_objects WHERE owner = 'ORADEMO' GROUP BY object_type;
EXIT;
