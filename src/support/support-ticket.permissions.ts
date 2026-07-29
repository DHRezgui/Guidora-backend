import { UserRole } from '../user/entities/user.entity';
import {
  SupportTicket,
  SupportTicketCollaborator,
  TicketStatus,
  type SupportCollaboratorAccess,
} from './entities/support-ticket.entity';

export type SupportActor = {
  id: string;
  role: UserRole;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type SupportTicketCapabilities = {
  canView: boolean;
  canReply: boolean;
  canResolve: boolean;
  canArchive: boolean;
  canUnarchive: boolean;
  /** Reopen a RESOLVED ticket back to active treatment. */
  canReopen: boolean;
  canDelete: boolean;
  canEditFields: boolean;
  /** Primary assignee only — status transitions (incl. RESOLVED / CLOSED via dropdown). */
  canEditStatus: boolean;
  /** Admin may change assignment in some form (full control or take-over). */
  canAssign: boolean;
  /** Show full assignee list + « Non assigné » (unassigned ticket or primary assignee). */
  canAssignToAnyone: boolean;
  /** Primary assignee (or unassigned no-op) may clear assignment. */
  canUnassign: boolean;
  /** Non-assignee admin may take over now (cooldown clear). */
  canTakeOver: boolean;
  /** When set, take-over is temporarily blocked until this instant (ISO). */
  takeOverAvailableAt: string | null;
  canManageCollaborators: boolean;
  canAcquireLock: boolean;
  canForceUnlock: boolean;
  /** Take-over while a foreign edit lock is active (atomic unlock + self-assign). */
  canForceTakeOver: boolean;
  mustSelfAssignToAct: boolean;
  /** RESOLVED / CLOSED — informational view only (no treat / collab / gestion edits). */
  isInformational: boolean;
  /** Primary assignee missing or deactivated — cooldown bypass for take-over. */
  assigneeInactive: boolean;
};

export function normalizeCollaborators(
  raw: SupportTicketCollaborator[] | null | undefined,
): SupportTicketCollaborator[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c) =>
      c &&
      typeof c.userId === 'string' &&
      (c.access === 'read' || c.access === 'write'),
  );
}

export function findCollaborator(
  ticket: SupportTicket,
  userId: string,
): SupportTicketCollaborator | null {
  return normalizeCollaborators(ticket.collaborators).find((c) => c.userId === userId) ?? null;
}

export function isTicketAssigned(ticket: SupportTicket): boolean {
  return Boolean(ticket.assignedTo);
}

export function isPrimaryAssignee(ticket: SupportTicket, userId: string): boolean {
  return ticket.assignedTo === userId;
}

/** Resolved / archived — documentation view; treatment requires reopen/unarchive. */
export function isTicketInformational(ticket: SupportTicket): boolean {
  return ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED;
}

export function isTicketActive(ticket: SupportTicket): boolean {
  return ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.IN_PROGRESS;
}

export function isLockActive(ticket: SupportTicket, now = new Date()): boolean {
  if (!ticket.editLockedBy || !ticket.editLockExpiresAt) return false;
  return ticket.editLockExpiresAt.getTime() > now.getTime();
}

export function isLockHeldBy(ticket: SupportTicket, userId: string, now = new Date()): boolean {
  return isLockActive(ticket, now) && ticket.editLockedBy === userId;
}

export function canViewTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  if (actor.role === UserRole.ADMIN) return true;
  if (actor.role === UserRole.DEVELOPER) {
    return isPrimaryAssignee(ticket, actor.id) || Boolean(findCollaborator(ticket, actor.id));
  }
  return false;
}

/** Reply / field edits: active ticket + assigned + (assignee OR write collaborator). */
export function canWriteOnTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  if (!isTicketActive(ticket)) return false;
  if (!isTicketAssigned(ticket)) return false;
  if (isPrimaryAssignee(ticket, actor.id)) return true;
  return findCollaborator(ticket, actor.id)?.access === 'write';
}

/** Archive: primary assignee on an active or resolved ticket (not already archived). */
export function canArchiveTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  if (!isTicketAssigned(ticket)) return false;
  if (ticket.status === TicketStatus.CLOSED) return false;
  if (!isTicketActive(ticket) && ticket.status !== TicketStatus.RESOLVED) return false;
  return isPrimaryAssignee(ticket, actor.id);
}

/**
 * Unarchive: CLOSED → active.
 * Any org ADMIN (break-glass if assignee AFK); else primary assignee only.
 * Assignee is preserved for audit — ownership change only via take-over.
 */
export function canUnarchiveTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  if (ticket.status !== TicketStatus.CLOSED) return false;
  if (actor.role === UserRole.ADMIN) return true;
  if (!isTicketAssigned(ticket)) return false;
  return isPrimaryAssignee(ticket, actor.id);
}

/**
 * Reopen: RESOLVED → active.
 * Any org ADMIN (break-glass if assignee AFK); else primary assignee only.
 */
export function canReopenTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  if (ticket.status !== TicketStatus.RESOLVED) return false;
  if (actor.role === UserRole.ADMIN) return true;
  if (!isTicketAssigned(ticket)) return false;
  return isPrimaryAssignee(ticket, actor.id);
}

/** Resolve / mark done: primary assignee only (not write collaborators). */
export function canResolveTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  return canWriteOnTicket(ticket, actor) && isPrimaryAssignee(ticket, actor.id);
}

/** Status dropdown: primary assignee only on active tickets. */
export function canEditTicketStatus(ticket: SupportTicket, actor: SupportActor): boolean {
  return canWriteOnTicket(ticket, actor) && isPrimaryAssignee(ticket, actor.id);
}

/** Soft-delete: org admin who is the primary assignee only. */
export function canDeleteTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  return actor.role === UserRole.ADMIN && isPrimaryAssignee(ticket, actor.id);
}

export function canAssignTicket(actor: SupportActor): boolean {
  return actor.role === UserRole.ADMIN;
}

/** Full assignee picker — only on active tickets (OPEN / IN_PROGRESS). */
export function canAssignToAnyone(ticket: SupportTicket, actor: SupportActor): boolean {
  if (!canAssignTicket(actor)) return false;
  if (!isTicketActive(ticket)) return false;
  return !isTicketAssigned(ticket) || isPrimaryAssignee(ticket, actor.id);
}

export function canUnassignTicket(ticket: SupportTicket, actor: SupportActor): boolean {
  return canAssignToAnyone(ticket, actor);
}

/** Other admin on an assigned ticket (ignores cooldown). Allowed on informational tickets. */
export function isTakeOverCandidate(ticket: SupportTicket, actor: SupportActor): boolean {
  if (!canAssignTicket(actor)) return false;
  return isTicketAssigned(ticket) && !isPrimaryAssignee(ticket, actor.id);
}

/**
 * Break-glass: assignee relation missing or user deactivated.
 * Remaining org admins may take over without waiting for the cooldown.
 */
export function isAssigneeInactive(ticket: SupportTicket): boolean {
  if (!ticket.assignedTo) return false;
  if (!ticket.assignee) return true;
  return ticket.assignee.isActive === false;
}

/** Cooldown after the last assignment change — blocks successive take-overs. */
export const SUPPORT_TAKEOVER_COOLDOWN_MS = 45_000;

export function getTakeOverCooldownRemainingMs(
  ticket: SupportTicket,
  now = new Date(),
): number {
  if (isAssigneeInactive(ticket)) return 0;
  if (!ticket.assignedAt || !ticket.assignedTo) return 0;
  const elapsed = now.getTime() - new Date(ticket.assignedAt).getTime();
  return Math.max(0, SUPPORT_TAKEOVER_COOLDOWN_MS - elapsed);
}

/** Other admin may take ownership now (cooldown elapsed or inactive assignee). */
export function canTakeOverTicket(
  ticket: SupportTicket,
  actor: SupportActor,
  now = new Date(),
): boolean {
  if (!isTakeOverCandidate(ticket, actor)) return false;
  return getTakeOverCooldownRemainingMs(ticket, now) === 0;
}

/**
 * Validates a concrete assignment change.
 * - Active + unassigned / primary assignee: any target (including null).
 * - Other admin (incl. informational): only self take-over after cooldown.
 */
export function canChangeAssignmentTo(
  ticket: SupportTicket,
  actor: SupportActor,
  nextAssignedTo: string | null,
  now = new Date(),
): boolean {
  if (!canAssignTicket(actor)) return false;
  if (canAssignToAnyone(ticket, actor)) return true;
  if (nextAssignedTo !== actor.id) return false;
  return canTakeOverTicket(ticket, actor, now);
}

/** Only the primary assignee on an active ticket manages developer collaborators. */
export function canManageCollaborators(ticket: SupportTicket, actor: SupportActor): boolean {
  if (!isTicketActive(ticket)) return false;
  if (!isTicketAssigned(ticket)) return false;
  return isPrimaryAssignee(ticket, actor.id);
}

export function buildCapabilities(
  ticket: SupportTicket,
  actor: SupportActor,
  now = new Date(),
): SupportTicketCapabilities {
  const assigned = isTicketAssigned(ticket);
  const informational = isTicketInformational(ticket);
  const write = canWriteOnTicket(ticket, actor);
  const assignToAnyone = canAssignToAnyone(ticket, actor);
  const takeOverCandidate = isTakeOverCandidate(ticket, actor);
  const assigneeInactive = isAssigneeInactive(ticket);
  const cooldownMs = takeOverCandidate ? getTakeOverCooldownRemainingMs(ticket, now) : 0;
  const takeOver = takeOverCandidate && cooldownMs === 0;
  const lockActive = isLockActive(ticket, now);
  const canForceUnlock =
    lockActive &&
    (actor.role === UserRole.ADMIN || isPrimaryAssignee(ticket, actor.id));
  return {
    canView: canViewTicket(ticket, actor),
    canReply: write,
    canResolve: canResolveTicket(ticket, actor),
    canArchive: canArchiveTicket(ticket, actor),
    canUnarchive: canUnarchiveTicket(ticket, actor),
    canReopen: canReopenTicket(ticket, actor),
    canDelete: canDeleteTicket(ticket, actor),
    canEditFields: write,
    canEditStatus: canEditTicketStatus(ticket, actor),
    canAssign: assignToAnyone || takeOver,
    canAssignToAnyone: assignToAnyone,
    canUnassign: canUnassignTicket(ticket, actor),
    canTakeOver: takeOver,
    takeOverAvailableAt:
      takeOverCandidate && cooldownMs > 0
        ? new Date(now.getTime() + cooldownMs).toISOString()
        : null,
    canManageCollaborators: canManageCollaborators(ticket, actor),
    canAcquireLock: write,
    canForceUnlock,
    canForceTakeOver: lockActive && takeOver,
    mustSelfAssignToAct: actor.role === UserRole.ADMIN && !assigned && isTicketActive(ticket),
    isInformational: informational,
    assigneeInactive,
  };
}

export function assertCollaboratorAccess(
  access: string,
): asserts access is SupportCollaboratorAccess {
  if (access !== 'read' && access !== 'write') {
    throw new Error('INVALID_COLLAB_ACCESS');
  }
}
