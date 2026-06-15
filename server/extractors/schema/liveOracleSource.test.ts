import { describe, it, expect } from 'vitest';
import { mapDictionaryRows, oracleConfigFromEnv, type DictionaryRows } from './liveOracleSource';

function rows(overrides: Partial<DictionaryRows> = {}): DictionaryRows {
  return {
    artifact: 'LIVE_CONNECTION',
    objects: [],
    dependencies: [],
    foreignKeys: [],
    triggers: [],
    synonyms: [],
    source: [],
    ...overrides,
  };
}

describe('mapDictionaryRows', () => {
  it('builds DEPENDS_ON edges from dictionary rows (confidence 1.0)', () => {
    const fragment = mapDictionaryRows(
      rows({
        objects: [
          { owner: 'HR', name: 'EMP_V', type: 'VIEW', status: 'VALID' },
          { owner: 'HR', name: 'EMPLOYEES', type: 'TABLE', status: 'VALID' },
        ],
        dependencies: [
          { owner: 'HR', name: 'EMP_V', type: 'VIEW', refOwner: 'HR', refName: 'EMPLOYEES', refType: 'TABLE' },
        ],
      })
    );
    const ids = fragment.nodes.map((n) => n.id);
    expect(ids).toContain('view:HR.EMP_V');
    expect(ids).toContain('table:HR.EMPLOYEES');
    expect(fragment.edges).toContainEqual(
      expect.objectContaining({ from: 'view:HR.EMP_V', to: 'table:HR.EMPLOYEES', relType: 'DEPENDS_ON', confidence: 1 })
    );
  });

  it('skips Oracle-internal owners during bulk discovery', () => {
    const fragment = mapDictionaryRows(
      rows({ objects: [{ owner: 'DVSYS', name: 'X', type: 'TABLE', status: 'VALID' }] })
    );
    expect(fragment.nodes).toHaveLength(0);
  });

  it('honors an Oracle-internal owner when it is explicitly requested', () => {
    const fragment = mapDictionaryRows(
      rows({ objects: [{ owner: 'DVSYS', name: 'X', type: 'TABLE', status: 'VALID' }] }),
      ['DVSYS']
    );
    expect(fragment.nodes.map((n) => n.id)).toContain('table:DVSYS.X');
  });

  it('maps FK and trigger relationships', () => {
    const fragment = mapDictionaryRows(
      rows({
        foreignKeys: [{ owner: 'HR', table: 'EMPLOYEES', refOwner: 'HR', refTable: 'DEPARTMENTS' }],
        triggers: [{ owner: 'HR', name: 'TRG_AUD', tableOwner: 'HR', tableName: 'EMPLOYEES' }],
      })
    );
    expect(fragment.edges).toContainEqual(
      expect.objectContaining({ from: 'table:HR.EMPLOYEES', to: 'table:HR.DEPARTMENTS', relType: 'FK_TO' })
    );
    expect(fragment.edges).toContainEqual(
      expect.objectContaining({ from: 'dbtrigger:HR.TRG_AUD', to: 'table:HR.EMPLOYEES', relType: 'ATTACHED_TO' })
    );
  });

  it('marks invalid objects from the dictionary status', () => {
    const fragment = mapDictionaryRows(
      rows({ objects: [{ owner: 'HR', name: 'BROKEN_V', type: 'VIEW', status: 'INVALID' }] })
    );
    expect(fragment.nodes[0].status).toBe('INVALID');
  });
});

describe('oracleConfigFromEnv', () => {
  it('returns null without a connect string', () => {
    expect(oracleConfigFromEnv({})).toBeNull();
  });

  it('reads config from env', () => {
    expect(
      oracleConfigFromEnv({ ORACLE_USER: 'u', ORACLE_PASSWORD: 'p', ORACLE_CONNECT_STRING: 'h:1521/PDB' })
    ).toEqual({ user: 'u', password: 'p', connectString: 'h:1521/PDB' });
  });
});
