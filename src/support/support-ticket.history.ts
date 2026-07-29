import { randomUUID } from 'crypto';
import {
  SupportTicket,
  TicketStatus,
  type SupportTicketHistoryEntry,
  type SupportTicketHistoryKind,
} from './entities/support-ticket.entity';
import type { SupportActor } from './support-ticket.permissions';

function actorFields(actor?: SupportActor | null): Pick<
  SupportTicketHistoryEntry,
  'actorId' | 'actorName' | 'actorEmail'
> {
  if (!actor) {
    return { actorId: null, actorName: null, actorEmail: null };
  }
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  return {
    actorId: actor.id,
    actorName: name || null,
    actorEmail: actor.email ?? null,
  };
}

export function normalizeLifecycleHistory(
  raw: SupportTicketHistoryEntry[] | null | undefined,
): SupportTicketHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e.id === 'string' && typeof e.at === 'string' && e.kind);
}

export function appendLifecycleHistory(
  ticket: SupportTicket,
  partial: Omit<SupportTicketHistoryEntry, 'id' | 'at' | 'actorId' | 'actorName' | 'actorEmail'> & {
    kind: SupportTicketHistoryKind;
    actor?: SupportActor | null;
    at?: Date;
  },
): void {
  const { actor, at, ...rest } = partial;
  const entry: SupportTicketHistoryEntry = {
    id: randomUUID(),
    at: (at ?? new Date()).toISOString(),
    ...actorFields(actor),
    ...rest,
  };
  ticket.lifecycleHistory = [...normalizeLifecycleHistory(ticket.lifecycleHistory), entry];
}

export function assigneeHistoryLabel(input: {
  id?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
} | null): string | null {
  if (!input) return null;
  const name =
    input.name?.trim() ||
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
    '';
  const email = input.email?.trim() || '';
  if (name && email) return `${name} · ${email}`;
  return email || name || input.id || null;
}

export function filterLifecycleHistory(
  entries: SupportTicketHistoryEntry[],
  scope: 'all' | 'assignment' | 'status' = 'all',
): SupportTicketHistoryEntry[] {
  const list = normalizeLifecycleHistory(entries);
  if (scope === 'assignment') {
    return list.filter((e) =>
      e.kind === 'assignment' || e.kind === 'takeover' || e.kind === 'unassign',
    );
  }
  if (scope === 'status') {
    return list.filter((e) =>
      e.kind === 'status' ||
      e.kind === 'created' ||
      e.kind === 'archive' ||
      e.kind === 'unarchive' ||
      e.kind === 'reopen',
    );
  }
  return list;
}

export function statusHistoryLabel(status: TicketStatus | null | undefined): string {
  switch (status) {
    case TicketStatus.OPEN:
      return 'Ouvert';
    case TicketStatus.IN_PROGRESS:
      return 'En cours';
    case TicketStatus.RESOLVED:
      return 'Résolu';
    case TicketStatus.CLOSED:
      return 'Archivé';
    default:
      return status ?? '—';
  }
}
