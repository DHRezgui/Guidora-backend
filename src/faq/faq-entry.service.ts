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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.appRoot = process.cwd();
    this.mlRoot = this.resolveMlRoot();
    this.orgStorageRoot = this.resolveOrgStorageRoot();
    this.pythonExecutable = this.resolvePythonExecutable();
    this.generateScriptPath = path.join(this.mlRoot, 'rag', 'generate_faq_embeddings.py');
    fs.mkdirSync(this.orgStorageRoot, { recursive: true });
  }

  async listForOrganization(organizationId: string, actorId?: string): Promise<FaqItem[]> {
    const items = await this.faqRepository.find({
      where: { organizationId },
      order: { updatedAt: 'DESC' },
    });
    await this.attachEditLocks(items, actorId);
    return items;
  }

  async listActiveForOrganization(organizationId: string): Promise<FaqItem[]> {
    return this.faqRepository.find({
      where: { organizationId, isActive: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async getSuggestionsForOrganization(
    organizationId: string,
    context?: string,
    limit = 4,
  ): Promise<Array<{ id: string; question: string }>> {
    const activeItems = await this.listActiveForOrganization(organizationId);
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

  async getIndexStatus(organizationId: string): Promise<{
    activeCount: number;
    embeddingsReady: boolean;
    needsReindex: boolean;
    lastIndexedAt: string | null;
  }> {
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true },
    });
    const embeddingsPath = this.getOrgEmbeddingsPath(organizationId);
    const embeddingsReady = fs.existsSync(embeddingsPath);
    const lastIndexedAt = embeddingsReady
      ? new Date(fs.statSync(embeddingsPath).mtimeMs).toISOString()
      : null;
    const needsReindex = await this.needsEmbeddingsRebuild(organizationId);

    return {
      activeCount,
      embeddingsReady,
      needsReindex,
      lastIndexedAt,
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
    const row = this.faqRepository.create({
      organizationId,
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      category: dto.category?.trim() || null,
      tags: dto.tags ?? [],
      isActive: dto.isActive ?? true,
    });
    const saved = await this.faqRepository.save(row);
    this.scheduleEmbeddingsRebuild(organizationId);
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

    if (dto.question !== undefined) row.question = dto.question.trim();
    if (dto.answer !== undefined) row.answer = dto.answer.trim();
    if (dto.category !== undefined) row.category = dto.category?.trim() || null;
    if (dto.tags !== undefined) row.tags = dto.tags;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    if (isFaqEditLockHeldBy(row, actorId)) {
      row.editLockExpiresAt = new Date(Date.now() + FAQ_EDIT_LOCK_TTL_MS);
    }

    const saved = await this.faqRepository.save(row);
    this.scheduleEmbeddingsRebuild(organizationId);
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
      const saved = await manager.save(row);
      this.scheduleEmbeddingsRebuild(organizationId);
      await this.attachEditLock(saved, actorId);
      return saved;
    });
  }

  async remove(id: string, organizationId: string, actorId: string): Promise<void> {
    const row = await this.getById(id, organizationId, actorId);
    const holderDisplayName = await this.resolveEditLockHolderDisplayName(row);
    assertFaqDeleteBlockedWhileEditing(row, actorId, holderDisplayName);
    await this.faqRepository.remove(row);
    this.scheduleEmbeddingsRebuild(organizationId);
  }

  async removeAllForOrganization(organizationId: string): Promise<number> {
    const deleted = await this.faqRepository.count({ where: { organizationId } });
    if (deleted === 0) {
      return 0;
    }

    await this.faqRepository.delete({ organizationId });
    this.scheduleEmbeddingsRebuild(organizationId);
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
    const catalog = this.loadGlobalCatalog();

    if (replaceExisting) {
      await this.faqRepository.delete({ organizationId });
    }

    const existingQuestions = new Set<string>();
    if (skipDuplicates && !replaceExisting) {
      const existing = await this.listForOrganization(organizationId);
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
          question,
          answer: typeof item.answer === 'string' && item.answer.trim() ? item.answer.trim() : '—',
          category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null,
          tags: this.buildGlobalImportTags(item),
          isActive: true,
        }),
      );
    }

    if (toSave.length > 0) {
      await this.faqRepository.save(toSave);
    }

    this.scheduleEmbeddingsRebuild(organizationId);

    return {
      imported: toSave.length,
      skipped,
      totalInCatalog: catalog.length,
    };
  }

  getOrgQuestionsPath(organizationId: string): string {
    return path.join(this.orgStorageRoot, organizationId, 'faq_questions.json');
  }

  getOrgEmbeddingsPath(organizationId: string): string {
    return path.join(this.orgStorageRoot, organizationId, 'faq_embeddings.json');
  }

  resolveEmbeddingsPathForSearch(organizationId?: string): string | null {
    if (!organizationId) {
      return null;
    }
    const orgPath = this.getOrgEmbeddingsPath(organizationId);
    return fs.existsSync(orgPath) ? orgPath : null;
  }

  async needsEmbeddingsRebuild(organizationId: string): Promise<boolean> {
    const embeddingsPath = this.getOrgEmbeddingsPath(organizationId);
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true },
    });

    if (activeCount === 0) {
      return fs.existsSync(embeddingsPath);
    }

    if (!fs.existsSync(embeddingsPath)) {
      return true;
    }

    const row = await this.faqRepository
      .createQueryBuilder('item')
      .select('MAX(item.updatedAt)', 'maxUpdatedAt')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('item.isActive = :isActive', { isActive: true })
      .getRawOne<{ maxUpdatedAt: Date | string | null }>();

    if (!row?.maxUpdatedAt) {
      return true;
    }

    const latestChangeMs = new Date(row.maxUpdatedAt).getTime();
    const indexMtimeMs = fs.statSync(embeddingsPath).mtimeMs;
    return latestChangeMs > indexMtimeMs;
  }

  async ensureEmbeddingsForOrganization(organizationId: string): Promise<string | null> {
    const activeCount = await this.faqRepository.count({
      where: { organizationId, isActive: true },
    });
    if (activeCount === 0) {
      return null;
    }

    if (!(await this.needsEmbeddingsRebuild(organizationId))) {
      return this.getOrgEmbeddingsPath(organizationId);
    }

    try {
      return await this.rebuildEmbeddings(organizationId);
    } catch (error) {
      this.logger.warn(
        `Unable to build org FAQ embeddings for ${organizationId}: ${(error as Error).message}`,
      );
      return this.resolveEmbeddingsPathForSearch(organizationId);
    }
  }

  async rebuildEmbeddings(organizationId: string): Promise<string> {
    const inFlight = this.rebuildLocks.get(organizationId);
    if (inFlight) {
      this.reindexPending.add(organizationId);
      return inFlight;
    }

    const job = this.executeRebuildEmbeddings(organizationId).finally(() => {
      this.rebuildLocks.delete(organizationId);
      if (!this.reindexPending.has(organizationId)) {
        return;
      }
      this.reindexPending.delete(organizationId);
      void this.needsEmbeddingsRebuild(organizationId)
        .then((stillStale) => {
          if (!stillStale) {
            return undefined;
          }
          return this.rebuildEmbeddings(organizationId);
        })
        .catch((error) => {
          this.logger.warn(
            `Follow-up FAQ reindex failed for ${organizationId}: ${(error as Error).message}`,
          );
        });
    });

    this.rebuildLocks.set(organizationId, job);
    return job;
  }

  private async executeRebuildEmbeddings(organizationId: string): Promise<string> {
    const activeItems = await this.listActiveForOrganization(organizationId);
    this.ensureOrgStorageDir(organizationId);
    const questionsPath = this.getOrgQuestionsPath(organizationId);
    const embeddingsPath = this.getOrgEmbeddingsPath(organizationId);

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

  scheduleEmbeddingsRebuild(organizationId: string): void {
    void this.rebuildEmbeddings(organizationId).catch((error) => {
      this.logger.warn(
        `Background FAQ reindex failed for ${organizationId}: ${(error as Error).message}`,
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
