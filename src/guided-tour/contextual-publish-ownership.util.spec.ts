import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import { resolveContextualPublishDecision } from './contextual-publish-ownership.util';

const devOwnerTour = {
  createdBy: 'dev-1',
  environment: TourEnvironment.SANDBOX,
  sandboxStatus: TourSandboxStatus.PENDING,
  developerPrivate: true,
  triggerConditions: {
    source: 'contextual-engine',
    contextualEngine: { publishedByRole: 'DEVELOPER' },
  },
};

const adminOwnerTour = {
  createdBy: 'admin-1',
  environment: TourEnvironment.SANDBOX,
  sandboxStatus: TourSandboxStatus.PENDING,
  developerPrivate: false,
  triggerConditions: {
    source: 'contextual-engine',
    contextualEngine: { publishedByRole: 'ADMIN' },
  },
};

describe('resolveContextualPublishDecision', () => {
  it('creates when no existing instance', () => {
    expect(
      resolveContextualPublishDecision({
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'create' });
  });

  it('blocks approved or production instances', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          sandboxStatus: TourSandboxStatus.APPROVED,
        },
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'block', reason: 'tour_already_approved_or_live' });

    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          environment: TourEnvironment.PRODUCTION,
          sandboxStatus: TourSandboxStatus.APPROVED,
        },
        publisherId: 'admin-1',
        publisherIsAdmin: true,
        publisherIsDeveloper: false,
      }),
    ).toEqual({ action: 'block', reason: 'tour_already_approved_or_live' });
  });

  it('refreshes pending instance for the same publisher when not yet assigned to admin', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: devOwnerTour,
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'refresh' });
  });

  it('blocks developer refresh when pending tour is assigned to admin moderation', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          assignedAdminIds: ['admin-1'],
        },
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'block', reason: 'tour_awaiting_admin_moderation' });
  });

  it('allows admin takeover over pending developer-owned instance', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: devOwnerTour,
        publisherId: 'admin-1',
        publisherIsAdmin: true,
        publisherIsDeveloper: false,
      }),
    ).toEqual({ action: 'takeover' });
  });

  it('blocks developer publish over pending admin-owned instance', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: adminOwnerTour,
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'block', reason: 'tour_owned_by_higher_role' });
  });

  it('blocks admin publish over another admin pending instance', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: adminOwnerTour,
        publisherId: 'admin-2',
        publisherIsAdmin: true,
        publisherIsDeveloper: false,
      }),
    ).toEqual({ action: 'block', reason: 'tour_owned_by_another_publisher' });
  });

  it('blocks developer publish over another developer pending instance', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: devOwnerTour,
        publisherId: 'dev-2',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'block', reason: 'tour_owned_by_another_publisher' });
  });

  it('refreshes returned tour for the current owner (content only)', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          sandboxStatus: TourSandboxStatus.RETURNED,
        },
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'refresh' });
  });

  it('refreshes rejected tour for the current owner (content only)', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          sandboxStatus: TourSandboxStatus.REJECTED,
        },
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'refresh' });
  });

  it('blocks publish on returned tour when publisher is not the owner (transfer case)', () => {
    expect(
      resolveContextualPublishDecision({
        existingTour: {
          ...devOwnerTour,
          createdBy: 'dev-2',
          sandboxStatus: TourSandboxStatus.RETURNED,
        },
        publisherId: 'dev-1',
        publisherIsAdmin: false,
        publisherIsDeveloper: true,
      }),
    ).toEqual({ action: 'block', reason: 'tour_owned_by_another_publisher' });
  });
});
