import {
  isAdminOriginatedTour,
  isAdminSandboxPrivateTour,
  isDeveloperModerationApprovedSandbox,
  isDeveloperOriginatedTour,
  isPendingVisibleToAdmin,
  isTourSharingLockedByDeveloperApproval,
} from './guided-tour-visibility.util';
import { canActorViewTourWithGrants, resolveEditorAccessMode } from './guided-tour-access.util';
import { canAdminTransferTourEnvironment } from './guided-tour-permissions.util';
import { UserRole } from '../user/entities/user.entity';
import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';

describe('isDeveloperOriginatedTour', () => {
  it('returns true for manual sandbox tour with author', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'dev-1',
        developerPrivate: true,
        assignedAdminIds: [],
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        targetUrl: '/dashboard',
        triggerConditions: {},
      }),
    ).toBe(true);
  });

  it('returns true for legacy sandbox autogen without publishedByRole', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'dev-1',
        developerPrivate: true,
        assignedAdminIds: [],
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: { source: 'contextual-engine', contextualEngine: {} },
      }),
    ).toBe(true);
  });

  it('returns false for legacy production autogen without publishedByRole', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'dev-1',
        developerPrivate: false,
        assignedAdminIds: [],
        environment: TourEnvironment.PRODUCTION,
        sandboxStatus: null,
        targetUrl: '/app/home',
        triggerConditions: { source: 'contextual-engine', contextualEngine: {} },
      }),
    ).toBe(false);
  });

  it('returns false for admin-published contextual tours', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'admin-1',
        developerPrivate: false,
        assignedAdminIds: [],
        environment: TourEnvironment.PRODUCTION,
        sandboxStatus: TourSandboxStatus.APPROVED,
        targetUrl: '/app/home',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: { publishedByRole: 'ADMIN' },
        },
      }),
    ).toBe(false);
  });

  it('returns false for admin manual sandbox tour (developerPrivate false)', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'admin-1',
        developerPrivate: false,
        assignedAdminIds: [],
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        targetUrl: '/dashboard',
        triggerConditions: {},
      }),
    ).toBe(false);
  });

  it('returns false for legacy sandbox autogen by admin without publishedByRole', () => {
    expect(
      isDeveloperOriginatedTour({
        createdBy: 'admin-1',
        developerPrivate: false,
        assignedAdminIds: [],
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: { source: 'contextual-engine', contextualEngine: {} },
      }),
    ).toBe(false);
  });
});

describe('admin vs developer moderation flow', () => {
  const adminSandboxAfterProdReturn = {
    createdBy: 'admin-1',
    developerPrivate: false,
    assignedAdminIds: [] as string[],
    environment: TourEnvironment.SANDBOX,
    sandboxStatus: TourSandboxStatus.APPROVED,
    targetUrl: '/',
    triggerConditions: {
      source: 'contextual-engine',
      contextualEngine: { publishedByRole: 'ADMIN' },
    },
  };

  const devApprovedSandbox = {
    createdBy: 'dev-1',
    developerPrivate: true,
    assignedAdminIds: ['admin-1'],
    environment: TourEnvironment.SANDBOX,
    sandboxStatus: TourSandboxStatus.APPROVED,
    targetUrl: '/dashboard',
    triggerConditions: {},
  };

  it('treats admin autogen sandbox as admin-originated even when approved', () => {
    expect(isAdminOriginatedTour(adminSandboxAfterProdReturn)).toBe(true);
    expect(isDeveloperModerationApprovedSandbox(adminSandboxAfterProdReturn)).toBe(false);
    expect(isTourSharingLockedByDeveloperApproval(adminSandboxAfterProdReturn)).toBe(false);
  });

  it('keeps developer moderation badges and sharing lock on dev-approved sandbox', () => {
    expect(isAdminOriginatedTour(devApprovedSandbox)).toBe(false);
    expect(isDeveloperModerationApprovedSandbox(devApprovedSandbox)).toBe(true);
    expect(isTourSharingLockedByDeveloperApproval(devApprovedSandbox)).toBe(true);
  });

  it('allows only production manager to transfer admin-originated production tours', () => {
    const adminProdTour = {
      createdBy: 'admin-1',
      developerPrivate: false,
      assignedAdminIds: [] as string[],
      productionManagedByAdminId: 'admin-1',
      environment: TourEnvironment.PRODUCTION,
      sandboxStatus: TourSandboxStatus.APPROVED,
      targetUrl: '/',
      triggerConditions: {
        source: 'contextual-engine',
        contextualEngine: { publishedByRole: 'ADMIN' },
      },
    };
    expect(
      canAdminTransferTourEnvironment(adminProdTour, { id: 'admin-1', role: UserRole.ADMIN }),
    ).toBe(true);
    expect(
      canAdminTransferTourEnvironment(adminProdTour, { id: 'admin-2', role: UserRole.ADMIN }),
    ).toBe(false);
    expect(
      canActorViewTourWithGrants(adminProdTour, { id: 'admin-2', role: UserRole.ADMIN }),
    ).toBe(true);
  });

  it('puts non-manager admins in read-only mode for delegated admin production tours', () => {
    const delegatedProdTour = {
      createdBy: 'admin-1',
      developerPrivate: false,
      assignedAdminIds: [] as string[],
      productionManagedByAdminId: 'admin-2',
      environment: TourEnvironment.PRODUCTION,
      sandboxStatus: TourSandboxStatus.APPROVED,
      targetUrl: '/',
      triggerConditions: {},
    };
    expect(
      canActorViewTourWithGrants(delegatedProdTour, { id: 'admin-3', role: UserRole.ADMIN }),
    ).toBe(true);
    expect(
      resolveEditorAccessMode(delegatedProdTour, { id: 'admin-3', role: UserRole.ADMIN }),
    ).toBe('view');
    expect(
      resolveEditorAccessMode(delegatedProdTour, { id: 'admin-2', role: UserRole.ADMIN }),
    ).toBe('admin');
  });

  it('marks admin sandbox tours as private to owner until production', () => {
    const adminSandbox = {
      createdBy: 'admin-1',
      developerPrivate: false,
      assignedAdminIds: [] as string[],
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      targetUrl: '/',
      triggerConditions: {},
    };
    expect(isAdminSandboxPrivateTour(adminSandbox)).toBe(true);
    expect(
      canActorViewTourWithGrants(adminSandbox, { id: 'admin-2', role: UserRole.ADMIN }),
    ).toBe(false);
    expect(
      canActorViewTourWithGrants(adminSandbox, { id: 'admin-1', role: UserRole.ADMIN }),
    ).toBe(true);
    expect(
      canActorViewTourWithGrants(
        { ...adminSandbox, environment: TourEnvironment.PRODUCTION },
        { id: 'admin-2', role: UserRole.ADMIN },
      ),
    ).toBe(true);
  });
});

describe('isPendingVisibleToAdmin', () => {
  it('shows admin manual pending sandbox only to the owner admin', () => {
    const tour = {
      createdBy: 'admin-1',
      developerPrivate: false,
      assignedAdminIds: [],
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      targetUrl: '/dashboard',
      triggerConditions: {},
    };
    expect(isPendingVisibleToAdmin(tour, 'admin-1')).toBe(true);
    expect(isPendingVisibleToAdmin(tour, 'admin-2')).toBe(false);
  });

  it('shows legacy sandbox autogen pending only when assigned', () => {
    const tour = {
      createdBy: 'dev-1',
      developerPrivate: true,
      assignedAdminIds: ['admin-1'],
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
      targetUrl: '/dashboard/sdk-tests/simple',
      triggerConditions: { source: 'contextual-engine', contextualEngine: {} },
    };
    expect(isPendingVisibleToAdmin(tour, 'admin-1')).toBe(true);
    expect(isPendingVisibleToAdmin(tour, 'admin-2')).toBe(false);
  });
});
