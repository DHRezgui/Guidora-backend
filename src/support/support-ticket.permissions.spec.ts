import { UserRole } from '../user/entities/user.entity';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import {
  buildCapabilities,
  canChangeAssignmentTo,
  canManageCollaborators,
  type SupportActor,
} from './support-ticket.permissions';

describe('support-ticket.permissions', () => {
  const assigneeAdmin: SupportActor = {
    id: 'admin-1',
    role: UserRole.ADMIN,
  };
  const otherAdmin: SupportActor = {
    id: 'admin-2',
    role: UserRole.ADMIN,
  };
  const assigneeDev: SupportActor = {
    id: 'dev-1',
    role: UserRole.DEVELOPER,
  };

  const assignedTicket = {
    assignedTo: 'admin-1',
    status: TicketStatus.IN_PROGRESS,
    collaborators: [],
  } as SupportTicket;

  it('allows only the primary assignee to manage collaborators', () => {
    expect(canManageCollaborators(assignedTicket, assigneeAdmin)).toBe(true);
    expect(canManageCollaborators(assignedTicket, otherAdmin)).toBe(false);
    expect(
      canManageCollaborators({ ...assignedTicket, assignedTo: 'dev-1' } as SupportTicket, assigneeDev),
    ).toBe(true);
  });

  it('exposes archive/delete=false for non-assignee admins in capabilities', () => {
    const caps = buildCapabilities(assignedTicket, otherAdmin);
    expect(caps.canManageCollaborators).toBe(false);
    expect(caps.canArchive).toBe(false);
    expect(caps.canUnarchive).toBe(false);
    expect(caps.canDelete).toBe(false);
    expect(caps.canReply).toBe(false);
    expect(caps.canTakeOver).toBe(true);
  });

  it('allows assignee admin to archive and delete (active ticket)', () => {
    const caps = buildCapabilities(assignedTicket, assigneeAdmin);
    expect(caps.canArchive).toBe(true);
    expect(caps.canUnarchive).toBe(false);
    expect(caps.canReopen).toBe(false);
    expect(caps.canDelete).toBe(true);
    expect(caps.isInformational).toBe(false);
    expect(caps.canReply).toBe(true);
    expect(caps.canManageCollaborators).toBe(true);
  });

  it('makes CLOSED tickets informational (no reply/collab/gestion edits)', () => {
    const closed = {
      ...assignedTicket,
      status: TicketStatus.CLOSED,
    } as SupportTicket;
    const caps = buildCapabilities(closed, assigneeAdmin);
    expect(caps.isInformational).toBe(true);
    expect(caps.canArchive).toBe(false);
    expect(caps.canUnarchive).toBe(true);
    expect(caps.canReopen).toBe(false);
    expect(caps.canReply).toBe(false);
    expect(caps.canEditFields).toBe(false);
    expect(caps.canEditStatus).toBe(false);
    expect(caps.canManageCollaborators).toBe(false);
    expect(caps.canAssignToAnyone).toBe(false);
  });

  it('allows any org admin to unarchive / reopen (assignee AFK break-glass)', () => {
    const closed = {
      ...assignedTicket,
      status: TicketStatus.CLOSED,
    } as SupportTicket;
    const resolved = {
      ...assignedTicket,
      status: TicketStatus.RESOLVED,
    } as SupportTicket;
    expect(buildCapabilities(closed, otherAdmin).canUnarchive).toBe(true);
    expect(buildCapabilities(resolved, otherAdmin).canReopen).toBe(true);
    expect(buildCapabilities(closed, assigneeDev).canUnarchive).toBe(false);
  });

  it('makes RESOLVED tickets informational with reopen', () => {
    const resolved = {
      ...assignedTicket,
      status: TicketStatus.RESOLVED,
    } as SupportTicket;
    const caps = buildCapabilities(resolved, assigneeAdmin);
    expect(caps.isInformational).toBe(true);
    expect(caps.canReopen).toBe(true);
    expect(caps.canUnarchive).toBe(false);
    expect(caps.canReply).toBe(false);
    expect(caps.canArchive).toBe(true);
  });

  it('restricts resolve and status edits to the primary assignee', () => {
    const withWriteCollab = {
      ...assignedTicket,
      assignedTo: 'admin-1',
      collaborators: [{ userId: 'dev-1', access: 'write', addedAt: new Date().toISOString(), addedBy: 'admin-1' }],
    } as SupportTicket;
    const primaryCaps = buildCapabilities(withWriteCollab, assigneeAdmin);
    const collabCaps = buildCapabilities(withWriteCollab, assigneeDev);
    expect(primaryCaps.canResolve).toBe(true);
    expect(primaryCaps.canEditStatus).toBe(true);
    expect(collabCaps.canReply).toBe(true);
    expect(collabCaps.canEditFields).toBe(true);
    expect(collabCaps.canResolve).toBe(false);
    expect(collabCaps.canEditStatus).toBe(false);
  });

  it('allows force-unlock when a lock is active (incl. informational recovery)', () => {
    const lockedResolved = {
      ...assignedTicket,
      status: TicketStatus.RESOLVED,
      editLockedBy: 'dev-1',
      editLockExpiresAt: new Date(Date.now() + 60_000),
    } as SupportTicket;
    const caps = buildCapabilities(lockedResolved, otherAdmin);
    expect(caps.canForceUnlock).toBe(true);
    expect(buildCapabilities(lockedResolved, assigneeAdmin).canForceUnlock).toBe(true);
    expect(buildCapabilities(assignedTicket, otherAdmin).canForceUnlock).toBe(false);
  });

  it('restricts non-assignee admins to take-over only', () => {
    const ticket = {
      ...assignedTicket,
      assignedAt: new Date('2020-01-01T00:00:00.000Z'),
    } as SupportTicket;
    expect(canChangeAssignmentTo(ticket, otherAdmin, null)).toBe(false);
    expect(canChangeAssignmentTo(ticket, otherAdmin, 'dev-1')).toBe(false);
    expect(canChangeAssignmentTo(ticket, otherAdmin, 'admin-2')).toBe(true);
    expect(canChangeAssignmentTo(ticket, assigneeAdmin, null)).toBe(true);
    expect(canChangeAssignmentTo(ticket, assigneeAdmin, 'dev-1')).toBe(true);

    const caps = buildCapabilities(ticket, otherAdmin);
    expect(caps.canAssignToAnyone).toBe(false);
    expect(caps.canUnassign).toBe(false);
    expect(caps.canTakeOver).toBe(true);
    expect(caps.takeOverAvailableAt).toBeNull();
    expect(caps.canAssign).toBe(true);
  });

  it('blocks take-over during cooldown', () => {
    const ticket = {
      assignedTo: 'admin-1',
      status: TicketStatus.IN_PROGRESS,
      assignedAt: new Date(),
      collaborators: [],
      assignee: { id: 'admin-1', isActive: true } as SupportTicket['assignee'],
    } as SupportTicket;
    expect(canChangeAssignmentTo(ticket, otherAdmin, 'admin-2')).toBe(false);
    const caps = buildCapabilities(ticket, otherAdmin);
    expect(caps.canTakeOver).toBe(false);
    expect(caps.takeOverAvailableAt).toBeTruthy();
    expect(caps.assigneeInactive).toBe(false);
  });

  it('bypasses take-over cooldown when assignee is inactive', () => {
    const ticket = {
      assignedTo: 'admin-1',
      status: TicketStatus.IN_PROGRESS,
      assignedAt: new Date(),
      collaborators: [],
      assignee: { id: 'admin-1', isActive: false } as SupportTicket['assignee'],
    } as SupportTicket;
    expect(canChangeAssignmentTo(ticket, otherAdmin, 'admin-2')).toBe(true);
    const caps = buildCapabilities(ticket, otherAdmin);
    expect(caps.canTakeOver).toBe(true);
    expect(caps.takeOverAvailableAt).toBeNull();
    expect(caps.assigneeInactive).toBe(true);
  });

  it('exposes canForceTakeOver when lock is active and take-over is allowed', () => {
    const ticket = {
      assignedTo: 'admin-1',
      status: TicketStatus.IN_PROGRESS,
      assignedAt: new Date('2020-01-01T00:00:00.000Z'),
      collaborators: [],
      editLockedBy: 'dev-1',
      editLockExpiresAt: new Date(Date.now() + 60_000),
      assignee: { id: 'admin-1', isActive: true } as SupportTicket['assignee'],
    } as SupportTicket;
    const caps = buildCapabilities(ticket, otherAdmin);
    expect(caps.canTakeOver).toBe(true);
    expect(caps.canForceTakeOver).toBe(true);
  });
});
