// Extracts DDL for ALL tables visible in the database (every owner) into one
// .sql file for the "DDL Upload" feature. A single server-side PL/SQL loop
// builds the DDL (one round trip); protected/bootstrap objects are skipped.
//
// Usage:  npx tsx samples/extract_all_tables.ts
//   ONLY_APP=1 npx tsx samples/extract_all_tables.ts   // skip Oracle-internal schemas
import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const SYSTEM_OWNERS = [
  'SYS', 'SYSTEM', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS', 'OUTLN', 'DBSNMP', 'APPQOSSYS',
  'WMSYS', 'OLAPSYS', 'AUDSYS', 'GSMADMIN_INTERNAL', 'OJVMSYS', 'ORDDATA', 'ORDPLUGINS',
  'SI_INFORMTN_SCHEMA', 'DVSYS', 'LBACSYS', 'DBSFWUSER', 'GGSYS', 'GGSHAREDCAP', 'BAASSYS',
  'REMOTE_SCHEDULER_AGENT', 'DGPDB_INT', 'SYS$UMF', 'GSMCATUSER', 'GSMUSER', 'SYSBACKUP',
  'SYSDG', 'SYSKM', 'SYSRAC', 'DIP', 'ANONYMOUS', 'XS$NULL', 'PDBADMIN', 'DVF', 'VECSYS',
];

async function main() {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER ?? 'system',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectString: process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1',
  });

  try {
    // Default: skip only SYS (2000+ slow data-dictionary bootstrap tables).
    // ONLY_APP=1 → skip every Oracle-internal schema.  ALL=1 → include SYS too.
    const ownerFilter = process.env.ALL
      ? ''
      : process.env.ONLY_APP
        ? `AND owner NOT IN (${SYSTEM_OWNERS.map((o) => `'${o}'`).join(',')})`
        : `AND owner <> 'SYS'`;

    // Server-side loop: try GET_DDL per table, skip failures, accumulate one CLOB.
    const plsql = `
      DECLARE
        v_ddl CLOB;
        v_out CLOB;
        v_ok  NUMBER := 0;
        v_err NUMBER := 0;
      BEGIN
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', FALSE);
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', FALSE);
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'TABLESPACE', FALSE);
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'CONSTRAINTS', TRUE);
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'REF_CONSTRAINTS', TRUE);
        DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
        DBMS_LOB.CREATETEMPORARY(v_out, TRUE);
        FOR rec IN (
          SELECT owner, table_name FROM all_tables
           WHERE table_name NOT LIKE 'BIN$%' ${ownerFilter}
           ORDER BY owner, table_name
        ) LOOP
          BEGIN
            v_ddl := DBMS_METADATA.GET_DDL('TABLE', rec.table_name, rec.owner);
            DBMS_LOB.APPEND(v_out, v_ddl);
            DBMS_LOB.APPEND(v_out, TO_CLOB(CHR(10) || CHR(10)));
            v_ok := v_ok + 1;
          EXCEPTION WHEN OTHERS THEN
            v_err := v_err + 1;
          END;
        END LOOP;
        :result := v_out;
        :ok := v_ok;
        :err := v_err;
      END;`;

    const r = await conn.execute(plsql, {
      result: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
      ok: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      err: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    });

    const binds = r.outBinds as { result: oracledb.Lob | null; ok: number; err: number };
    const ddlText = binds.result ? await binds.result.getData() : '';
    if (binds.result) await binds.result.close();

    const header =
      `-- DDL for ALL tables extracted via DBMS_METADATA on ${new Date().toISOString()}\n` +
      `-- Source: ${process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1'}\n` +
      `-- Extracted: ${binds.ok} tables   Skipped (protected/bootstrap): ${binds.err}\n\n`;

    const file = path.resolve('samples', process.env.ONLY_APP ? 'app_tables_ddl.sql' : 'all_tables_ddl.sql');
    fs.writeFileSync(file, header + String(ddlText), 'utf-8');
    console.log(`Wrote ${file}`);
    console.log(`Extracted ${binds.ok} tables, skipped ${binds.err}. Size: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('EXTRACT FAILED:', err.message);
  process.exit(1);
});
