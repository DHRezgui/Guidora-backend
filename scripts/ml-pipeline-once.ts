import { writeFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatasetGeneratorService } from '../src/ml/dataset-generator.service';

const ORG_ID = '07b9bbcf-3493-434b-99fe-e39a956bd293';
const SKIP_ANALYZE = process.argv.includes('--skip-analyze');

async function run() {
  const logger = new Logger('MlPipelineOnce');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'log'] });

  try {
    const datasetService = app.get(DatasetGeneratorService);

    if (!SKIP_ANALYZE) {
      const { BehaviorAnalysisService } = await import('../src/behavior-analysis/behavior-analysis.service');
      const analysisService = app.get(BehaviorAnalysisService);
      logger.log(`Analyzing sessions for org=${ORG_ID} (batchSize=15)`);
      const processed = await analysisService.analyzeOrganizationSessions(ORG_ID, 15);
      logger.log(`Analyses refreshed: ${processed}`);
    } else {
      logger.log('Skipping analyze (--skip-analyze)');
    }

    const quality = await datasetService.getDatasetQualityReport(ORG_ID);
    logger.log(`Dataset quality: ${JSON.stringify(quality)}`);

    const json = await datasetService.exportDatasetJSON(ORG_ID);
    writeFileSync('ml/data/raw/dataset_export.json', json);
    const parsed = JSON.parse(json) as { totalSamples?: number; features?: unknown[] };
    const samples = parsed.totalSamples ?? parsed.features?.length ?? 0;
    logger.log(`Exported ml/data/raw/dataset_export.json samples=${samples}`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error('[MlPipelineOnce] Failed:', error?.message || error);
  process.exit(1);
});
