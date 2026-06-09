import { buildTourExportPayload, TOUR_EXPORT_FORMAT_VERSION } from './guided-tour-export.util';
import { TourReplayPolicy } from './entities/guided-tour.entity';

describe('buildTourExportPayload', () => {
  it('strips internal ids, grants, engine metadata and sensitive simulation fields', () => {
    const payload = buildTourExportPayload({
      id: 'tour-1',
      organizationId: 'org-1',
      createdBy: 'user-1',
      name: 'Test tour',
      targetUrl: 'https://internal.trustdev.local/app?token=secret',
      developerPrivate: true,
      assignedAdminIds: ['admin-1'],
      accessGrants: [{ userId: 'u2', accessMode: 'view' as const }],
      replayPolicy: TourReplayPolicy.NEVER,
      triggerConditions: {
        source: 'contextual-engine',
        minTimeOnPage: 30,
        contextualEngine: {
          intent: 'onboarding',
          scenario: 'first_visit',
          status: 'active',
          flowVersion: 'v3',
          flowSignature: 'sig-secret',
          publishedByRole: 'ADMIN',
          score: 88,
          confidence: 0.92,
          explainability: {
            generatedFrom: ['ml-ranker'],
            signalScores: { semantic: 90, sequence: 80 },
            conflictNotes: ['overlap detected'],
            diagnostics: { rejectedNoise: 2 },
          },
          diagnostics: { pipeline: 'v2' },
        },
        apiKey: 'sk-should-not-export',
      },
      simulationContext: {
        pageUrl: 'https://internal.example.com/dashboard?apiKey=abc',
        pathname: '/dashboard',
        pageTitle: 'Internal dashboard',
        capturedAt: '2026-01-01T00:00:00Z',
        viewport: { width: 100, height: 100 },
        elements: [
          {
            selector: '#btn',
            text: 'Confidential label',
            tag: 'button',
            actionable: true,
            bbox: { top: 0, left: 0, width: 10, height: 10 },
          },
        ],
      } as any,
      steps: [
        {
          id: 'step-1',
          tourId: 'tour-1',
          orderIndex: 1,
          title: 'A',
          content: 'Body',
          stepTargetUrl: 'https://app.example.com/page?q=1',
        } as any,
      ],
    } as any);

    expect(payload.exportVersion).toBe(TOUR_EXPORT_FORMAT_VERSION);
    expect(payload.targetUrl).toBe('/app');
    expect(payload).not.toHaveProperty('organizationId');
    expect(payload.triggerConditions.minTimeOnPage).toBe(30);
    expect(payload.triggerConditions).not.toHaveProperty('source');
    expect(payload.triggerConditions).not.toHaveProperty('apiKey');
    expect(payload.triggerConditions.contextualEngine).toEqual({
      intent: 'onboarding',
      scenario: 'first_visit',
      status: 'active',
    });
    expect(payload.triggerConditions.contextualEngine).not.toHaveProperty('flowVersion');
    expect(payload.triggerConditions.contextualEngine).not.toHaveProperty('explainability');

    expect(payload.simulationContext?.pageUrl).toBeUndefined();
    expect(payload.simulationContext?.pageTitle).toBeUndefined();
    expect(payload.simulationContext?.capturedAt).toBeUndefined();
    expect(payload.simulationContext?.viewport).toBeUndefined();
    expect(payload.simulationContext?.pathname).toBe('/dashboard');
    const el = (payload.simulationContext?.elements as any[])?.[0];
    expect(el?.text).toBeUndefined();
    expect(el?.selector).toBe('#btn');

    expect(payload.steps[0].stepTargetUrl).toBe('/page');
    expect(payload.steps[0]).not.toHaveProperty('id');
  });
});
