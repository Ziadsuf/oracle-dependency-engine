// Read-only connectivity + survey probe for the live Oracle source.
// Usage: npx tsx samples/oracle_probe.ts
import oracledb from 'oracledb';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

async function main() {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  const connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER ?? 'system',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectString: process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1',
  });
  try {
    const banner = await connection.execute(`SELECT banner_full FROM v$version`);
    console.log('Connected:', (banner.rows as any[])[0]?.BANNER_FULL?.split('\n')[0]);

    // Owners with engine-relevant objects AND how many dependencies originate there.
    const survey = await connection.execute(
      `SELECT o.owner,
              COUNT(*) AS objects,
              (SELECT COUNT(*) FROM all_dependencies d WHERE d.owner = o.owner) AS deps
         FROM all_objects o
        WHERE o.object_type IN ('TABLE','VIEW','PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','SEQUENCE','SYNONYM')
          AND o.owner NOT IN ('SYS','SYSTEM','PUBLIC','XDB','CTXSYS','MDSYS','ORDSYS','OUTLN','DBSNMP','APPQOSSYS','WMSYS','OLAPSYS','AUDSYS')
        GROUP BY o.owner
        ORDER BY deps DESC, objects DESC`
    );
    console.log('\nNon-system owners (objects / dependencies):');
    for (const row of survey.rows as any[]) {
      console.log(`  ${String(row.OWNER).padEnd(24)} objects=${row.OBJECTS}  deps=${row.DEPS}`);
    }
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error('PROBE FAILED:', err.message);
  process.exit(1);
});
