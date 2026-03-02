import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { BehaviorAnalysisService } from '../../behavior-analysis/behavior-analysis.service';
import { OrganizationService } from '../../organization/organization.service';
import { Logger } from '@nestjs/common';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const analysisService = app.get(BehaviorAnalysisService);
  const organizationService = app.get(OrganizationService);
  const logger = new Logger('InitialAnalysis');

  logger.log(' Démarrage de l\'analyse initiale...');

  try {
    const organizations = await organizationService.findAll();
    
    for (const org of organizations) {
      logger.log(` Analyse de l'organisation: ${org.name} (${org.id})`);
      const processed = await analysisService.analyzeOrganizationSessions(org.id);
      logger.log(` ${processed} sessions analysées`);
    }

    logger.log(' Analyse initiale terminée !');
  } catch (error) {
    logger.error(' Erreur lors de l\'analyse:', error);
  } finally {
    await app.close();
  }
}

run();