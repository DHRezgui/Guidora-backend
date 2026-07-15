import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { MLDataset, FeatureVector } from './dto';
import { DATASET_FEATURE_NAMES, DATASET_SCHEMA_VERSION } from './constants/dataset-schema';

type LabelSource = 'real' | 'synthetic';

interface AnalysisGroundTruthRow {
  sessionId: string;
  userId: string | null;
  analyzedAt: Date;
  timeOnPage: number;
  scrollDepth: number;
  clickMisses: number;
  hesitations: number;
  abandonmentRisk: number;
  helpTriggered: boolean;
  progressStatus: string | null;
  isAbandoned: boolean | null;
}

@Injectable()
export class DatasetGeneratorService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Générer un dataset complet pour l'entraînement ML
   */
  async generateDataset(organizationId: string): Promise<MLDataset> {
    const rows = await this.loadRowsWithGroundTruth(organizationId);
    const features = rows.map((row) => this.createFeatureVectorFromRow(row));

    const realLabels = features.filter((feature) => feature.labelSource === 'real').length;
    const syntheticLabels = features.filter((feature) => feature.labelSource === 'synthetic').length;

    const dataset: MLDataset = {
      organizationId,
      totalSamples: features.length,
      features,
      metadata: {
        generatedAt: new Date(),
        version: DATASET_SCHEMA_VERSION,
        featureNames: [...DATASET_FEATURE_NAMES],
        labelSourceCounts: {
          real: realLabels,
          synthetic: syntheticLabels,
        },
      },
    };

    return dataset;
  }

  private async loadRowsWithGroundTruth(organizationId: string): Promise<AnalysisGroundTruthRow[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        ba.session_id AS "sessionId",
        ba.user_id AS "userId",
        ba.analyzed_at AS "analyzedAt",
        ba.time_on_page AS "timeOnPage",
        ba.scroll_depth AS "scrollDepth",
        ba.click_misses AS "clickMisses",
        ba.hesitations AS "hesitations",
        ba.abandonment_risk AS "abandonmentRisk",
        ba.help_triggered AS "helpTriggered",
        progress.status AS "progressStatus",
        CASE
          WHEN progress.status = 'ABANDONED' THEN TRUE
          WHEN progress.status = 'COMPLETED' THEN FALSE
          ELSE NULL
        END AS "isAbandoned"
      FROM behavior_analysis ba
      LEFT JOIN LATERAL (
        SELECT up.status
        FROM user_progress up
        INNER JOIN guided_tours gt ON gt.id = up.tour_id
        WHERE ba.user_id IS NOT NULL
          AND up.user_id = ba.user_id
          AND gt.organization_id = ba.organization_id
        ORDER BY up.last_interaction_at DESC NULLS LAST
        LIMIT 1
      ) progress ON TRUE
      WHERE ba.organization_id = $1
      ORDER BY ba.analyzed_at DESC
      `,
      [organizationId],
    );

    return rows.map((row: Record<string, unknown>) => ({
      sessionId: String(row.sessionId),
      userId: row.userId ? String(row.userId) : null,
      analyzedAt: row.analyzedAt instanceof Date ? row.analyzedAt : new Date(String(row.analyzedAt)),
      timeOnPage: Number(row.timeOnPage) || 0,
      scrollDepth: Number(row.scrollDepth) || 0,
      clickMisses: Number(row.clickMisses) || 0,
      hesitations: Number(row.hesitations) || 0,
      abandonmentRisk: Number(row.abandonmentRisk) || 0,
      helpTriggered: Boolean(row.helpTriggered),
      progressStatus: row.progressStatus ? String(row.progressStatus) : null,
      isAbandoned:
        row.isAbandoned === true ? true : row.isAbandoned === false ? false : null,
    }));
  }

  private createFeatureVectorFromRow(row: AnalysisGroundTruthRow): FeatureVector {
    const { label, labelSource } = this.resolveLabel(row);

    return {
      timeOnPage: row.timeOnPage,
      scrollDepth: row.scrollDepth,
      clickMisses: row.clickMisses,
      hesitations: row.hesitations,
      abandonmentRisk: row.abandonmentRisk,
      helpTriggered: row.helpTriggered ? 1 : 0,
      hasError: 0,
      multiplePages: 1,
      label,
      labelSource,
      isAbandoned: row.isAbandoned,
      progressStatus: row.progressStatus,
      sessionId: row.sessionId,
      userId: row.userId,
      analyzedAt: row.analyzedAt,
    };
  }

  /**
   * Prefer ground-truth labels from user_progress when terminal status is known.
   */
  private resolveLabel(row: AnalysisGroundTruthRow): { label: 0 | 1; labelSource: LabelSource } {
    if (row.isAbandoned === true) {
      return { label: 1, labelSource: 'real' };
    }
    if (row.isAbandoned === false) {
      return { label: 0, labelSource: 'real' };
    }
    return { label: this.getSyntheticLabel(row), labelSource: 'synthetic' };
  }

  /**
   * Behavioral proxy label when user_progress has no terminal status.
   */
  private getSyntheticLabel(row: AnalysisGroundTruthRow): 0 | 1 {
    const risk = Number(row.abandonmentRisk) || 0;
    const timeOnPage = row.timeOnPage || 0;
    const scrollDepth = Number(row.scrollDepth) || 0;
    const clickMisses = row.clickMisses || 0;
    const hesitations = row.hesitations || 0;

    if (risk >= 0.65) {
      return 1;
    }

    if (timeOnPage >= 120 && scrollDepth < 30 && (clickMisses >= 2 || hesitations >= 2)) {
      return 1;
    }

    if (clickMisses >= 3 && hesitations >= 1) {
      return 1;
    }

    return 0;
  }

  /**
   * Exporter le dataset au format CSV
   */
  async exportDatasetCSV(organizationId: string): Promise<string> {
    const dataset = await this.generateDataset(organizationId);

    const headers = [
      'sessionId',
      'timeOnPage',
      'scrollDepth',
      'clickMisses',
      'hesitations',
      'abandonmentRisk',
      'helpTriggered',
      'hasError',
      'multiplePages',
      'isAbandoned',
      'labelSource',
      'label',
    ].join(',');

    const rows = dataset.features.map((feature) =>
      [
        feature.sessionId,
        feature.timeOnPage,
        feature.scrollDepth,
        feature.clickMisses,
        feature.hesitations,
        feature.abandonmentRisk,
        feature.helpTriggered,
        feature.hasError,
        feature.multiplePages,
        feature.isAbandoned === null || feature.isAbandoned === undefined
          ? ''
          : feature.isAbandoned
            ? 1
            : 0,
        feature.labelSource,
        feature.label,
      ].join(','),
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Exporter le dataset au format JSON
   */
  async exportDatasetJSON(organizationId: string): Promise<string> {
    const dataset = await this.generateDataset(organizationId);
    return JSON.stringify(dataset, null, 2);
  }

  /**
   * Rapport de qualité dataset pour valider l'entraînement ML
   */
  async getDatasetQualityReport(organizationId: string) {
    const dataset = await this.generateDataset(organizationId);
    const features = dataset.features;

    const totalSamples = dataset.totalSamples;
    const positiveSamples = features.filter((f) => f.label === 1).length;
    const negativeSamples = features.filter((f) => f.label === 0).length;
    const realLabels = features.filter((f) => f.labelSource === 'real').length;
    const syntheticLabels = features.filter((f) => f.labelSource === 'synthetic').length;
    const missingValues = features.reduce((count, f) => {
      return count + Object.values(f).filter((v) => v === null || v === undefined).length;
    }, 0);

    const imbalanceRatio = totalSamples > 0 ? positiveSamples / totalSamples : 0;
    const realLabelRatio = totalSamples > 0 ? realLabels / totalSamples : 0;

    return {
      schemaVersion: DATASET_SCHEMA_VERSION,
      totalSamples,
      positiveSamples,
      negativeSamples,
      realLabels,
      syntheticLabels,
      realLabelRatio,
      imbalanceRatio,
      missingValues,
      isEnoughDataForTraining: totalSamples >= 100,
      hasAcceptableClassBalance: imbalanceRatio >= 0.1 && imbalanceRatio <= 0.9,
      featuresPerSample: features[0] ? Object.keys(features[0]).length : 0,
    };
  }
}
