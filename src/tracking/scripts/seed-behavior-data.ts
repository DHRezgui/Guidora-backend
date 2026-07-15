import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { BehaviorAnalysisService } from '../../behavior-analysis/behavior-analysis.service';
import { TrackingService } from '../tracking.service';
import { EventType } from '../enums/tracking.enums';
import { DatasetGeneratorService } from '../../ml/dataset-generator.service';
import type { TrackEventDto } from '../dto/track-event.dto';

type SeedOptions = {
  organizationId: string;
  userId?: string;
  sessions: number;
  highRiskRatio: number;
  earlyExplorationRatio: number;
};

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const getArg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

  const organizationId = getArg('organizationId');
  if (!organizationId) {
    throw new Error('Missing required argument --organizationId=<uuid>');
  }

  const userId = getArg('userId');
  const sessions = Number.parseInt(getArg('sessions') || '120', 10);
  const highRiskRatio = Number.parseFloat(getArg('highRiskRatio') || '0.35');
  const earlyExplorationRatio = Number.parseFloat(getArg('earlyExplorationRatio') || '0.25');

  if (Number.isNaN(sessions) || sessions < 1) {
    throw new Error('--sessions must be a positive integer');
  }

  if (Number.isNaN(highRiskRatio) || highRiskRatio < 0 || highRiskRatio > 1) {
    throw new Error('--highRiskRatio must be a number between 0 and 1');
  }

  if (Number.isNaN(earlyExplorationRatio) || earlyExplorationRatio < 0 || earlyExplorationRatio > 1) {
    throw new Error('--earlyExplorationRatio must be a number between 0 and 1');
  }

  return {
    organizationId,
    userId,
    sessions,
    highRiskRatio,
    earlyExplorationRatio,
  };
}

function createLowRiskEvents(sessionId: string, organizationId: string, userId?: string): TrackEventDto[] {
  const base = {
    sessionId,
    organizationId,
    userId,
    pageUrl: '/dashboard',
    elementSelector: '#continue-btn',
    elementText: 'Continue',
  };

  return [
    { ...base, eventType: EventType.PAGE_VIEW, timeOnPage: 38, scrollDepth: 72 },
    { ...base, eventType: EventType.SCROLL, timeOnPage: 42, scrollDepth: 84 },
    { ...base, eventType: EventType.CLICK, timeOnPage: 35, scrollDepth: 70 },
    { ...base, eventType: EventType.PAGE_VIEW, pageUrl: '/onboarding', timeOnPage: 46, scrollDepth: 78 },
    { ...base, eventType: EventType.SCROLL, pageUrl: '/onboarding', timeOnPage: 40, scrollDepth: 88 },
    { ...base, eventType: EventType.CLICK, pageUrl: '/onboarding', timeOnPage: 34, scrollDepth: 74 },
  ];
}

function createHighRiskEvents(sessionId: string, organizationId: string, userId?: string): TrackEventDto[] {
  const shared = {
    sessionId,
    organizationId,
    userId,
    elementSelector: '#confusing-btn',
    elementText: 'Submit',
    timeOnPage: 180,
    scrollDepth: 12,
  };

  // Risk profile target:
  // - avgTimeOnPage > 120 (+0.2)
  // - avgScrollDepth < 30 (+0.15)
  // - clickMisses > 2 using CLICK -> HOVER patterns (+0.25)
  // - eventsPerPage < 2 by spreading on many pages (+0.1)
  // Total >= 0.7 (label = 1)
  return [
    { ...shared, eventType: EventType.PAGE_VIEW, pageUrl: '/dashboard' },
    { ...shared, eventType: EventType.CLICK, pageUrl: '/dashboard' },
    { ...shared, eventType: EventType.HOVER, pageUrl: '/support' },
    { ...shared, eventType: EventType.CLICK, pageUrl: '/onboarding' },
    { ...shared, eventType: EventType.HOVER, pageUrl: '/help' },
    { ...shared, eventType: EventType.CLICK, pageUrl: '/setup' },
    { ...shared, eventType: EventType.HOVER, pageUrl: '/faq' },
  ];
}

function createEarlyExplorationEvents(
  sessionId: string,
  organizationId: string,
  userId?: string,
): TrackEventDto[] {
  const base = {
    sessionId,
    organizationId,
    userId,
    pageUrl: '/settings',
    elementSelector: '#card-surface',
    elementText: 'Card',
  };

  // Early session: short dwell, low scroll, a few click-misses — user still exploring (label COMPLETED).
  return [
    { ...base, eventType: EventType.PAGE_VIEW, timeOnPage: 45, scrollDepth: 17 },
    { ...base, eventType: EventType.SCROLL, timeOnPage: 40, scrollDepth: 12 },
    { ...base, eventType: EventType.CLICK, timeOnPage: 42, scrollDepth: 15 },
    { ...base, eventType: EventType.HOVER, timeOnPage: 43, scrollDepth: 16 },
    { ...base, eventType: EventType.CLICK, timeOnPage: 44, scrollDepth: 17 },
    { ...base, eventType: EventType.HOVER, timeOnPage: 45, scrollDepth: 17 },
  ];
}

const SEED_USER_PASSWORD_HASH = '$2b$10$seed.behavior.data.placeholder.hash.not.for.login';

async function resolveTourId(dataSource: DataSource, organizationId: string): Promise<string | null> {
  const rows = await dataSource.query(
    `SELECT id FROM guided_tours WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function seedGroundTruthProgress(
  dataSource: DataSource,
  organizationId: string,
  userId: string,
  tourId: string,
  status: 'ABANDONED' | 'COMPLETED',
): Promise<void> {
  await dataSource.query(
    `
    INSERT INTO users (id, email, password_hash, organization_id, is_active, email_verified)
    VALUES ($1, $2, $3, $4, true, true)
    ON CONFLICT (email) DO NOTHING
    `,
    [userId, `seed-behavior-${userId}@trustdev.local`, SEED_USER_PASSWORD_HASH, organizationId],
  );

  await dataSource.query(
    `
    INSERT INTO user_progress (user_id, tour_id, status, completion_rate, started_at, last_interaction_at)
    VALUES ($1, $2, $3::progress_status, $4, NOW(), NOW())
    ON CONFLICT (user_id, tour_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      completion_rate = EXCLUDED.completion_rate,
      last_interaction_at = NOW(),
      updated_at = NOW()
    `,
    [userId, tourId, status, status === 'COMPLETED' ? 100 : 35],
  );
}

async function run() {
  const logger = new Logger('BehaviorDataSeeder');
  const options = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule);
  const trackingService = app.get(TrackingService);
  const behaviorAnalysisService = app.get(BehaviorAnalysisService);
  const datasetService = app.get(DatasetGeneratorService);
  const dataSource = app.get(DataSource);

  try {
    logger.log(`Seeding started for organization=${options.organizationId}`);
    logger.log(
      `sessions=${options.sessions}, highRiskRatio=${options.highRiskRatio}, earlyExplorationRatio=${options.earlyExplorationRatio}`,
    );

    const highRiskCount = Math.floor(options.sessions * options.highRiskRatio);
    const earlyExplorationCount = Math.floor(options.sessions * options.earlyExplorationRatio);

    const tourId = await resolveTourId(dataSource, options.organizationId);
    if (tourId) {
      logger.log(`Ground-truth labels enabled via tour=${tourId}`);
    } else {
      logger.warn('No guided tour found — labels will remain synthetic');
    }

    let createdEvents = 0;
    let highRiskSessions = 0;
    let earlyExplorationSessions = 0;
    let realLabelsSeeded = 0;

    for (let i = 0; i < options.sessions; i++) {
      const isHighRisk = i < highRiskCount;
      const isEarlyExploration = !isHighRisk && i < highRiskCount + earlyExplorationCount;
      const sessionId = randomUUID();
      const sessionUserId = options.userId ?? randomUUID();
      const events = isHighRisk
        ? createHighRiskEvents(sessionId, options.organizationId, sessionUserId)
        : isEarlyExploration
          ? createEarlyExplorationEvents(sessionId, options.organizationId, sessionUserId)
          : createLowRiskEvents(sessionId, options.organizationId, sessionUserId);

      if (tourId) {
        await seedGroundTruthProgress(
          dataSource,
          options.organizationId,
          sessionUserId,
          tourId,
          isHighRisk ? 'ABANDONED' : 'COMPLETED',
        );
        realLabelsSeeded++;
      }

      await trackingService.trackBatch(events);
      createdEvents += events.length;
      if (isHighRisk) highRiskSessions++;
      if (isEarlyExploration) earlyExplorationSessions++;

      if ((i + 1) % 20 === 0) {
        logger.log(`Progress: ${i + 1}/${options.sessions} sessions generated`);
      }
    }

    logger.log(`Events created: ${createdEvents}`);
    logger.log(`High-risk sessions: ${highRiskSessions}`);
    logger.log(`Early-exploration sessions: ${earlyExplorationSessions}`);
    if (tourId) {
      logger.log(`Ground-truth user_progress rows: ${realLabelsSeeded}`);
    }

    const processed = await behaviorAnalysisService.analyzeOrganizationSessions(options.organizationId);
    logger.log(`Behavior analyses refreshed: ${processed}`);

    const quality = await datasetService.getDatasetQualityReport(options.organizationId);
    logger.log(`Dataset quality: ${JSON.stringify(quality, null, 2)}`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  // Keep this explicit to make failures visible in CI/terminal.
  console.error('[BehaviorDataSeeder] Failed:', error?.message || error);
  process.exit(1);
});
