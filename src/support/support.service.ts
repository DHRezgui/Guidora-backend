import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { normalizeFaqProjectKey } from '../faq/faq-project-key.util';
import { MailService } from '../mail/mail.service';
import {
  resolveSupportEmailBrand,
  sanitizeSupportBrandForSession,
  type SupportEmailBrand,
} from '../mail/support-email-brand';
import { Organization } from '../organization/entities/organization.entity';
import { User, UserRole } from '../user/entities/user.entity';
import {
  CreateSupportTicketDto,
  ReplySupportTicketDto,
  UpdateSupportTicketDto,
} from './dto/support-ticket.dto';
import {
  PriorityLevel,
  SupportTicket,
  SupportTicketAdminReply,
  SupportTicketCollaborator,
  TicketStatus,
  type SupportCollaboratorAccess,
} from './entities/support-ticket.entity';
import {
  appendLifecycleHistory,
  assigneeHistoryLabel,
  filterLifecycleHistory,
  normalizeLifecycleHistory,
} from './support-ticket.history';
import {
  buildCapabilities,
  canArchiveTicket,
  canAssignTicket,
  canDeleteTicket,
  canChangeAssignmentTo,
  canManageCollaborators,
  canEditTicketStatus,
  canUnarchiveTicket,
  canReopenTicket,
  canResolveTicket,
  canViewTicket,
  canWriteOnTicket,
  findCollaborator,
  getTakeOverCooldownRemainingMs,
  isLockActive,
  isLockHeldBy,
  isPrimaryAssignee,
  isTicketInformational,
  isTakeOverCandidate,
  isAssigneeInactive,
  isTicketAssigned,
  normalizeCollaborators,
  SUPPORT_TAKEOVER_COOLDOWN_MS,
  type SupportActor,
} from './support-ticket.permissions';

/** 5 minutes — short enough for concurrency, renewable while the reply panel is open. */
export const SUPPORT_EDIT_LOCK_TTL_MS = 5 * 60 * 1000;
export { SUPPORT_TAKEOVER_COOLDOWN_MS };

function buildTicketSubject(pageUrl?: string | null): string {
  if (!pageUrl?.trim()) {
    return 'Demande d’aide utilisateur';
  }

  try {
    const url = new URL(pageUrl);
    const path = url.pathname && url.pathname !== '/' ? url.pathname : url.hostname;
    return `Aide — ${path}`;
  } catch {
    const trimmed = pageUrl.trim();
    return trimmed.length > 200 ? `Aide — ${trimmed.slice(0, 200)}…` : `Aide — ${trimmed}`;
  }
}

function sanitizeSessionData(
  sessionData: Record<string, unknown> | undefined,
  email: string,
  projectKey?: string,
): Record<string, unknown> {
  const base = sessionData && typeof sessionData === 'object' ? { ...sessionData } : {};
  base.contactEmail = email.trim();
  if (projectKey) {
    base.projectKey = projectKey;
  }
  const brand = sanitizeSupportBrandForSession(base.supportBrand);
  if (brand) {
    base.supportBrand = brand;
  } else {
    delete base.supportBrand;
  }

  if (typeof base.browser === 'string') {
    const browser = base.browser.trim().slice(0, 80);
    if (browser) base.browser = browser;
    else delete base.browser;
  } else {
    delete base.browser;
  }

  if (typeof base.faqSearchCount === 'number' && Number.isFinite(base.faqSearchCount)) {
    base.faqSearchCount = Math.max(0, Math.floor(base.faqSearchCount));
  } else {
    delete base.faqSearchCount;
  }

  if (typeof base.faqLastQuery === 'string') {
    const q = base.faqLastQuery.trim().slice(0, 200);
    if (q) base.faqLastQuery = q;
    else delete base.faqLastQuery;
  } else {
    delete base.faqLastQuery;
  }

  if (base.activeTourId === null) {
    // keep null
  } else if (typeof base.activeTourId === 'string' && base.activeTourId.trim()) {
    base.activeTourId = base.activeTourId.trim();
  } else {
    delete base.activeTourId;
  }

  if (base.activeTourStep === null) {
    // keep null
  } else if (typeof base.activeTourStep === 'number' && Number.isFinite(base.activeTourStep)) {
    base.activeTourStep = Math.max(0, Math.floor(base.activeTourStep));
  } else {
    delete base.activeTourStep;
  }

  if (Array.isArray(base.navigationHistory)) {
    const cleaned: string[] = [];
    for (const entry of base.navigationHistory) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      let safe = trimmed;
      try {
        const url = new URL(trimmed);
        const sensitive =
          /^(token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth|authorization|api[_-]?key|session|sid|jwt|password|secret|code|sig|signature|state)$/i;
        const kept = new URLSearchParams();
        url.searchParams.forEach((value, key) => {
          if (sensitive.test(key)) return;
          if (!value || value.length > 80) return;
          kept.set(key, value);
        });
        const search = kept.toString();
        let hash = '';
        if (url.hash && url.hash.length > 1 && url.hash.length <= 120) {
          const body = url.hash.slice(1);
          if (body.startsWith('/')) hash = `#${body.split('?')[0]}`;
          else if (!body.includes('=') && !sensitive.test(body)) hash = url.hash;
        }
        safe = `${url.origin}${url.pathname}${search ? `?${search}` : ''}${hash}`;
      } catch {
        safe = trimmed.split(/[?#]/)[0] ?? trimmed;
      }
      if (!safe || cleaned[cleaned.length - 1] === safe) continue;
      cleaned.push(safe.slice(0, 500));
    }
    if (cleaned.length > 0) base.navigationHistory = cleaned.slice(-5);
    else delete base.navigationHistory;
  } else {
    delete base.navigationHistory;
  }

  if (typeof base.lastCompletedTourId === 'string' && base.lastCompletedTourId.trim()) {
    base.lastCompletedTourId = base.lastCompletedTourId.trim().slice(0, 120);
  } else {
    delete base.lastCompletedTourId;
  }
  if (typeof base.lastCompletedTourName === 'string' && base.lastCompletedTourName.trim()) {
    base.lastCompletedTourName = base.lastCompletedTourName.trim().slice(0, 160);
  } else {
    delete base.lastCompletedTourName;
  }

  const episode = sanitizeHelpEpisode(base.episode);
  if (episode) base.episode = episode;
  else delete base.episode;

  return base;
}

const HELP_EPISODE_TRIGGERS = new Set(['proactiveToast', 'manualFaq', 'tour']);

function sanitizeHelpEpisode(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.trigger !== 'string' || !HELP_EPISODE_TRIGGERS.has(input.trigger)) {
    return null;
  }
  const episode: Record<string, unknown> = {
    trigger: input.trigger,
    capturedAt:
      typeof input.capturedAt === 'string' && input.capturedAt.trim()
        ? input.capturedAt.trim().slice(0, 40)
        : new Date().toISOString(),
  };
  const clamp01 = (n: unknown): number | undefined => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(1, n));
  };
  const clampSec = (n: unknown): number | undefined => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.max(0, Math.floor(n));
  };
  const friction = clamp01(input.frictionAtTrigger);
  const risk = clamp01(input.riskAtTrigger);
  const timeOnPage = clampSec(input.timeOnPageAtTrigger);
  const pageTime = clampSec(input.pageTimeAtTrigger);
  const idle = clampSec(input.idleSecondsAtTrigger);
  if (friction != null) episode.frictionAtTrigger = friction;
  if (risk != null) episode.riskAtTrigger = risk;
  if (timeOnPage != null) episode.timeOnPageAtTrigger = timeOnPage;
  if (pageTime != null) episode.pageTimeAtTrigger = pageTime;
  if (idle != null) episode.idleSecondsAtTrigger = idle;
  return episode;
}

function assigneeDisplayName(user?: User | null): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || null;
}

function extractContactEmail(ticket: SupportTicket): string | null {
  const fromSession =
    typeof ticket.sessionData?.contactEmail === 'string'
      ? ticket.sessionData.contactEmail.trim()
      : '';
  if (fromSession) return fromSession;
  const fromUser = ticket.user?.email?.trim();
  return fromUser || null;
}

function isRoutableSupportEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  const domain = normalized.split('@').pop() || '';
  const blocked = new Set([
    'trustdev.com',
    'trustdev.local',
    'example.com',
    'example.org',
    'localhost',
  ]);
  return !blocked.has(domain);
}

function clearEditLock(ticket: SupportTicket): void {
  ticket.editLockedBy = null;
  ticket.editLockHolder = null;
  ticket.editLockedAt = null;
  ticket.editLockExpiresAt = null;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    private readonly mailService: MailService,
  ) {}

  async createTicket(
    organizationId: string,
    userId: string | null,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicket> {
    const email = dto.email?.trim();
    if (!email) {
      throw new BadRequestException('E-mail requis pour recevoir une réponse.');
    }

    const pageUrl = dto.pageUrl?.trim() || null;
    const projectKey = normalizeFaqProjectKey(dto.projectKey);
    const subject = dto.subject?.trim() || buildTicketSubject(pageUrl);
    const ticket = this.ticketRepo.create({
      organizationId,
      userId,
      subject,
      description: dto.message.trim(),
      status: TicketStatus.OPEN,
      priority: PriorityLevel.MEDIUM,
      pageUrl,
      projectKey,
      sessionData: sanitizeSessionData(dto.sessionData, email, projectKey),
      adminReplies: [],
      collaborators: [],
      lifecycleHistory: [],
      assignedAt: null,
    });

    appendLifecycleHistory(ticket, {
      kind: 'created',
      actor: null,
      toStatus: TicketStatus.OPEN,
    });

    const saved = await this.ticketRepo.save(ticket);
    const withRelations = await this.loadTicket(organizationId, saved.id);
    void this.notifyAdminsOfNewTicket(withRelations);
    return withRelations;
  }

  async listTicketsForOrganization(
    organizationId: string,
    actor: SupportActor,
    options: {
      status?: TicketStatus;
      projectKey?: string;
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: SupportTicket[]; count: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const projectKey = options.projectKey?.trim()
      ? normalizeFaqProjectKey(options.projectKey)
      : undefined;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .leftJoinAndSelect('t.assignee', 'assignee')
      .leftJoinAndSelect('t.editLockHolder', 'editLockHolder')
      .where('t.organizationId = :organizationId', { organizationId })
      .andWhere('t.deletedAt IS NULL');

    if (options.activeOnly) {
      qb.andWhere('t.status IN (:...activeStatuses)', {
        activeStatuses: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
      });
    } else if (options.status) {
      qb.andWhere('t.status = :status', { status: options.status });
    }

    if (projectKey) {
      qb.andWhere('t.projectKey = :projectKey', { projectKey });
    }

    if (actor.role === UserRole.DEVELOPER) {
      // Avoid text=uuid on jsonb ->> userId; containment matches collaborator entries.
      qb.andWhere(
        `(t.assignedTo = :actorId OR t.collaborators @> CAST(:collabFilter AS jsonb))`,
        {
          actorId: actor.id,
          collabFilter: JSON.stringify([{ userId: actor.id }]),
        },
      );
    } else if (actor.role !== UserRole.ADMIN) {
      return { items: [], count: 0 };
    }

    qb.orderBy('t.createdAt', 'DESC').skip(offset).take(limit);

    const [items, count] = await qb.getManyAndCount();
    return { items, count };
  }

  async updateTicket(
    organizationId: string,
    ticketId: string,
    dto: UpdateSupportTicketDto,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const result = await this.ticketRepo.manager.transaction(async (em) => {
      // Lock the ticket row only — FOR UPDATE cannot run with LEFT JOIN relations.
      const locked = await em.findOne(SupportTicket, {
        where: { id: ticketId, organizationId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Ticket introuvable.');
      }

      const ticket = await em.findOne(SupportTicket, {
        where: { id: ticketId, organizationId, deletedAt: IsNull() },
        relations: ['user', 'assignee', 'editLockHolder'],
      });
      if (!ticket) {
        throw new NotFoundException('Ticket introuvable.');
      }
      if (!canViewTicket(ticket, actor)) {
        throw new NotFoundException('Ticket introuvable.');
      }
      if (!ticket.collaborators) {
        ticket.collaborators = [];
      }
      if (!ticket.lifecycleHistory) {
        ticket.lifecycleHistory = [];
      }

      const previousStatus = ticket.status;
      const previousAssignee = ticket.assignedTo;

      if (dto.assignedTo !== undefined) {
        await this.applyAssignment(ticket, dto.assignedTo, actor, {
          forceUnlock: Boolean(dto.forceUnlock),
          keepCollaborators: Boolean(dto.keepCollaborators),
        });
      }

      if (dto.priority !== undefined || dto.status !== undefined) {
        this.assertCanWrite(ticket, actor);
        await this.ensureLock(ticket, actor);
        if (dto.priority !== undefined) {
          ticket.priority = dto.priority;
        }
        if (dto.status !== undefined && dto.status !== ticket.status) {
          if (!canEditTicketStatus(ticket, actor)) {
            throw new ForbiddenException(
              'Seul l’assigné principal peut modifier le statut du ticket.',
            );
          }
          if (dto.status === TicketStatus.CLOSED && !canArchiveTicket(ticket, actor)) {
            throw new ForbiddenException(
              'Archivage réservé à l’assigné principal.',
            );
          }
          if (dto.status === TicketStatus.RESOLVED && !canResolveTicket(ticket, actor)) {
            throw new ForbiddenException(
              'Résolution réservée à l’assigné principal.',
            );
          }
          const fromStatus = ticket.status;
          ticket.status = dto.status;
          if (dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED) {
            ticket.resolvedAt = ticket.resolvedAt ?? new Date();
            clearEditLock(ticket);
          } else {
            ticket.resolvedAt = null;
          }
          appendLifecycleHistory(ticket, {
            kind: dto.status === TicketStatus.CLOSED ? 'archive' : 'status',
            actor,
            fromStatus,
            toStatus: dto.status,
          });
        }
      }

      await em.save(SupportTicket, ticket);
      const updated = await em.findOne(SupportTicket, {
        where: { id: ticketId, organizationId, deletedAt: IsNull() },
        relations: ['user', 'assignee', 'editLockHolder'],
      });
      if (!updated) {
        throw new NotFoundException('Ticket introuvable.');
      }
      if (!updated.collaborators) {
        updated.collaborators = [];
      }
      return { updated, previousStatus, previousAssignee };
    });

    const { updated, previousStatus, previousAssignee } = result;

    if (dto.assignedTo !== undefined && updated.assignedTo && updated.assignedTo !== previousAssignee) {
      void this.notifyAssignee(updated);
    }

    const becameResolved =
      previousStatus !== TicketStatus.RESOLVED &&
      previousStatus !== TicketStatus.CLOSED &&
      (updated.status === TicketStatus.RESOLVED || updated.status === TicketStatus.CLOSED);

    if (becameResolved) {
      void this.notifyRequesterResolved(updated);
    }

    return updated;
  }

  async resolveTicket(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    return this.updateTicket(
      organizationId,
      ticketId,
      { status: TicketStatus.RESOLVED },
      actor,
    );
  }

  async archiveTicket(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canArchiveTicket(ticket, actor)) {
      throw new ForbiddenException(
        isTicketAssigned(ticket)
          ? ticket.status === TicketStatus.CLOSED
            ? 'Ce ticket est déjà archivé.'
            : 'Archivage réservé à l’assigné principal. Prenez le ticket en charge d’abord.'
          : 'Assignez le ticket avant de l’archiver.',
      );
    }
    await this.ensureLock(ticket, actor);
    const fromStatus = ticket.status;
    ticket.status = TicketStatus.CLOSED;
    ticket.resolvedAt = ticket.resolvedAt ?? new Date();
    clearEditLock(ticket);
    appendLifecycleHistory(ticket, {
      kind: 'archive',
      actor,
      fromStatus,
      toStatus: TicketStatus.CLOSED,
    });
    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticketId);
  }

  async unarchiveTicket(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canUnarchiveTicket(ticket, actor)) {
      throw new ForbiddenException(
        ticket.status !== TicketStatus.CLOSED
          ? 'Seuls les tickets archivés peuvent être désarchivés.'
          : 'Désarchivage réservé à un admin ou à l’assigné principal.',
      );
    }
    return this.reactivateTicket(organizationId, ticket, actor, 'unarchive');
  }

  async reopenTicket(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canReopenTicket(ticket, actor)) {
      throw new ForbiddenException(
        ticket.status !== TicketStatus.RESOLVED
          ? 'Seuls les tickets résolus peuvent être réouverts.'
          : 'Réouverture réservée à un admin ou à l’assigné principal.',
      );
    }
    return this.reactivateTicket(organizationId, ticket, actor, 'reopen');
  }

  /** Shared path: preserves assignee (audit) — ownership change only via explicit take-over. */
  private async reactivateTicket(
    organizationId: string,
    ticket: SupportTicket,
    actor: SupportActor,
    kind: 'unarchive' | 'reopen',
  ): Promise<SupportTicket> {
    await this.ensureLock(ticket, actor);
    const fromStatus = ticket.status;
    ticket.status = ticket.assignedTo ? TicketStatus.IN_PROGRESS : TicketStatus.OPEN;
    ticket.resolvedAt = null;
    clearEditLock(ticket);
    appendLifecycleHistory(ticket, {
      kind,
      actor,
      fromStatus,
      toStatus: ticket.status,
      fromAssigneeId: ticket.assignedTo,
      fromAssigneeLabel: assigneeHistoryLabel(ticket.assignee),
      toAssigneeId: ticket.assignedTo,
      toAssigneeLabel: assigneeHistoryLabel(ticket.assignee),
    });
    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticket.id);
  }

  async softDeleteTicket(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<void> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canDeleteTicket(ticket, actor)) {
      if (actor.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Suppression réservée aux administrateurs.');
      }
      if (!isTicketAssigned(ticket)) {
        throw new ForbiddenException('Assignez le ticket avant de le supprimer.');
      }
      throw new ForbiddenException(
        'Suppression réservée à l’assigné principal. Prenez le ticket en charge d’abord.',
      );
    }
    await this.ensureLock(ticket, actor);
    if (ticket.deletedAt) return;
    ticket.deletedAt = new Date();
    ticket.deletedBy = actor.id;
    clearEditLock(ticket);
    await this.ticketRepo.save(ticket);
  }

  async replyTicket(
    organizationId: string,
    ticketId: string,
    dto: ReplySupportTicketDto,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    this.assertCanWrite(ticket, actor);
    await this.ensureLock(ticket, actor);

    const contactEmail = extractContactEmail(ticket);
    if (!contactEmail) {
      throw new BadRequestException(
        'Aucun e-mail contact sur ce ticket — réponse impossible.',
      );
    }

    const body = dto.message.trim();
    if (body.length < 5) {
      throw new BadRequestException('La réponse doit contenir au moins 5 caractères.');
    }

    const authorName = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();

    try {
      await this.mailService.sendSupportTicketReplyEmail(
        contactEmail,
        {
          id: ticket.id,
          subject: ticket.subject,
          projectKey: ticket.projectKey,
          replyBody: body,
          originalMessage: ticket.description,
          authorName: authorName || actor.email || null,
          pageUrl: ticket.pageUrl,
        },
        await this.resolveTicketBrand(ticket),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Échec d’envoi de l’e-mail de réponse.';
      this.logger.error(`Support reply email failed for ticket ${ticket.id}`, error as Error);
      throw new ServiceUnavailableException(message);
    }

    const reply: SupportTicketAdminReply = {
      body,
      sentAt: new Date().toISOString(),
      authorId: actor.id,
      authorEmail: actor.email ?? null,
      authorName: authorName || actor.email || null,
    };

    ticket.adminReplies = [...(ticket.adminReplies ?? []), reply];
    if (ticket.status === TicketStatus.OPEN) {
      const fromStatus = ticket.status;
      ticket.status = TicketStatus.IN_PROGRESS;
      appendLifecycleHistory(ticket, {
        kind: 'status',
        actor,
        fromStatus,
        toStatus: TicketStatus.IN_PROGRESS,
      });
    }

    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticketId);
  }

  async setCollaborators(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
    collaborators: Array<{ userId: string; access: SupportCollaboratorAccess }>,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canManageCollaborators(ticket, actor)) {
      throw new ForbiddenException(
        'Seul l’assigné principal peut gérer la collaboration. Réassignez-vous le ticket si besoin.',
      );
    }
    if (!isTicketAssigned(ticket)) {
      throw new BadRequestException('Assignez le ticket avant d’ajouter des collaborateurs.');
    }

    const unique = new Map<string, SupportCollaboratorAccess>();
    for (const entry of collaborators) {
      if (!entry?.userId) continue;
      if (entry.userId === ticket.assignedTo) {
        throw new BadRequestException(
          'L’assigné principal ne peut pas être ajouté comme collaborateur.',
        );
      }
      if (entry.access !== 'read' && entry.access !== 'write') {
        throw new BadRequestException('Accès collaborateur invalide (read | write).');
      }
      unique.set(entry.userId, entry.access);
    }

    const userIds = [...unique.keys()];
    if (userIds.length > 0) {
      const users = await this.userRepo.find({
        where: {
          id: In(userIds),
          organizationId,
          isActive: true,
          role: UserRole.DEVELOPER,
        },
      });
      if (users.length !== userIds.length) {
        throw new BadRequestException(
          'Les collaborateurs doivent être des développeurs actifs de l’organisation.',
        );
      }
    }

    const previous = normalizeCollaborators(ticket.collaborators);
    const previousById = new Map(previous.map((c) => [c.userId, c]));
    const next: SupportTicketCollaborator[] = userIds.map((userId) => {
      const existing = previousById.get(userId);
      return {
        userId,
        access: unique.get(userId)!,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        addedBy: existing?.addedBy ?? actor.id,
      };
    });

    ticket.collaborators = next;
    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticketId);
  }

  async acquireEditLock(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (!canWriteOnTicket(ticket, actor) && !(actor.role === UserRole.ADMIN && isTicketAssigned(ticket))) {
      throw new ForbiddenException(
        isTicketAssigned(ticket)
          ? 'Verrou réservé à l’équipe en charge du ticket.'
          : 'Assignez-vous le ticket avant de le traiter.',
      );
    }

    if (isLockActive(ticket) && ticket.editLockedBy !== actor.id) {
      const holder = ticket.editLockHolder;
      const name = assigneeDisplayName(holder) || holder?.email || 'un autre membre';
      throw new ConflictException(
        `Ticket verrouillé par ${name}. Réessayez plus tard ou forcez le déverrouillage (admin).`,
      );
    }

    const now = new Date();
    ticket.editLockedBy = actor.id;
    ticket.editLockedAt = now;
    ticket.editLockExpiresAt = new Date(now.getTime() + SUPPORT_EDIT_LOCK_TTL_MS);
    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticketId);
  }

  async renewEditLock(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    if (isTicketInformational(ticket)) {
      throw new ConflictException(
        'Ticket informatif — le verrou ne peut pas être renouvelé. Désarchivez ou réouvrez le ticket.',
      );
    }
    if (!isLockHeldBy(ticket, actor.id)) {
      throw new ConflictException('Vous ne détenez pas le verrou de ce ticket.');
    }
    const now = new Date();
    ticket.editLockedAt = now;
    ticket.editLockExpiresAt = new Date(now.getTime() + SUPPORT_EDIT_LOCK_TTL_MS);
    await this.ticketRepo.save(ticket);
    return this.loadTicket(organizationId, ticketId);
  }

  async releaseEditLock(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    const canForce =
      actor.role === UserRole.ADMIN || isPrimaryAssignee(ticket, actor.id);
    if (isLockActive(ticket) && ticket.editLockedBy !== actor.id && !canForce) {
      throw new ForbiddenException(
        'Seul le détenteur du verrou, l’assigné principal ou un admin peut le libérer.',
      );
    }
    if (!isLockActive(ticket) || ticket.editLockedBy === actor.id || canForce) {
      clearEditLock(ticket);
      await this.ticketRepo.save(ticket);
    }
    return this.loadTicket(organizationId, ticketId);
  }

  toResponseDto(ticket: SupportTicket, actor?: SupportActor | null) {
    const collaborators = normalizeCollaborators(ticket.collaborators);
    const lockActive = isLockActive(ticket);
    return {
      id: ticket.id,
      organizationId: ticket.organizationId,
      userId: ticket.userId,
      userEmail: ticket.user?.email ?? null,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      projectKey: ticket.projectKey || 'default',
      assignedTo: ticket.assignedTo,
      assigneeEmail: ticket.assignee?.email ?? null,
      assigneeName: assigneeDisplayName(ticket.assignee),
      assignedAt: ticket.assignedAt?.toISOString() ?? null,
      collaborators,
      pageUrl: ticket.pageUrl,
      contactEmail: extractContactEmail(ticket),
      sessionData: ticket.sessionData ?? {},
      adminReplies: ticket.adminReplies ?? [],
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      editLock: lockActive
        ? {
            lockedBy: ticket.editLockedBy,
            lockedByName: assigneeDisplayName(ticket.editLockHolder),
            lockedByEmail: ticket.editLockHolder?.email ?? null,
            lockedAt: ticket.editLockedAt?.toISOString() ?? null,
            expiresAt: ticket.editLockExpiresAt?.toISOString() ?? null,
            heldByMe: actor ? ticket.editLockedBy === actor.id : false,
          }
        : null,
      capabilities: actor ? buildCapabilities(ticket, actor) : undefined,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }

  private async applyAssignment(
    ticket: SupportTicket,
    assignedTo: string | null,
    actor: SupportActor,
    options: { forceUnlock?: boolean; keepCollaborators?: boolean } = {},
  ): Promise<SupportTicket> {
    if (!canAssignTicket(actor)) {
      throw new ForbiddenException('Seul un administrateur peut assigner un ticket.');
    }

    const now = new Date();
    const forceUnlock = Boolean(options.forceUnlock);
    const keepCollaborators = Boolean(options.keepCollaborators);
    const isSelfTakeOver =
      isTakeOverCandidate(ticket, actor) && assignedTo === actor.id;

    if (forceUnlock && !isSelfTakeOver) {
      throw new ForbiddenException(
        'forceUnlock n’est autorisé que lors d’une prise en charge (vous-même).',
      );
    }

    if (isSelfTakeOver) {
      const remainingMs = getTakeOverCooldownRemainingMs(ticket, now);
      if (remainingMs > 0) {
        throw new ConflictException(
          isAssigneeInactive(ticket)
            ? 'Prise en charge temporairement indisponible.'
            : `Ce ticket vient d’être pris en charge. Réessayez dans ${Math.ceil(remainingMs / 1000)} s.`,
        );
      }
    }

    if (!canChangeAssignmentTo(ticket, actor, assignedTo, now)) {
      throw new ForbiddenException(
        'Ce ticket est déjà pris : vous pouvez seulement vous l’assigner (prise en charge), pas le désassigner ni le réaffecter à quelqu’un d’autre.',
      );
    }

    if (isLockActive(ticket) && ticket.editLockedBy !== actor.id) {
      if (forceUnlock && isSelfTakeOver) {
        clearEditLock(ticket);
      } else {
        throw new ConflictException(
          'Ticket verrouillé par un autre membre — libérez ou forcez le verrou avant de réassigner.',
        );
      }
    }

    if (assignedTo === null) {
      if (ticket.assignedTo !== null) {
        const fromAssigneeId = ticket.assignedTo;
        const fromAssigneeLabel = assigneeHistoryLabel(ticket.assignee);
        const fromStatus = ticket.status;
        ticket.assignedTo = null;
        ticket.assignee = null;
        ticket.assignedAt = null;
        if (!keepCollaborators) {
          ticket.collaborators = [];
        }
        if (ticket.status === TicketStatus.IN_PROGRESS) {
          ticket.status = TicketStatus.OPEN;
        }
        clearEditLock(ticket);
        appendLifecycleHistory(ticket, {
          kind: 'unassign',
          actor,
          fromAssigneeId,
          fromAssigneeLabel,
          toAssigneeId: null,
          toAssigneeLabel: null,
        });
        if (fromStatus !== ticket.status) {
          appendLifecycleHistory(ticket, {
            kind: 'status',
            actor,
            fromStatus,
            toStatus: ticket.status,
          });
        }
      }
      return ticket;
    }

    const assignee = await this.userRepo.findOne({
      where: {
        id: assignedTo,
        organizationId: ticket.organizationId,
        isActive: true,
        role: In([UserRole.ADMIN, UserRole.DEVELOPER]),
      },
    });
    if (!assignee) {
      throw new BadRequestException('Assigné invalide pour cette organisation.');
    }

    const fromAssigneeId = ticket.assignedTo;
    const fromAssigneeLabel = assigneeHistoryLabel(ticket.assignee);
    const fromStatus = ticket.status;
    const assigneeChanged = ticket.assignedTo !== assignee.id;
    const isTakeover =
      Boolean(fromAssigneeId) && fromAssigneeId !== assignee.id && assignee.id === actor.id;
    ticket.assignedTo = assignee.id;
    ticket.assignee = assignee;
    if (assigneeChanged) {
      ticket.assignedAt = now;
      if (!keepCollaborators) {
        ticket.collaborators = [];
      }
      clearEditLock(ticket);
      appendLifecycleHistory(ticket, {
        kind: isTakeover ? 'takeover' : 'assignment',
        actor,
        fromAssigneeId,
        fromAssigneeLabel,
        toAssigneeId: assignee.id,
        toAssigneeLabel: assigneeHistoryLabel(assignee),
      });
    }
    if (ticket.status === TicketStatus.OPEN) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }
    if (fromStatus !== ticket.status) {
      appendLifecycleHistory(ticket, {
        kind: 'status',
        actor,
        fromStatus,
        toStatus: ticket.status,
      });
    }
    return ticket;
  }

  private async ensureLock(ticket: SupportTicket, actor: SupportActor): Promise<void> {
    if (isLockHeldBy(ticket, actor.id)) return;
    if (isLockActive(ticket)) {
      const name =
        assigneeDisplayName(ticket.editLockHolder) ||
        ticket.editLockHolder?.email ||
        'un autre membre';
      throw new ConflictException(`Ticket verrouillé par ${name}.`);
    }
    const now = new Date();
    ticket.editLockedBy = actor.id;
    ticket.editLockedAt = now;
    ticket.editLockExpiresAt = new Date(now.getTime() + SUPPORT_EDIT_LOCK_TTL_MS);
  }

  private assertCanWrite(ticket: SupportTicket, actor: SupportActor): void {
    if (canWriteOnTicket(ticket, actor)) return;
    if (actor.role === UserRole.ADMIN && !isTicketAssigned(ticket)) {
      throw new ForbiddenException(
        'Assignez-vous ce ticket avant de répondre ou de le modifier.',
      );
    }
    throw new ForbiddenException(
      'Action réservée à l’assigné principal ou à un collaborateur en écriture.',
    );
  }

  private async loadTicketForActor(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
  ): Promise<SupportTicket> {
    const ticket = await this.loadTicket(organizationId, ticketId);
    if (!canViewTicket(ticket, actor)) {
      throw new NotFoundException('Ticket introuvable.');
    }
    return ticket;
  }

  private async loadTicket(organizationId: string, ticketId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, organizationId, deletedAt: IsNull() },
      relations: ['user', 'assignee', 'editLockHolder'],
    });
    if (!ticket) {
      throw new NotFoundException('Ticket introuvable.');
    }
    if (!ticket.collaborators) {
      ticket.collaborators = [];
    }
    ticket.lifecycleHistory = normalizeLifecycleHistory(ticket.lifecycleHistory);
    return ticket;
  }

  async getTicketHistory(
    organizationId: string,
    ticketId: string,
    actor: SupportActor,
    scope: 'all' | 'assignment' | 'status' = 'all',
  ) {
    const ticket = await this.loadTicketForActor(organizationId, ticketId, actor);
    const items = filterLifecycleHistory(ticket.lifecycleHistory, scope).slice().reverse();
    return { items, count: items.length };
  }

  private buildTicketContextSummary(ticket: SupportTicket): {
    browser?: string | null;
    faqLastQuery?: string | null;
    faqSearchCount?: number | null;
    navigationHistory?: string[] | null;
    assistanceState?: string | null;
    activeTourId?: string | null;
    lastCompletedTourId?: string | null;
    lastCompletedTourName?: string | null;
    episode?: {
      trigger?: string;
      frictionAtTrigger?: number;
      riskAtTrigger?: number;
      timeOnPageAtTrigger?: number;
    } | null;
  } {
    const data = ticket.sessionData ?? {};
    const rawEpisode =
      data.episode && typeof data.episode === 'object'
        ? (data.episode as Record<string, unknown>)
        : null;
    return {
      browser: typeof data.browser === 'string' ? data.browser : null,
      faqLastQuery: typeof data.faqLastQuery === 'string' ? data.faqLastQuery : null,
      faqSearchCount: typeof data.faqSearchCount === 'number' ? data.faqSearchCount : null,
      navigationHistory: Array.isArray(data.navigationHistory)
        ? data.navigationHistory.filter((u): u is string => typeof u === 'string')
        : null,
      assistanceState: typeof data.assistanceState === 'string' ? data.assistanceState : null,
      activeTourId: typeof data.activeTourId === 'string' ? data.activeTourId : null,
      lastCompletedTourId:
        typeof data.lastCompletedTourId === 'string' ? data.lastCompletedTourId : null,
      lastCompletedTourName:
        typeof data.lastCompletedTourName === 'string' ? data.lastCompletedTourName : null,
      episode: rawEpisode
        ? {
            trigger: typeof rawEpisode.trigger === 'string' ? rawEpisode.trigger : undefined,
            frictionAtTrigger:
              typeof rawEpisode.frictionAtTrigger === 'number'
                ? rawEpisode.frictionAtTrigger
                : undefined,
            riskAtTrigger:
              typeof rawEpisode.riskAtTrigger === 'number' ? rawEpisode.riskAtTrigger : undefined,
            timeOnPageAtTrigger:
              typeof rawEpisode.timeOnPageAtTrigger === 'number'
                ? rawEpisode.timeOnPageAtTrigger
                : undefined,
          }
        : null,
    };
  }

  private async resolveTicketBrand(ticket: SupportTicket): Promise<SupportEmailBrand> {
    const organization = await this.organizationRepo.findOne({
      where: { id: ticket.organizationId },
      select: ['id', 'name', 'settings'],
    });
    return resolveSupportEmailBrand({
      organizationName: organization?.name,
      organizationSettings: (organization?.settings as Record<string, unknown>) ?? {},
      projectKey: ticket.projectKey,
      sessionBrand: ticket.sessionData?.supportBrand,
    });
  }

  private async notifyAdminsOfNewTicket(ticket: SupportTicket): Promise<void> {
    try {
      const admins = await this.userRepo.find({
        where: {
          organizationId: ticket.organizationId,
          isActive: true,
          role: UserRole.ADMIN,
        },
        select: ['id', 'email'],
      });
      const rawEmails = admins.map((a) => a.email).filter(Boolean);
      const undeliverable = rawEmails.filter((email) => !isRoutableSupportEmail(email));
      const emails = rawEmails.filter((email) => isRoutableSupportEmail(email));
      if (undeliverable.length > 0) {
        this.logger.warn(
          `Skipping undeliverable admin emails for ticket ${ticket.id}: ${undeliverable.join(', ')}`,
        );
      }

      const contactEmail =
        typeof ticket.sessionData?.contactEmail === 'string'
          ? ticket.sessionData.contactEmail
          : null;

      await this.mailService.sendSupportTicketCreatedEmail(
        emails,
        {
          id: ticket.id,
          subject: ticket.subject,
          description: ticket.description,
          projectKey: ticket.projectKey,
          pageUrl: ticket.pageUrl,
          priority: ticket.priority,
          contactEmail,
          contextSummary: this.buildTicketContextSummary(ticket),
        },
        await this.resolveTicketBrand(ticket),
      );
    } catch (error) {
      this.logger.warn(`Could not notify admins for ticket ${ticket.id}`, error as Error);
    }
  }

  private async notifyAssignee(ticket: SupportTicket): Promise<void> {
    try {
      const email = ticket.assignee?.email?.trim();
      if (!email || !isRoutableSupportEmail(email)) return;
      await this.mailService.sendSupportTicketCreatedEmail(
        [email],
        {
          id: ticket.id,
          subject: `[Assigné] ${ticket.subject}`,
          description: ticket.description,
          projectKey: ticket.projectKey,
          pageUrl: ticket.pageUrl,
          priority: ticket.priority,
          contactEmail:
            typeof ticket.sessionData?.contactEmail === 'string'
              ? ticket.sessionData.contactEmail
              : null,
          contextSummary: this.buildTicketContextSummary(ticket),
        },
        await this.resolveTicketBrand(ticket),
      );
    } catch (error) {
      this.logger.warn(`Could not notify assignee for ticket ${ticket.id}`, error as Error);
    }
  }

  private async notifyRequesterResolved(ticket: SupportTicket): Promise<void> {
    try {
      const toEmail = extractContactEmail(ticket);
      if (!toEmail) return;
      await this.mailService.sendSupportTicketResolvedEmail(
        toEmail,
        {
          id: ticket.id,
          subject: ticket.subject,
          projectKey: ticket.projectKey,
        },
        await this.resolveTicketBrand(ticket),
      );
    } catch (error) {
      this.logger.warn(`Could not notify requester for ticket ${ticket.id}`, error as Error);
    }
  }
}
