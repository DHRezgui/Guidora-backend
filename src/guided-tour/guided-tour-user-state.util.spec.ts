import { TourEnvironment, TourReplayPolicy, TourSandboxStatus } from './entities/guided-tour.entity';
import { TourUserStateStatus } from './entities/tour-user-state.entity';
import {
  isTourBlockedByUserState,
  isTourVisibleInActiveList,
  resolveAudienceForUserStateMutation,
} from './guided-tour-user-state.util';
import { UserRole } from '../user/entities/user.entity';

describe('guided-tour-user-state.util', () => {
  const userId = 'dev-user-id';
  const tourId = 'tour-id';
  const now = new Date('2026-05-21T12:00:00.000Z');

  const baseTour = {
    id: tourId,
    name: 'Test tour',
    targetUrl: '/',
    organizationId: 'org-id',
    createdBy: userId,
    isActive: true,
    priority: 1,
    triggerConditions: { source: 'contextual-engine' },
    replayPolicy: TourReplayPolicy.NEVER,
    replayAfterDays: 0,
    currentResetVersion: 0,
    environment: TourEnvironment.PRODUCTION,
    sandboxTestStartedBy: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  it('does not block production tours when only sandbox audience state exists', () => {
    const blocked = isTourBlockedByUserState(
      baseTour,
      userId,
      [
        {
          id: 'state-1',
          tourId,
          userId,
          organizationId: 'org-id',
          environment: TourEnvironment.SANDBOX,
          status: TourUserStateStatus.COMPLETED,
          resetVersion: 0,
          seenCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
    );

    expect(blocked).toBe(false);
  });

  it('blocks production tours when production audience state is completed', () => {
    const blocked = isTourBlockedByUserState(
      baseTour,
      'regular-user-id',
      [
        {
          id: 'state-1',
          tourId,
          userId: 'regular-user-id',
          organizationId: 'org-id',
          environment: TourEnvironment.PRODUCTION,
          status: TourUserStateStatus.COMPLETED,
          resetVersion: 0,
          seenCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
    );

    expect(blocked).toBe(true);
  });

  it('blocks developer sandbox test tours when sandbox audience is completed', () => {
    const blocked = isTourBlockedByUserState(
      {
        ...baseTour,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
      },
      userId,
      [
        {
          id: 'state-1',
          tourId,
          userId,
          organizationId: 'org-id',
          environment: TourEnvironment.SANDBOX,
          status: TourUserStateStatus.COMPLETED,
          resetVersion: 0,
          seenCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
      TourEnvironment.SANDBOX,
    );

    expect(blocked).toBe(true);
  });

  it('writes sandbox audience when only sandbox test is active (approved production tour)', () => {
    const audience = resolveAudienceForUserStateMutation(
      {
        environment: TourEnvironment.PRODUCTION,
        isActive: false,
        isSandboxTestActive: true,
      },
      { userId: 'admin-id', role: UserRole.ADMIN },
    );

    expect(audience).toBe(TourEnvironment.SANDBOX);
  });

  it('does not block production when sandbox test completion exists on approved tour', () => {
    const blocked = isTourBlockedByUserState(
      {
        ...baseTour,
        isActive: true,
        isSandboxTestActive: false,
      },
      'regular-user-id',
      [
        {
          id: 'state-1',
          tourId,
          userId: 'regular-user-id',
          organizationId: 'org-id',
          environment: TourEnvironment.SANDBOX,
          status: TourUserStateStatus.COMPLETED,
          resetVersion: 0,
          seenCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
      TourEnvironment.PRODUCTION,
    );

    expect(blocked).toBe(false);
  });

  it('uses sandbox channel for admin when both sandbox test and prod are active', () => {
    const audience = resolveAudienceForUserStateMutation(
      {
        environment: TourEnvironment.PRODUCTION,
        isActive: true,
        isSandboxTestActive: true,
      },
      { userId: 'admin-id', role: UserRole.ADMIN },
    );

    expect(audience).toBe(TourEnvironment.SANDBOX);
  });

  it('hides sandbox-completed tour from sandbox runtime even when prod is active', () => {
    const tour = {
      ...baseTour,
      isActive: true,
      isSandboxTestActive: true,
      sandboxTestStartedBy: 'admin-id',
    };
    const userStates = [
      {
        id: 'state-1',
        tourId,
        userId: 'admin-id',
        organizationId: 'org-id',
        environment: TourEnvironment.SANDBOX,
        status: TourUserStateStatus.COMPLETED,
        resetVersion: 0,
        seenCount: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const visible = isTourVisibleInActiveList(
      tour,
      'admin-id',
      userStates,
      now,
      { userId: 'admin-id', userRole: UserRole.ADMIN },
      { inProductionList: true, inSandboxEnvList: false, inSandboxTestList: true },
    );

    expect(visible).toBe(false);
  });

  it('still shows production channel to end users when only sandbox audience is completed', () => {
    const tour = {
      ...baseTour,
      isActive: true,
      isSandboxTestActive: true,
    };
    const userStates = [
      {
        id: 'state-1',
        tourId,
        userId: 'end-user-id',
        organizationId: 'org-id',
        environment: TourEnvironment.SANDBOX,
        status: TourUserStateStatus.COMPLETED,
        resetVersion: 0,
        seenCount: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const visible = isTourVisibleInActiveList(
      tour,
      'end-user-id',
      userStates,
      now,
      { userId: 'end-user-id', userRole: UserRole.USER },
      { inProductionList: true, inSandboxEnvList: false, inSandboxTestList: true },
    );

    expect(visible).toBe(true);
  });

  it('hides developer-only sandbox test from non-owner developer runtime', () => {
    const tour = {
      ...baseTour,
      targetUrl: '/dashboard/sdk-tests/simple',
      triggerConditions: {
        source: 'contextual-engine',
        contextualEngine: { publishedByRole: 'DEVELOPER' },
      },
      sandboxStatus: TourSandboxStatus.PENDING,
      isActive: true,
      isSandboxTestActive: true,
      sandboxTestStartedBy: 'admin-id',
    };

    const visible = isTourVisibleInActiveList(
      tour,
      'other-dev-id',
      [],
      now,
      { userId: 'other-dev-id', userRole: UserRole.DEVELOPER },
      { inProductionList: false, inSandboxEnvList: false, inSandboxTestList: true },
    );

    expect(visible).toBe(false);
  });

  it('allows view-grant developer to access shared developer-only sandbox test', () => {
    const tour = {
      ...baseTour,
      createdBy: 'owner-dev-id',
      targetUrl: '/',
      triggerConditions: {
        source: 'contextual-engine',
        contextualEngine: { publishedByRole: 'DEVELOPER' },
      },
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      isActive: true,
      isSandboxTestActive: false,
      sandboxTestStartedBy: 'owner-dev-id',
      accessGrants: [{ userId: 'peer-dev-id', accessMode: 'view' as const }],
    };

    const visible = isTourVisibleInActiveList(
      tour,
      'peer-dev-id',
      [],
      now,
      { userId: 'peer-dev-id', userRole: UserRole.DEVELOPER },
      { inProductionList: false, inSandboxEnvList: true, inSandboxTestList: false },
    );

    expect(visible).toBe(true);
  });

  it('allows admin runtime to view developer-only sandbox test', () => {
    const tour = {
      ...baseTour,
      targetUrl: '/dashboard/sdk-tests/simple',
      triggerConditions: {
        source: 'contextual-engine',
        contextualEngine: { publishedByRole: 'DEVELOPER' },
      },
      sandboxStatus: TourSandboxStatus.PENDING,
      isActive: true,
      isSandboxTestActive: true,
      sandboxTestStartedBy: 'admin-id',
    };

    const visible = isTourVisibleInActiveList(
      tour,
      'admin-id',
      [],
      now,
      { userId: 'admin-id', userRole: UserRole.ADMIN },
      { inProductionList: false, inSandboxEnvList: false, inSandboxTestList: true },
    );

    expect(visible).toBe(true);
  });

  it('hides sandbox test from creator when admin launched it', () => {
    const tour = {
      ...baseTour,
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      isActive: true,
      sandboxTestStartedBy: 'admin-id',
    };

    const visible = isTourVisibleInActiveList(
      tour,
      userId,
      [],
      now,
      { userId, userRole: UserRole.DEVELOPER },
      { inProductionList: false, inSandboxEnvList: true, inSandboxTestList: false },
    );

    expect(visible).toBe(false);
  });

  it('shows sandbox test only to launcher when creator launched it', () => {
    const tour = {
      ...baseTour,
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      isActive: true,
      sandboxTestStartedBy: userId,
    };

    const visible = isTourVisibleInActiveList(
      tour,
      userId,
      [],
      now,
      { userId, userRole: UserRole.DEVELOPER },
      { inProductionList: false, inSandboxEnvList: true, inSandboxTestList: false },
    );

    expect(visible).toBe(true);
  });

  it('honours explicit X-Tour-Audience header value', () => {
    const audience = resolveAudienceForUserStateMutation(
      {
        environment: TourEnvironment.PRODUCTION,
        isActive: true,
        isSandboxTestActive: true,
      },
      { userId: 'admin-id', role: UserRole.ADMIN },
      TourEnvironment.SANDBOX,
    );

    expect(audience).toBe(TourEnvironment.SANDBOX);
  });
});
