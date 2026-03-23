import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
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

  if (Number.isNaN(sessions) || sessions < 1) {
    throw new Error('--sessions must be a positive integer');
  }

  if (Number.isNaN(highRiskRatio) || highRiskRatio < 0 || highRiskRatio > 1) {
    throw new Error('--highRiskRatio must be a number between 0 and 1');
  }

  return {
    organizationId,
    userId,
    sessions,
    highRiskRatio,
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

async function run() {
  const logger = new Logger('BehaviorDataSeeder');
  const options = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule);
  const trackingService = app.get(TrackingService);
  const behaviorAnalysisService = app.get(BehaviorAnalysisService);
  const datasetService = app.get(DatasetGeneratorService);

  try {
    logger.log(`Seeding started for organization=${options.organizationId}`);
    logger.log(`sessions=${options.sessions}, highRiskRatio=${options.highRiskRatio}`);

    let createdEvents = 0;
    let highRiskSessions = 0;

    for (let i = 0; i < options.sessions; i++) {
      const isHighRisk = i < Math.floor(options.sessions * options.highRiskRatio);
      const sessionId = randomUUID();
      const events = isHighRisk
        ? createHighRiskEvents(sessionId, options.organizationId, options.userId)
        : createLowRiskEvents(sessionId, options.organizationId, options.userId);

      await trackingService.trackBatch(events);
      createdEvents += events.length;
      if (isHighRisk) highRiskSessions++;

      if ((i + 1) % 20 === 0) {
        logger.log(`Progress: ${i + 1}/${options.sessions} sessions generated`);
      }
    }

    logger.log(`Events created: ${createdEvents}`);
    logger.log(`High-risk synthetic sessions: ${highRiskSessions}`);

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
