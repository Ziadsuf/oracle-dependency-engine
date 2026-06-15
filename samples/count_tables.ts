// Shows where the 2244 all_tables actually live (by owner).
import oracledb from 'oracledb';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

async function main() {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER ?? 'system',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectString: process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1522/FREEPDB1',
  });
  try {
    const total = await conn.execute<{ C: number }>(`SELECT count(*) AS c FROM all_tables`);
    console.log(`all_tables total: ${total.rows?.[0]?.C}`);
    const sysCount = await conn.execute<{ C: number }>(
      `SELECT count(*) AS c FROM all_tables WHERE owner IN ('SYS','SYSTEM','XDB','WMSYS','AUDSYS','MDSYS','CTXSYS','LBACSYS','DVSYS','OLAPSYS','GSMADMIN_INTERNAL')`
    );
    console.log(`owned by core Oracle/system schemas: ${sysCount.rows?.[0]?.C}`);
    const byOwner = await conn.execute<{ OWNER: string; C: number }>(
      `SELECT owner, count(*) AS c FROM all_tables GROUP BY owner ORDER BY c DESC FETCH FIRST 12 ROWS ONLY`
    );
    console.log('\nTop owners:');
    for (const r of byOwner.rows ?? []) console.log(`  ${String(r.OWNER).padEnd(22)} ${r.C}`);
  } finally {
    await conn.close();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
