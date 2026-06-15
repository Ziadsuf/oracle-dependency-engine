// Computed risk scoring (replaces the prototype's hardcoded scores).
// impactScore = clamp(0..100,
//   Σ over impacted ( typeWeight[type] × depthDecay^(depth−1) × confidence )
//   + complexityBonus(target))

export interface ImpactedForScoring {
  type: string;
  depth: number;
  confidence: number;
}

export const TYPE_WEIGHTS: Record<string, number> = {
  form: 10,
  report: 8,
  package: 6,
  table: 5,
  packagebody: 4,
  procedure: 4,
  function: 4,
  programunit: 4,
  view: 3,
  materializedview: 3,
  dbtrigger: 3,
  reportquery: 3,
  block: 2,
  formtrigger: 2,
  sequence: 2,
  synonym: 1,
  item: 1,
  parameter: 1,
  column: 1,
  index: 1,
  constraint: 1,
  unresolved: 1,
};

export const DEPTH_DECAY = 0.6;

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export function scoreImpact(
  impacted: ImpactedForScoring[],
  targetComplexity = 0
): { impactScore: number; riskLevel: RiskLevel } {
  let score = 0;
  for (const obj of impacted) {
    const weight = TYPE_WEIGHTS[obj.type] ?? 1;
    score += weight * Math.pow(DEPTH_DECAY, Math.max(0, obj.depth - 1)) * obj.confidence;
  }
  score += Math.min(15, targetComplexity / 10);
  const impactScore = Math.min(100, Math.round(score));

  let riskLevel: RiskLevel = 'Low';
  if (impactScore > 80) riskLevel = 'Critical';
  else if (impactScore > 60) riskLevel = 'High';
  else if (impactScore > 35) riskLevel = 'Medium';
  return { impactScore, riskLevel };
}

export function buildRecommendation(
  targetLabel: string,
  riskLevel: RiskLevel,
  byType: Record<string, number>,
  unresolvedCount: number
): string {
  const breakdown = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`)
    .join(', ');
  const consumers = breakdown ? ` Directly or transitively affected: ${breakdown}.` : ' No dependents found in the graph.';
  const caveat = unresolvedCount > 0 ? ` ${unresolvedCount} reference(s) remain unresolved — actual blast radius may be larger.` : '';

  switch (riskLevel) {
    case 'Critical':
      return `High-risk change to ${targetLabel}.${consumers} Freeze schema changes until dependent Forms/Reports are migrated or shimmed; stage the change behind a compatibility view and regression-test every consumer.${caveat}`;
    case 'High':
      return `Significant blast radius for ${targetLabel}.${consumers} Plan a coordinated release: update dependent PL/SQL first, keep API/cursor contracts stable for client artifacts.${caveat}`;
    case 'Medium':
      return `Moderate impact for ${targetLabel}.${consumers} Review direct dependents and update affected modules in the same change set.${caveat}`;
    default:
      return `Low impact for ${targetLabel}.${consumers} Safe to proceed with standard review.${caveat}`;
  }
}
