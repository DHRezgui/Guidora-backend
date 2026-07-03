import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { CreateFaqEntryDto, UpdateFaqEntryDto } from './dto/faq-entry.dto';
import { rankFaqSuggestions } from './faq-suggestions.util';
import {
  assertCanAcquireFaqEditLock,
  assertFaqDeleteBlockedWhileEditing,
  assertFaqEditLockHeldForSave,
  assertFaqPublishBlockedWhileEditedByOther,
  buildFaqEditLockConflictMessage,
  buildFaqEditLockInfo,
  FAQ_EDIT_LOCK_TTL_MS,
  FaqEditLockInfo,
  hasActiveFaqEditLock,
  isFaqEditLockExpired,
  isFaqEditLockHeldBy,
} from './faq-edit-lock.util';
import { FaqItem } from './entities/faq-item.entity';
import { FaqProject } from './entities/faq-project.entity';
import { GuidedTour } from '../guided-tour/entities/guided-tour.entity';
import { isSdkLabProjectKey, SDK_LAB_TARGET_PATH_SEGMENT } from '../guided-tour/guided-tour-lab.util';
import { tourFlowVersionSqlExpr } from '../guided-tour/tour-project-scope.util';
import {
  DEFAULT_FAQ_PROJECT_KEY,
  faqProjectStorageSegment,
  normalizeFaqProjectKey,
} from './faq-project-key.util';

interface GlobalFaqCatalogItem {
  id?: string | number;
  question?: string;
  answer?: string;
  category?: string;
  priority?: string;
}

export interface ImportGlobalFaqOptions {
  skipDuplicates?: boolean;
  replaceExisting?: boolean;
  projectKey?: string;
}

export interface ImportGlobalFaqResult {
  imported: number;
  skipped: number;
  totalInCatalog: number;
}

@Injectable()
export class FaqEntryService {
  private readonly logger = new Logger(FaqEntryService.name);
  private readonly appRoot: string;
  private readonly mlRoot: string;
  private readonly orgStorageRoot: string;
  private readonly pythonExecutable: string;
  private readonly generateScriptPath: string;
  private readonly rebuildLocks = new Map<string, Promise<string>>();
  private readonly reindexPending = new Set<string>();

  constructor(
    @InjectRepository(FaqItem)
    private readonly faqRepository: Repository<FaqItem>,
    @InjectRepository(FaqProject)
    private readonly faqProjectRepository: Repository<FaqProject>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GuidedTour)
    private readonly guidedTourRepository: Repository<GuidedTour>,
  ) {
    this.appRoot = process.cwd();
    this.mlRoot = this.resolveMlRoot();
    this.orgStorageRoot = this.resolveOrgStorageRoot();
    this.pythonExecutable = this.resolvePythonExecutable();
    this.generateScriptPath = path.join(this.mlRoot, 'rag', 'generate_faq_embeddings.py');
    fs.mkdirSync(this.orgStorageRoot, { recursive: true });
  }

  async listForOrganization(
    organizationId: string,
    actorId?: string,
    projectKey?: string,
  ): Promise<FaqItem[]> {
    const normalizedKey = projectKey ? normalizeFaqProjectKey(projectKey) : undefined;
    const items = await this.faqRepository.find({
      where: normalizedKey
        ? { organizationId, projectKey: normalizedKey }
        : { organizationId },
      order: { projectKey: 'ASC', updatedAt: 'DESC' },
    });
    await this.attachEditLocks(items, actorId);
    return items;
  }

  async listProjectKeysForOrganization(organizationId: string): Promise<string[]> {
    const [itemKeys, registeredRows] = await Promise.all([
      this.faqRepository
        .createQueryBuilder('item')
        .select('DISTINCT item.projectKey', 'projectKey')
        .where('item.organizationId = :organizationId', { organizationId })
        .orderBy('item.projectKey', 'ASC')
        .getRawMany<{ projectKey: string }>(),
      this.faqProjectRepository.find({
        where: { organizationId },
        order: { projectKey: 'ASC' },
      }),
    ]);

    const keys = [
      ...new Set([
        ...itemKeys.map((row) => row.projectKey).filter(Boolean),
        ...registeredRows.map((row) => row.projectKey).filter(Boolean),
      ]),
    ]
      .filter((key) => !isSdkLabProjectKey(key))
      .sort();

    return keys.length > 0 ? keys : [DEFAULT_FAQ_PROJECT_KEY];
  }

  async listProjectKeyCounts(organizationId: string): Promise<Record<string, number>> {
    const rows = await this.faqRepository
      .createQueryBuilder('item')
      .select('item.projectKey', 'projectKey')
      .addSelect('COUNT(*)', 'count')
      .where('item.organizationId = :organizationId', { organizationId })
      .groupBy('item.projectKey')
      .orderBy('item.projectKey', 'ASC')
      .getRawMany<{ projectKey: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.projectKey) continue;
      counts[row.projectKey] = Number(row.count) || 0;
    }

    const projectKeys = await this.listProjectKeysForOrganization(organizationId);
    for (const key of projectKeys) {
      if (counts[key] === undefined) {
        counts[key] = 0;
      }
    }

    return counts;
  }

  async listProjectKeyTourCounts(organizationId: string): Promise<Record<string, number>> {
    const flowVersionExpr = tourFlowVersionSqlExpr('tour');
    const labPath = `%${SDK_LAB_TARGET_PATH_SEGMENT}%`;

    const rows = await this.guidedTourRepository
      .createQueryBuilder('tour')
      .select(flowVersionExpr, 'flowVersion')
      .addSelect('COUNT(*)', 'count')
      .where('tour.organizationId = :organizationId', { organizationId })
      .andWhere(`${flowVersionExpr} IS NOT NULL`)
      .andWhere(`${flowVersionExpr} != ''`)
      .andWhere('LOWER(tour.targetUrl) NOT LIKE :sdkLabPath', { sdkLabPath: labPath })
      .groupBy(flowVersionExpr)
      .orderBy(flowVersionExpr, 'ASC')
      .getRawMany<{ flowVersion: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.flowVersion || isSdkLabProjectKey(row.flowVersion)) continue;
      counts[normalizeFaqProjectKey(row.flowVersion)] = Number(row.count) || 0;
    }

    const unscopedRow = await this.guidedTourRepository
      .createQueryBuilder('tour')
      .select('COUNT(*)', 'count')
      .where('tour.organizationId = :organizationId', { organizationId })
      .andWhere(`(${flowVersionExpr} IS NULL OR ${flowVersionExpr} = '')`)
      .andWhere('LOWER(tour.targetUrl) NOT LIKE :sdkLabPath', { sdkLabPath: labPath })
      .getRawOne<{ count: string }>();

    const unscopedCount = Number(unscopedRow?.count) || 0;
    if (unscopedCount > 0) {
      counts[DEFAULT_FAQ_PROJECT_KEY] = (counts[DEFAULT_FAQ_PROJECT_KEY] ?? 0) + unscopedCount;
    }

    return counts;
  }

  async registerProject(
    organizationId: string,
    projectKey: string,
  ): Promise<{ projectKey: string; created: boolean }> {
    const normalized = normalizeFaqProjectKey(projectKey);
    if (normalized === DEFAULT_FAQ_PROJECT_KEY) {
      return { projectKey: normalized, created: false };
    }

    const existing = await this.faqProjectRepository.findOne({
      where: { organizationId, projectKey: normalized },
    });
    if (existing) {
      return { projectKey: normalized, created: false };
    }

    await this.faqProjectRepository.save({
      organizationId,
      projectKey: normalized,
    });
    return { projectKey: normalized, created: true };
  }

  async deleteProjectPack(organizationId: string, projectKey: string): Promise<number> {
    const normalized = normalizeFaqProjectKey(projectKey);
    if (normalized === DEFAULT_FAQ_PROJECT_KEY) {
      throw new BadRequestException('Le corpus FAQ générique ne peut pas être supprimé');
    }

    const deleted = await this.removeAllForOrganization(organizationId, normalized);
    await this.faqProjectRepository.delete({ organizationId, projectKey: normalized });
    return deleted;
  }

  private async ensureProjectRegistered(organizationId: string, projectKey: string): Promise<void> {
    const normalized = normalizeFaqProjectKey(projectKey);
    if (normalized === DEFAULT_FAQ_PROJECT_KEY) {
      return;
    }
    await this.registerProject(organizationId, normalized);
  }

  async listActiveForOrganization(
    organizationId: string,
    projectKey?: string,
  ): Promise<FaqItem[]> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    return this.faqRepository.find({
      where: { organizationId, isActive: true, projectKey: normalizedKey },
      order: { updatedAt: 'DESC' },
    });
  }

  async getSuggestionsForOrganization(
    organizationId: string,
    context?: string,
    limit = 4,
    projectKey?: string,
  ): Promise<Array<{ id: string; question: string }>> {
    const activeItems = await this.listActiveForOrganization(organizationId, projectKey);
    const ranked = rankFaqSuggestions(
      activeItems.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        category: item.category,
        tags: item.tags,
        viewCount: item.viewCount,
        helpfulCount: item.helpfulCount,
      })),
      context,
      limit,
    );

    return ranked.map((item) => ({
      id: item.id,
      question: item.question,
    }));
  }

  async getIndexStatus(
    organizationId: string,
    projectKey?: string,
  ): Promise<{
    activeCount: number;
    embeddingsReady: boolean;
    needsReindex: boolean;
    lastIndexedAt: string | null;
    projectKey: string;
  }> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true, projectKey: normalizedKey },
    });
    const embeddingsPath = this.resolveEmbeddingsPathForSearch(organizationId, normalizedKey);
    const embeddingsReady = Boolean(embeddingsPath);
    const lastIndexedAt =
      embeddingsPath && fs.existsSync(embeddingsPath)
        ? new Date(fs.statSync(embeddingsPath).mtimeMs).toISOString()
        : null;
    const needsReindex = await this.needsEmbeddingsRebuild(organizationId, normalizedKey);

    return {
      activeCount,
      embeddingsReady,
      needsReindex,
      lastIndexedAt,
      projectKey: normalizedKey,
    };
  }

  async trackView(id: string, organizationId: string): Promise<void> {
    const result = await this.faqRepository.increment({ id, organizationId }, 'viewCount', 1);
    if (!result.affected) {
      throw new NotFoundException('Entree FAQ introuvable');
    }
  }

  async trackFeedback(id: string, organizationId: string, helpful: boolean): Promise<void> {
    const field = helpful ? 'helpfulCount' : 'notHelpfulCount';
    const result = await this.faqRepository.increment({ id, organizationId }, field, 1);
    if (!result.affected) {
      throw new NotFoundException('Entree FAQ introuvable');
    }
  }

  async getById(id: string, organizationId: string, actorId?: string): Promise<FaqItem> {
    const row = await this.faqRepository.findOne({ where: { id, organizationId } });
    if (!row) {
      throw new NotFoundException('Entree FAQ introuvable');
    }
    await this.attachEditLock(row, actorId);
    return row;
  }

  async create(organizationId: string, dto: CreateFaqEntryDto): Promise<FaqItem> {
    const projectKey = normalizeFaqProjectKey(dto.projectKey);
    await this.ensureProjectRegistered(organizationId, projectKey);
    const row = this.faqRepository.create({
      organizationId,
      projectKey,
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      category: dto.category?.trim() || null,
      tags: dto.tags ?? [],
      isActive: dto.isActive ?? true,
      contentUpdatedAt: new Date(),
    });
    const saved = await this.faqRepository.save(row);
    this.scheduleEmbeddingsRebuild(organizationId, projectKey);
    return saved;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateFaqEntryDto,
    actorId: string,
  ): Promise<FaqItem> {
    const row = await this.getById(id, organizationId, actorId);
    const holderDisplayName = await this.resolveEditLockHolderDisplayName(row);
    assertFaqEditLockHeldForSave(row, actorId, holderDisplayName);
    const previousProjectKey = row.projectKey;

    if (dto.question !== undefined) row.question = dto.question.trim();
    if (dto.answer !== undefined) row.answer = dto.answer.trim();
    if (dto.category !== undefined) row.category = dto.category?.trim() || null;
    if (dto.tags !== undefined) row.tags = dto.tags;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.projectKey !== undefined) row.projectKey = normalizeFaqProjectKey(dto.projectKey);

    if (isFaqEditLockHeldBy(row, actorId)) {
      row.editLockExpiresAt = new Date(Date.now() + FAQ_EDIT_LOCK_TTL_MS);
    }

    this.markFaqContentUpdated(row);
    const saved = await this.faqRepository.save(row);
    this.scheduleEmbeddingsRebuild(organizationId, saved.projectKey);
    if (saved.projectKey !== previousProjectKey) {
      this.scheduleEmbeddingsRebuild(organizationId, previousProjectKey);
    }
    await this.attachEditLock(saved, actorId);
    return saved;
  }

  async setActive(
    id: string,
    organizationId: string,
    isActive: boolean,
    actorId: string,
  ): Promise<FaqItem> {
    return this.faqRepository.manager.transaction(async (manager) => {
      const row = await manager.findOne(FaqItem, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Entree FAQ introuvable');
      }

      const holderDisplayName = await this.resolveEditLockHolderDisplayName(row);
      assertFaqPublishBlockedWhileEditedByOther(row, actorId, holderDisplayName);

      if (row.isActive === isActive) {
        await this.attachEditLock(row, actorId);
        return row;
      }

      row.isActive = isActive;
      this.markFaqContentUpdated(row);
      const saved = await manager.save(row);
      this.scheduleEmbeddingsRebuild(organizationId, saved.projectKey);
      await this.attachEditLock(saved, actorId);
      return saved;
    });
  }

  async remove(id: string, organizationId: string, actorId: string): Promise<void> {
    const row = await this.getById(id, organizationId, actorId);
    const holderDisplayName = await this.resolveEditLockHolderDisplayName(row);
    assertFaqDeleteBlockedWhileEditing(row, actorId, holderDisplayName);
    const projectKey = row.projectKey;
    await this.faqRepository.remove(row);
    this.scheduleEmbeddingsRebuild(organizationId, projectKey);
  }

  async removeAllForOrganization(organizationId: string, projectKey?: string): Promise<number> {
    const normalizedKey = projectKey ? normalizeFaqProjectKey(projectKey) : undefined;
    const where = normalizedKey ? { organizationId, projectKey: normalizedKey } : { organizationId };
    const deleted = await this.faqRepository.count({ where });
    if (deleted === 0) {
      return 0;
    }

    await this.faqRepository.delete(where);
    if (normalizedKey) {
      this.scheduleEmbeddingsRebuild(organizationId, normalizedKey);
    } else {
      const keys = await this.listProjectKeysForOrganization(organizationId);
      for (const key of keys) {
        this.scheduleEmbeddingsRebuild(organizationId, key);
      }
    }
    return deleted;
  }

  async acquireFaqEditLock(
    id: string,
    organizationId: string,
    actorId: string,
  ): Promise<{ item: FaqItem; editLock: FaqEditLockInfo }> {
    assertCanAcquireFaqEditLock(actorId);
    const row = await this.getById(id, organizationId, actorId);
    const now = new Date();

    if (
      !row.editLockedBy ||
      isFaqEditLockExpired(row.editLockExpiresAt) ||
      row.editLockedBy === actorId
    ) {
      row.editLockedBy = actorId;
      row.editLockedAt = now;
      row.editLockExpiresAt = new Date(now.getTime() + FAQ_EDIT_LOCK_TTL_MS);
      await this.faqRepository.save({
        id: row.id,
        editLockedBy: row.editLockedBy,
        editLockedAt: row.editLockedAt,
        editLockExpiresAt: row.editLockExpiresAt,
      });
      const refreshed = await this.getById(id, organizationId, actorId);
      return { item: refreshed, editLock: refreshed.editLock! };
    }

    const holderDisplayName = await this.loadUserDisplayName(row.editLockedBy);
    const editLock = buildFaqEditLockInfo(row, actorId, holderDisplayName);
    throw new ConflictException({
      message: buildFaqEditLockConflictMessage(holderDisplayName),
      editLock,
    });
  }

  async renewFaqEditLock(
    id: string,
    organizationId: string,
    actorId: string,
  ): Promise<{ item: FaqItem; editLock: FaqEditLockInfo }> {
    assertCanAcquireFaqEditLock(actorId);
    const row = await this.getById(id, organizationId, actorId);

    if (!isFaqEditLockHeldBy(row, actorId)) {
      const holderDisplayName = row.editLockedBy
        ? await this.loadUserDisplayName(row.editLockedBy)
        : undefined;
      throw new ConflictException({
        message: buildFaqEditLockConflictMessage(holderDisplayName),
        editLock: buildFaqEditLockInfo(row, actorId, holderDisplayName),
      });
    }

    row.editLockExpiresAt = new Date(Date.now() + FAQ_EDIT_LOCK_TTL_MS);
    await this.faqRepository.save({
      id: row.id,
      editLockExpiresAt: row.editLockExpiresAt,
    });
    const refreshed = await this.getById(id, organizationId, actorId);
    return { item: refreshed, editLock: refreshed.editLock! };
  }

  async releaseFaqEditLock(id: string, organizationId: string, actorId?: string): Promise<void> {
    const row = await this.faqRepository.findOne({ where: { id, organizationId } });
    if (!row?.editLockedBy) {
      return;
    }
    if (
      actorId &&
      row.editLockedBy !== actorId &&
      !isFaqEditLockExpired(row.editLockExpiresAt)
    ) {
      return;
    }

    await this.faqRepository.save({
      id: row.id,
      editLockedBy: null,
      editLockedAt: null,
      editLockExpiresAt: null,
    });
  }

  private async attachEditLocks(items: FaqItem[], actorId?: string): Promise<void> {
    const lockedByIds = [
      ...new Set(
        items
          .filter((item) => hasActiveFaqEditLock(item))
          .map((item) => item.editLockedBy!)
          .filter(Boolean),
      ),
    ];
    const namesById = await this.loadUserDisplayNames(lockedByIds);
    for (const item of items) {
      const holderDisplayName = item.editLockedBy
        ? namesById.get(item.editLockedBy)
        : undefined;
      item.editLock = buildFaqEditLockInfo(item, actorId, holderDisplayName);
    }
  }

  private async attachEditLock(item: FaqItem, actorId?: string): Promise<void> {
    let holderDisplayName: string | undefined;
    if (item.editLockedBy && !isFaqEditLockExpired(item.editLockExpiresAt)) {
      holderDisplayName = await this.loadUserDisplayName(item.editLockedBy);
    }
    item.editLock = buildFaqEditLockInfo(item, actorId, holderDisplayName);
  }

  private async resolveEditLockHolderDisplayName(row: FaqItem): Promise<string | undefined> {
    if (!hasActiveFaqEditLock(row) || !row.editLockedBy) {
      return undefined;
    }
    return this.loadUserDisplayName(row.editLockedBy);
  }

  private async loadUserDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const users = await this.userRepository.find({ where: { id: In(userIds) } });
    return new Map(users.map((user) => [user.id, this.formatUserDisplayName(user)]));
  }

  private async loadUserDisplayName(userId: string): Promise<string | undefined> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return undefined;
    }
    return this.formatUserDisplayName(user);
  }

  private formatUserDisplayName(user: User): string {
    const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return full || user.email;
  }

  async importGlobalCatalog(
    organizationId: string,
    options: ImportGlobalFaqOptions = {},
  ): Promise<ImportGlobalFaqResult> {
    const skipDuplicates = options.skipDuplicates ?? true;
    const replaceExisting = options.replaceExisting ?? false;
    const projectKey = normalizeFaqProjectKey(options.projectKey);
    const catalog = this.loadGlobalCatalog();

    if (replaceExisting) {
      await this.faqRepository.delete({ organizationId, projectKey });
    }

    const existingQuestions = new Set<string>();
    if (skipDuplicates && !replaceExisting) {
      const existing = await this.listForOrganization(organizationId, undefined, projectKey);
      for (const row of existing) {
        existingQuestions.add(this.normalizeQuestion(row.question));
      }
    }

    const toSave: FaqItem[] = [];
    let skipped = 0;

    for (const item of catalog) {
      const question = typeof item.question === 'string' ? item.question.trim() : '';
      if (!question) {
        skipped += 1;
        continue;
      }

      const normalized = this.normalizeQuestion(question);
      if (skipDuplicates && existingQuestions.has(normalized)) {
        skipped += 1;
        continue;
      }

      existingQuestions.add(normalized);
      toSave.push(
        this.faqRepository.create({
          organizationId,
          projectKey,
          question,
          answer: typeof item.answer === 'string' && item.answer.trim() ? item.answer.trim() : '—',
          category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null,
          tags: this.buildGlobalImportTags(item),
          isActive: true,
          contentUpdatedAt: new Date(),
        }),
      );
    }

    if (toSave.length > 0) {
      await this.faqRepository.save(toSave);
    }

    this.scheduleEmbeddingsRebuild(organizationId, projectKey);

    return {
      imported: toSave.length,
      skipped,
      totalInCatalog: catalog.length,
    };
  }

  getOrgQuestionsPath(organizationId: string, projectKey = DEFAULT_FAQ_PROJECT_KEY): string {
    const segment = faqProjectStorageSegment(projectKey);
    return path.join(this.orgStorageRoot, organizationId, segment, 'faq_questions.json');
  }

  getOrgEmbeddingsPath(organizationId: string, projectKey = DEFAULT_FAQ_PROJECT_KEY): string {
    const segment = faqProjectStorageSegment(projectKey);
    return path.join(this.orgStorageRoot, organizationId, segment, 'faq_embeddings.json');
  }

  getLegacyOrgEmbeddingsPath(organizationId: string): string {
    return path.join(this.orgStorageRoot, organizationId, 'faq_embeddings.json');
  }

  resolveEmbeddingsPathForSearch(organizationId?: string, projectKey?: string): string | null {
    if (!organizationId) {
      return null;
    }
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    const projectPath = this.getOrgEmbeddingsPath(organizationId, normalizedKey);
    if (fs.existsSync(projectPath)) {
      return projectPath;
    }
    if (normalizedKey === DEFAULT_FAQ_PROJECT_KEY) {
      const legacyPath = this.getLegacyOrgEmbeddingsPath(organizationId);
      if (fs.existsSync(legacyPath)) {
        return legacyPath;
      }
    }
    return null;
  }

  private rebuildScopeKey(organizationId: string, projectKey: string): string {
    return `${organizationId}:${normalizeFaqProjectKey(projectKey)}`;
  }

  private markFaqContentUpdated(row: FaqItem): void {
    row.contentUpdatedAt = new Date();
  }

  async needsEmbeddingsRebuild(organizationId: string, projectKey?: string): Promise<boolean> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    const embeddingsPath =
      this.resolveEmbeddingsPathForSearch(organizationId, normalizedKey) ??
      this.getOrgEmbeddingsPath(organizationId, normalizedKey);
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true, projectKey: normalizedKey },
    });

    if (activeCount === 0) {
      return fs.existsSync(embeddingsPath);
    }

    if (!fs.existsSync(embeddingsPath)) {
      return true;
    }

    const row = await this.faqRepository
      .createQueryBuilder('item')
      .select('MAX(item.contentUpdatedAt)', 'maxContentUpdatedAt')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('item.projectKey = :projectKey', { projectKey: normalizedKey })
      .andWhere('item.isActive = :isActive', { isActive: true })
      .getRawOne<{ maxContentUpdatedAt: Date | string | null }>();

    if (!row?.maxContentUpdatedAt) {
      return true;
    }

    const latestChangeMs = new Date(row.maxContentUpdatedAt).getTime();
    const indexMtimeMs = fs.statSync(embeddingsPath).mtimeMs;
    return latestChangeMs > indexMtimeMs;
  }

  async ensureEmbeddingsForOrganization(
    organizationId: string,
    projectKey?: string,
  ): Promise<string | null> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true, projectKey: normalizedKey },
    });
    if (activeCount === 0) {
      return null;
    }

    if (!(await this.needsEmbeddingsRebuild(organizationId, normalizedKey))) {
      return this.resolveEmbeddingsPathForSearch(organizationId, normalizedKey);
    }

    try {
      return await this.rebuildEmbeddings(organizationId, normalizedKey);
    } catch (error) {
      this.logger.warn(
        `Unable to build org FAQ embeddings for ${organizationId}/${normalizedKey}: ${(error as Error).message}`,
      );
      return this.resolveEmbeddingsPathForSearch(organizationId, normalizedKey);
    }
  }

  async rebuildEmbeddings(
    organizationId: string,
    projectKey = DEFAULT_FAQ_PROJECT_KEY,
  ): Promise<string> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    const scopeKey = this.rebuildScopeKey(organizationId, normalizedKey);
    const inFlight = this.rebuildLocks.get(scopeKey);
    if (inFlight) {
      this.reindexPending.add(scopeKey);
      return inFlight;
    }

    const job = this.executeRebuildEmbeddings(organizationId, normalizedKey).finally(() => {
      this.rebuildLocks.delete(scopeKey);
      if (!this.reindexPending.has(scopeKey)) {
        return;
      }
      this.reindexPending.delete(scopeKey);
      void this.needsEmbeddingsRebuild(organizationId, normalizedKey)
        .then((stillStale) => {
          if (!stillStale) {
            return undefined;
          }
          return this.rebuildEmbeddings(organizationId, normalizedKey);
        })
        .catch((error) => {
          this.logger.warn(
            `Follow-up FAQ reindex failed for ${organizationId}/${normalizedKey}: ${(error as Error).message}`,
          );
        });
    });

    this.rebuildLocks.set(scopeKey, job);
    return job;
  }

  private async executeRebuildEmbeddings(
    organizationId: string,
    projectKey: string,
  ): Promise<string> {
    const activeItems = await this.listActiveForOrganization(organizationId, projectKey);
    this.ensureOrgProjectStorageDir(organizationId, projectKey);
    const questionsPath = this.getOrgQuestionsPath(organizationId, projectKey);
    const embeddingsPath = this.getOrgEmbeddingsPath(organizationId, projectKey);

    const payload = activeItems.map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      category: item.category ?? 'general',
      priority: this.extractPriorityFromTags(item.tags),
      tags: item.tags,
    }));

    fs.writeFileSync(questionsPath, JSON.stringify(payload, null, 2), 'utf-8');

    if (payload.length === 0) {
      if (fs.existsSync(embeddingsPath)) {
        fs.unlinkSync(embeddingsPath);
      }
      return embeddingsPath;
    }

    if (!fs.existsSync(this.generateScriptPath)) {
      throw new BadRequestException(
        `Script de generation des embeddings introuvable: ${this.generateScriptPath}`,
      );
    }

    await this.runGenerateEmbeddings(questionsPath, embeddingsPath);
    if (!fs.existsSync(embeddingsPath)) {
      throw new InternalServerErrorException(
        `Fichier d'embeddings introuvable apres generation: ${embeddingsPath}`,
      );
    }
    return embeddingsPath;
  }

  scheduleEmbeddingsRebuild(organizationId: string, projectKey = DEFAULT_FAQ_PROJECT_KEY): void {
    const normalizedKey = normalizeFaqProjectKey(projectKey);
    void this.rebuildEmbeddings(organizationId, normalizedKey).catch((error) => {
      this.logger.warn(
        `Background FAQ reindex failed for ${organizationId}/${normalizedKey}: ${(error as Error).message}`,
      );
    });
  }

  private resolveMlRoot(): string {
    const envRoot = process.env.FAQ_ML_ROOT?.trim();
    if (envRoot) {
      return path.resolve(envRoot);
    }

    const candidates = [
      path.join(this.appRoot, 'ml'),
      path.resolve(this.appRoot, '..', 'ml'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'rag', 'generate_faq_embeddings.py'))) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private resolveOrgStorageRoot(): string {
    const envRoot = process.env.FAQ_ORG_STORAGE_DIR?.trim();
    if (envRoot) {
      return path.resolve(envRoot);
    }
    return path.join(this.appRoot, 'data', 'faq-orgs');
  }

  private ensureOrgProjectStorageDir(organizationId: string, projectKey: string): void {
    const segment = faqProjectStorageSegment(projectKey);
    fs.mkdirSync(path.join(this.orgStorageRoot, organizationId, segment), { recursive: true });
  }

  private ensureOrgStorageDir(organizationId: string): void {
    fs.mkdirSync(path.join(this.orgStorageRoot, organizationId), { recursive: true });
  }

  private resolvePythonExecutable(): string {
    const envPython = process.env.PYTHON_EXECUTABLE;
    if (envPython?.trim()) {
      return envPython.trim();
    }
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private getGlobalCatalogPath(): string {
    const envPath = process.env.FAQ_GLOBAL_CATALOG_PATH?.trim();
    if (envPath) {
      return envPath;
    }
    return path.join(this.mlRoot, 'data', 'raw', 'faq_questions.json');
  }

  private loadGlobalCatalog(): GlobalFaqCatalogItem[] {
    const catalogPath = this.getGlobalCatalogPath();
    if (!fs.existsSync(catalogPath)) {
      throw new BadRequestException(`Catalogue FAQ TrustDev introuvable: ${catalogPath}`);
    }

    const raw = fs.readFileSync(catalogPath, 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Le catalogue FAQ TrustDev doit etre un tableau JSON');
    }

    return parsed.filter((item): item is GlobalFaqCatalogItem => typeof item === 'object' && item !== null);
  }

  private normalizeQuestion(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private buildGlobalImportTags(item: GlobalFaqCatalogItem): string[] {
    const tags = ['trustdev-global'];
    if (item.id !== undefined && item.id !== null && String(item.id).trim()) {
      tags.push(`source-id:${String(item.id).trim()}`);
    }
    if (typeof item.priority === 'string' && item.priority.trim()) {
      tags.push(`priority:${item.priority.trim().toLowerCase()}`);
    }
    return tags;
  }

  private extractPriorityFromTags(tags: string[]): string {
    const priorityTag = tags.find((tag) => tag.startsWith('priority:'));
    if (!priorityTag) {
      return 'medium';
    }
    const value = priorityTag.slice('priority:'.length).trim();
    return value || 'medium';
  }

  private runGenerateEmbeddings(inputPath: string, outputPath: string): Promise<void> {
    const scriptCwd = this.mlRoot;
    const timeoutMs = Number(process.env.FAQ_PYTHON_TIMEOUT_MS ?? 600000);

    return new Promise((resolve, reject) => {
      const child = spawn(
        this.pythonExecutable,
        [
          this.generateScriptPath,
          '--input',
          inputPath,
          '--output',
          outputPath,
        ],
        {
          cwd: scriptCwd,
          env: {
            ...process.env,
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8',
          },
        },
      );

      let stderr = '';
      let settled = false;

      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`FAQ embedding generation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (stderr.trim()) {
          this.logger.warn(`FAQ embedding stderr: ${stderr.trim()}`);
        }
        if (code !== 0) {
          const detail = stderr.trim() || `exit code ${code}`;
          reject(new Error(`FAQ embedding generation failed: ${detail}`));
          return;
        }
        resolve();
      });
    });
  }
}
