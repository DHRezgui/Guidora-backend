import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { Organization } from '../organization/entities/organization.entity';
import { User, UserRole } from '../user/entities/user.entity';
import { SupportService } from './support.service';
import { PriorityLevel, SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import type { SupportActor } from './support-ticket.permissions';

describe('SupportService', () => {
  let service: SupportService;
  let ticketRepo: jest.Mocked<
    Pick<Repository<SupportTicket>, 'create' | 'save' | 'findOne' | 'findAndCount'>
  > & { manager: { transaction: jest.Mock } };
  let userRepo: jest.Mocked<Pick<Repository<User>, 'find' | 'findOne'>>;
  let organizationRepo: jest.Mocked<Pick<Repository<Organization>, 'findOne'>>;
  let mailService: {
    sendSupportTicketCreatedEmail: jest.Mock;
    sendSupportTicketResolvedEmail: jest.Mock;
    sendSupportTicketReplyEmail: jest.Mock;
  };

  const adminActor: SupportActor = {
    id: 'admin-1',
    role: UserRole.ADMIN,
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: null,
  };

  beforeEach(async () => {
    ticketRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'ticket-1',
        createdAt: new Date('2026-07-16T10:00:00.000Z'),
        updatedAt: new Date('2026-07-16T10:00:00.000Z'),
        ...value,
      })),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: (em: {
          findOne: typeof ticketRepo.findOne;
          save: (entity: unknown, value: unknown) => Promise<unknown>;
        }) => Promise<unknown>) => {
          const em = {
            findOne: ((_entity: unknown, options?: object) =>
              ticketRepo.findOne(options as never)) as typeof ticketRepo.findOne,
            save: async (_entity: unknown, value: unknown) => ticketRepo.save(value as never),
          };
          return cb(em);
        }),
      },
    } as unknown as typeof ticketRepo;
    userRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(),
    };
    organizationRepo = {
      findOne: jest.fn(
        async () =>
          ({
            id: 'org-1',
            name: 'Orbit Demo',
            settings: {},
          }) as Organization,
      ),
    };
    mailService = {
      sendSupportTicketCreatedEmail: jest.fn(async () => undefined),
      sendSupportTicketResolvedEmail: jest.fn(async () => undefined),
      sendSupportTicketReplyEmail: jest.fn(async () => undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: getRepositoryToken(SupportTicket), useValue: ticketRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Organization), useValue: organizationRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(SupportService);
  });

  it('creates an OPEN ticket with project key', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      userId: 'user-1',
      subject: 'Aide — /invoices',
      description: 'Je ne trouve pas la facture',
      status: TicketStatus.OPEN,
      priority: PriorityLevel.MEDIUM,
      projectKey: 'test-13-v1',
      assignedTo: null,
      pageUrl: 'https://app.test/invoices',
      sessionData: { frictionScore: 0.42, projectKey: 'test-13-v1' },
      adminReplies: [],
      collaborators: [],
      resolvedAt: null,
      createdAt: new Date('2026-07-16T10:00:00.000Z'),
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
      user: null,
      assignee: null,
    } as SupportTicket);

    const ticket = await service.createTicket('org-1', 'user-1', {
      subject: 'Facture introuvable',
      message: 'Je ne trouve pas la facture',
      email: 'user@test.com',
      pageUrl: 'https://app.test/invoices',
      projectKey: 'test-13-v1',
      sessionData: { frictionScore: 0.42 },
    });

    expect(ticketRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectKey: 'test-13-v1',
        subject: 'Facture introuvable',
        status: TicketStatus.OPEN,
        collaborators: [],
      }),
    );
    expect(ticket.projectKey).toBe('test-13-v1');
  });

  it('rejects reply when ticket is not assigned', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.OPEN,
      assignedTo: null,
      collaborators: [],
      sessionData: { contactEmail: 'user@test.com' },
      deletedAt: null,
    } as SupportTicket);

    await expect(
      service.replyTicket(
        'org-1',
        'ticket-1',
        { message: 'Voici comment retrouver la facture…' },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replies by email when admin is assignee', async () => {
    const assignedTicket = {
      id: 'ticket-1',
      organizationId: 'org-1',
      userId: 'user-1',
      subject: 'Aide — /invoices',
      description: 'Je ne trouve pas la facture',
      status: TicketStatus.OPEN,
      priority: PriorityLevel.MEDIUM,
      projectKey: 'test-13-v1',
      assignedTo: 'admin-1',
      pageUrl: 'https://app.test/invoices',
      sessionData: { contactEmail: 'user@test.com' },
      adminReplies: [],
      collaborators: [],
      resolvedAt: null,
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
      createdAt: new Date('2026-07-16T10:00:00.000Z'),
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
      user: null,
      assignee: { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin' } as User,
      editLockHolder: null,
    } as SupportTicket;

    ticketRepo.findOne
      .mockResolvedValueOnce(assignedTicket)
      .mockResolvedValueOnce({
        ...assignedTicket,
        status: TicketStatus.IN_PROGRESS,
        adminReplies: [
          {
            body: 'Voici comment retrouver la facture…',
            sentAt: '2026-07-16T11:00:00.000Z',
            authorId: 'admin-1',
            authorEmail: 'admin@test.com',
            authorName: 'Admin',
          },
        ],
      } as SupportTicket);

    const ticket = await service.replyTicket(
      'org-1',
      'ticket-1',
      { message: 'Voici comment retrouver la facture…' },
      adminActor,
    );

    expect(mailService.sendSupportTicketReplyEmail).toHaveBeenCalled();
    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TicketStatus.IN_PROGRESS,
        adminReplies: expect.arrayContaining([
          expect.objectContaining({ body: 'Voici comment retrouver la facture…' }),
        ]),
      }),
    );
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('archives assigned ticket without sending resolved email', async () => {
    ticketRepo.findOne
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.RESOLVED,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: new Date('2026-07-16T12:00:00.000Z'),
        deletedAt: null,
        editLockedBy: null,
        editLockExpiresAt: null,
      } as SupportTicket)
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.CLOSED,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: new Date('2026-07-16T12:00:00.000Z'),
        deletedAt: null,
      } as SupportTicket);

    const ticket = await service.archiveTicket('org-1', 'ticket-1', adminActor);

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: TicketStatus.CLOSED }),
    );
    expect(mailService.sendSupportTicketResolvedEmail).not.toHaveBeenCalled();
    expect(ticket.status).toBe(TicketStatus.CLOSED);
  });

  it('unarchives assigned CLOSED ticket to IN_PROGRESS', async () => {
    ticketRepo.findOne
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.CLOSED,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: new Date('2026-07-16T12:00:00.000Z'),
        deletedAt: null,
        editLockedBy: null,
        editLockExpiresAt: null,
      } as SupportTicket)
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.IN_PROGRESS,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: null,
        deletedAt: null,
      } as SupportTicket);

    const ticket = await service.unarchiveTicket('org-1', 'ticket-1', adminActor);

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TicketStatus.IN_PROGRESS,
        resolvedAt: null,
      }),
    );
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('reopens assigned RESOLVED ticket to IN_PROGRESS', async () => {
    ticketRepo.findOne
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.RESOLVED,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: new Date('2026-07-16T12:00:00.000Z'),
        deletedAt: null,
        editLockedBy: null,
        editLockExpiresAt: null,
      } as SupportTicket)
      .mockResolvedValueOnce({
        id: 'ticket-1',
        organizationId: 'org-1',
        status: TicketStatus.IN_PROGRESS,
        assignedTo: 'admin-1',
        collaborators: [],
        resolvedAt: null,
        deletedAt: null,
      } as SupportTicket);

    const ticket = await service.reopenTicket('org-1', 'ticket-1', adminActor);

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TicketStatus.IN_PROGRESS,
        resolvedAt: null,
      }),
    );
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('soft-deletes assigned ticket for org admin', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.CLOSED,
      assignedTo: 'admin-1',
      collaborators: [],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
    } as SupportTicket);

    await service.softDeleteTicket('org-1', 'ticket-1', adminActor);

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedBy: 'admin-1',
        deletedAt: expect.any(Date),
      }),
    );
  });

  it('rejects collaborator updates from a non-assignee admin', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      collaborators: [],
      deletedAt: null,
    } as SupportTicket);

    await expect(
      service.setCollaborators('org-1', 'ticket-1', adminActor, [
        { userId: 'dev-1', access: 'read' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unassign from a non-assignee admin', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      collaborators: [],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
    } as SupportTicket);

    await expect(
      service.updateTicket('org-1', 'ticket-1', { assignedTo: null }, adminActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects archive and delete from a non-assignee admin', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      collaborators: [],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
    } as SupportTicket);

    await expect(
      service.archiveTicket('org-1', 'ticket-1', adminActor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.softDeleteTicket('org-1', 'ticket-1', adminActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows non-assignee admin to take over (self-assign)', async () => {
    const ticket = {
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date('2026-07-16T09:00:00.000Z'),
      collaborators: [{ userId: 'dev-1', access: 'read', addedAt: '2026-07-16T10:00:00.000Z', addedBy: null }],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
    } as SupportTicket;

    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    } as User);

    ticketRepo.findOne
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket,
        assignedTo: 'admin-1',
        assignedAt: new Date('2026-07-16T10:00:00.000Z'),
        collaborators: [],
        assignee: { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin' } as User,
      } as SupportTicket);

    const updated = await service.updateTicket(
      'org-1',
      'ticket-1',
      { assignedTo: 'admin-1' },
      adminActor,
    );

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: 'admin-1',
        collaborators: [],
        assignedAt: expect.any(Date),
      }),
    );
    expect(updated.assignedTo).toBe('admin-1');
  });

  it('rejects take-over during cooldown after a recent assignment', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date(),
      collaborators: [],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
      assignee: { id: 'admin-other', isActive: true } as User,
    } as SupportTicket);

    await expect(
      service.updateTicket('org-1', 'ticket-1', { assignedTo: 'admin-1' }, adminActor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows take-over during cooldown when assignee is inactive', async () => {
    const ticket = {
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date(),
      collaborators: [],
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
      assignee: { id: 'admin-other', email: 'gone@test.com', isActive: false } as User,
    } as SupportTicket;

    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    } as User);

    ticketRepo.findOne
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket,
        assignedTo: 'admin-1',
        assignee: { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin' } as User,
      } as SupportTicket);

    const updated = await service.updateTicket(
      'org-1',
      'ticket-1',
      { assignedTo: 'admin-1' },
      adminActor,
    );
    expect(updated.assignedTo).toBe('admin-1');
  });

  it('rejects take-over while a foreign lock is active without forceUnlock', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date('2026-07-16T09:00:00.000Z'),
      collaborators: [],
      deletedAt: null,
      editLockedBy: 'dev-1',
      editLockExpiresAt: new Date(Date.now() + 60_000),
      assignee: { id: 'admin-other', isActive: true } as User,
    } as SupportTicket);

    await expect(
      service.updateTicket('org-1', 'ticket-1', { assignedTo: 'admin-1' }, adminActor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows take-over with forceUnlock while a foreign lock is active', async () => {
    const ticket = {
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date('2026-07-16T09:00:00.000Z'),
      collaborators: [],
      deletedAt: null,
      editLockedBy: 'dev-1',
      editLockedAt: new Date(),
      editLockExpiresAt: new Date(Date.now() + 60_000),
      assignee: { id: 'admin-other', isActive: true } as User,
    } as SupportTicket;

    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    } as User);

    ticketRepo.findOne
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket,
        assignedTo: 'admin-1',
        editLockedBy: null,
        editLockExpiresAt: null,
        assignee: { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin' } as User,
      } as SupportTicket);

    await service.updateTicket(
      'org-1',
      'ticket-1',
      { assignedTo: 'admin-1', forceUnlock: true },
      adminActor,
    );

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: 'admin-1',
        editLockedBy: null,
      }),
    );
  });

  it('keeps collaborators on take-over when keepCollaborators is true', async () => {
    const collabs = [
      { userId: 'dev-1', access: 'write' as const, addedAt: '2026-07-16T10:00:00.000Z', addedBy: null },
    ];
    const ticket = {
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: 'admin-other',
      assignedAt: new Date('2026-07-16T09:00:00.000Z'),
      collaborators: collabs,
      deletedAt: null,
      editLockedBy: null,
      editLockExpiresAt: null,
      assignee: { id: 'admin-other', isActive: true } as User,
    } as SupportTicket;

    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    } as User);

    ticketRepo.findOne
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket,
        assignedTo: 'admin-1',
        collaborators: collabs,
        assignee: { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin' } as User,
      } as SupportTicket);

    await service.updateTicket(
      'org-1',
      'ticket-1',
      { assignedTo: 'admin-1', keepCollaborators: true },
      adminActor,
    );

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: 'admin-1',
        collaborators: collabs,
      }),
    );
  });

  it('rejects forceUnlock outside of a self take-over', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      organizationId: 'org-1',
      status: TicketStatus.IN_PROGRESS,
      assignedTo: null,
      collaborators: [],
      deletedAt: null,
      editLockedBy: 'dev-1',
      editLockExpiresAt: new Date(Date.now() + 60_000),
    } as SupportTicket);

    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    } as User);

    await expect(
      service.updateTicket(
        'org-1',
        'ticket-1',
        { assignedTo: 'admin-1', forceUnlock: true },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
