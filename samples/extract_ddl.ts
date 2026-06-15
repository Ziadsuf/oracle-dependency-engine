// Extracts real DDL (tables + views) from the live Oracle database via
// DBMS_METADATA and writes a .sql file ready for the "DDL Upload" feature.
// Usage: npx tsx samples/extract_ddl.ts            (defaults below)
//        SCHEMAS=LBACSYS,DBSFWUSER npx tsx samples/extract_ddl.ts
import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

async function main() {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB]; // GET_DDL returns a CLOB

  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER ?? 'system',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectString: process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1',
  });

  try {
    // Cleaner DDL: drop storage/tablespace/segment noise, keep statement terminators.
    await conn.execute(`BEGIN
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', false);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', false);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'TABLESPACE', false);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'CONSTRAINTS', true);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'REF_CONSTRAINTS', true);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', true);
    END;`);

    const schemas = (process.env.SCHEMAS ?? 'DBSFWUSER,LBACSYS,DVF').split(',').map((s) => s.trim());
    let out = `-- Real Oracle DDL extracted via DBMS_METADATA on ${new Date().toISOString()}\n`;
    out += `-- Source: ${process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1'}  Schemas: ${schemas.join(', ')}\n\n`;
    let ok = 0;
    let failed = 0;

    for (const schema of schemas) {
      for (const objType of ['TABLE', 'VIEW']) {
        const listed = await conn.execute<{ OBJECT_NAME: string }>(
          `SELECT object_name FROM all_objects
            WHERE owner = :o AND object_type = :t AND object_name NOT LIKE 'BIN$%'
            ORDER BY object_name`,
          { o: schema, t: objType }
        );
        for (const row of listed.rows ?? []) {
          try {
            const ddl = await conn.execute<{ DDL: string }>(
              `SELECT DBMS_METADATA.GET_DDL(:t, :n, :o) AS ddl FROM dual`,
              { t: objType, n: row.OBJECT_NAME, o: schema }
            );
            const text = ddl.rows?.[0]?.DDL;
            if (text) {
              out += String(text).trim() + '\n\n';
              ok++;
            }
          } catch {
            failed++; // protected / unsupported object — skip
          }
        }
      }
    }

    const file = path.resolve('samples', 'oracle_real_ddl.sql');
    fs.writeFileSync(file, out, 'utf-8');
    console.log(`Wrote ${file}`);
    console.log(`Extracted ${ok} objects (${failed} skipped/protected).`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('EXTRACT FAILED:', err.message);
  process.exit(1);
});
