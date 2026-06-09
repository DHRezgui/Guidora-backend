import { validateJourneyBlueprintPayload } from './journey-blueprint-catalog';

describe('validateJourneyBlueprintPayload', () => {
  const valid = {
    id: 'custom.saas.crm',
    name: 'CRM pipeline',
    description: 'Guide découverte pipeline commercial',
    vertical: 'saas',
    intent: 'primary-action',
    minResolvedSteps: 2,
    steps: [
      {
        semanticRole: 'saas.dashboard-overview',
        title: 'Pipeline',
        description: 'Ouvrez le pipeline.',
        required: true,
        targetHints: {
          semanticTokens: ['pipeline', 'deals'],
          selectorHints: ['[data-tour-id="pipeline"]'],
        },
      },
    ],
  };

  it('accepts a minimal valid blueprint', () => {
    const result = validateJourneyBlueprintPayload(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unknown semantic role', () => {
    const result = validateJourneyBlueprintPayload({
      ...valid,
      steps: [{ ...valid.steps[0], semanticRole: 'unknown.role' }],
    });
    expect(result.valid).toBe(false);
  });
});
