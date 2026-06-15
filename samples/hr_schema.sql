-- Sample HR schema for trying the Dependency Engine:
-- upload via Metadata Discovery → "Ingest DDL into Graph",
-- or: curl -F "file=@samples/hr_schema.sql" http://localhost:3000/api/v2/ingest/schema

CREATE TABLE hr.departments (
  dept_id   NUMBER PRIMARY KEY,
  dept_name VARCHAR2(60) NOT NULL
);

CREATE TABLE hr.employees (
  emp_id  NUMBER PRIMARY KEY,
  name    VARCHAR2(120) NOT NULL,
  salary  NUMBER(10,2),
  dept_id NUMBER REFERENCES hr.departments(dept_id)
);

CREATE TABLE hr.salary_hist (
  emp_id     NUMBER REFERENCES hr.employees(emp_id),
  changed_at DATE,
  old_salary NUMBER(10,2),
  new_salary NUMBER(10,2)
);

CREATE TABLE hr.system_log (
  log_id  NUMBER,
  message VARCHAR2(4000),
  logged  DATE
);

CREATE SEQUENCE hr.emp_seq;

CREATE OR REPLACE VIEW hr.emp_dept_v AS
  SELECT e.emp_id, e.name, e.salary, d.dept_name
    FROM hr.employees e
    JOIN hr.departments d ON e.dept_id = d.dept_id;

CREATE OR REPLACE TRIGGER hr.trg_emp_audit
  AFTER UPDATE OF salary ON hr.employees
  FOR EACH ROW
BEGIN
  INSERT INTO hr.salary_hist VALUES (:OLD.emp_id, SYSDATE, :OLD.salary, :NEW.salary);
END;

CREATE SYNONYM emp FOR hr.employees;
