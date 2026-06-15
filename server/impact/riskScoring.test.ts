import { describe, it, expect } from 'vitest';
import { scoreImpact, buildRecommendation } from './riskScoring';

describe('scoreImpact', () => {
  it('returns Low for an empty blast radius', () => {
    const { impactScore, riskLevel } = scoreImpact([]);
    expect(impactScore).toBe(0);
    expect(riskLevel).toBe('Low');
  });

  it('weights closer, heavier types more', () => {
    const formAtDepth1 = scoreImpact([{ type: 'form', depth: 1, confidence: 1 }]);
    const formAtDepth3 = scoreImpact([{ type: 'form', depth: 3, confidence: 1 }]);
    const itemAtDepth1 = scoreImpact([{ type: 'item', depth: 1, confidence: 1 }]);
    expect(formAtDepth1.impactScore).toBeGreaterThan(formAtDepth3.impactScore);
    expect(formAtDepth1.impactScore).toBeGreaterThan(itemAtDepth1.impactScore);
  });

  it('discounts low-confidence (dynamic SQL) dependents', () => {
    const certain = scoreImpact([{ type: 'package', depth: 1, confidence: 1 }]);
    const heuristic = scoreImpact([{ type: 'package', depth: 1, confidence: 0.4 }]);
    expect(heuristic.impactScore).toBeLessThan(certain.impactScore);
  });

  it('reaches Critical for a wide blast radius and clamps at 100', () => {
    const wide = Array.from({ length: 30 }, () => ({ type: 'form', depth: 1, confidence: 1 }));
    const { impactScore, riskLevel } = scoreImpact(wide, 500);
    expect(impactScore).toBe(100);
    expect(riskLevel).toBe('Critical');
  });
});

describe('buildRecommendation', () => {
  it('mentions the dominant dependent types and unresolved caveat', () => {
    const text = buildRecommendation('EMPLOYEES (table)', 'High', { form: 3, package: 2 }, 1);
    expect(text).toContain('EMPLOYEES (table)');
    expect(text).toContain('3 forms');
    expect(text).toContain('unresolved');
  });
});
