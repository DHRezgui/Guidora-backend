import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BehaviorAnalysis } from '../behavior-analysis/entities/behavior-analysis.entity';
import type { MLDataset, FeatureVector } from './dto';
import { DATASET_FEATURE_NAMES, DATASET_SCHEMA_VERSION } from './constants/dataset-schema';

@Injectable()
export class DatasetGeneratorService {
  constructor(
    @InjectRepository(BehaviorAnalysis)
    private analysisRepository: Repository<BehaviorAnalysis>,
  ) {}

  /**
   * Générer un dataset complet pour l'entraînement ML
   */
  async generateDataset(organizationId: string): Promise<MLDataset> {
    // Récupérer toutes les analyses comportementales
    const analyses = await this.analysisRepository.find({
      where: { organizationId },
      order: { analyzedAt: 'DESC' },
    });

    // Générer les vecteurs de features
    const features = analyses.map(analysis => this.createFeatureVector(analysis));
    
    // Créer le dataset
    const dataset: MLDataset = {
      organizationId,
      totalSamples: features.length,
      features,
      metadata: {
        generatedAt: new Date(),
        version: DATASET_SCHEMA_VERSION,
        featureNames: [...DATASET_FEATURE_NAMES],
      },
    };

    return dataset;
  }

  /**
   * Créer un vecteur de features à partir d'une analyse
   */
  private createFeatureVector(analysis: BehaviorAnalysis): FeatureVector {
    return {
      // Features numériques
      timeOnPage: analysis.timeOnPage || 0,
      scrollDepth: Number(analysis.scrollDepth) || 0,
      clickMisses: analysis.clickMisses || 0,
      hesitations: analysis.hesitations || 0,
      abandonmentRisk: Number(analysis.abandonmentRisk) || 0,
      
      // Features booléennes
      helpTriggered: analysis.helpTriggered ? 1 : 0,
      
      // Features catégorielles (one-hot encoding)
      hasError: analysis.analysisData?.errorCount > 0 ? 1 : 0,
      multiplePages: analysis.analysisData?.uniquePages > 1 ? 1 : 0,
      
      // Label (pour l'entraînement supervisé)
      label: this.getLabel(analysis),
      
      // Métadonnées
      sessionId: analysis.sessionId,
      userId: analysis.userId || null,
      analyzedAt: analysis.analyzedAt,
    };
  }

  /**
   * Déterminer le label pour l'entraînement supervisé
   */
  private getLabel(analysis: BehaviorAnalysis): 0 | 1 {
    // Label 1 = abandon (risque élevé)
    // Label 0 = succès (risque faible)
    return analysis.abandonmentRisk > 0.65 ? 1 : 0;
  }

  /**
   * Exporter le dataset au format CSV
   */
  async exportDatasetCSV(organizationId: string): Promise<string> {
    const dataset = await this.generateDataset(organizationId);
    
    // En-tête CSV
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
      'label',
    ].join(',');

    // Données CSV
    const rows = dataset.features.map(feature => 
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
        feature.label,
      ].join(',')
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
    const missingValues = features.reduce((count, f) => {
      return count + Object.values(f).filter((v) => v === null || v === undefined).length;
    }, 0);

    const imbalanceRatio = totalSamples > 0 ? positiveSamples / totalSamples : 0;

    return {
      schemaVersion: DATASET_SCHEMA_VERSION,
      totalSamples,
      positiveSamples,
      negativeSamples,
      imbalanceRatio,
      missingValues,
      isEnoughDataForTraining: totalSamples >= 100,
      hasAcceptableClassBalance: imbalanceRatio >= 0.1 && imbalanceRatio <= 0.9,
      featuresPerSample: features[0] ? Object.keys(features[0]).length : 0,
    };
  }
}