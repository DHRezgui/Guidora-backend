import { Injectable, Logger } from '@nestjs/common';
import type { FeatureVector } from './dto';

/**
 * Service de Feature Engineering
 * Transforme et normalise les vecteurs de features pour l'ML
 * 
 * Responsabilités:
 * - Normalisation des valeurs numériques
 * - Scaling des features
 * - Gestion des valeurs manquantes
 * - Création de features dérivées/polynomiales
 * - Détection des outliers
 */
@Injectable()
export class FeatureEngineeringService {
  private readonly logger = new Logger(FeatureEngineeringService.name);

  /**
   * Normaliser un ensemble de vecteurs de features (0-1)
   */
  normalizeFeatures(features: FeatureVector[]): FeatureVector[] {
    if (features.length === 0) return features;

    // Calculer min et max pour chaque feature numérique
    const stats = this.calculateStatistics(features);

    // Normaliser chaque vecteur
    return features.map(feature => ({
      ...feature,
      timeOnPage: this.normalize(feature.timeOnPage, stats.timeOnPage),
      scrollDepth: this.normalize(feature.scrollDepth, stats.scrollDepth),
      clickMisses: this.normalize(feature.clickMisses, stats.clickMisses),
      hesitations: this.normalize(feature.hesitations, stats.hesitations),
      abandonmentRisk: this.normalize(feature.abandonmentRisk, stats.abandonmentRisk),
    }));
  }

  /**
   * Standardiser (Z-score) les features
   */
  standardizeFeatures(features: FeatureVector[]): FeatureVector[] {
    if (features.length === 0) return features;

    const stats = this.calculateStatistics(features);

    return features.map(feature => ({
      ...feature,
      timeOnPage: this.standardize(feature.timeOnPage, stats.timeOnPage),
      scrollDepth: this.standardize(feature.scrollDepth, stats.scrollDepth),
      clickMisses: this.standardize(feature.clickMisses, stats.clickMisses),
      hesitations: this.standardize(feature.hesitations, stats.hesitations),
      abandonmentRisk: this.standardize(feature.abandonmentRisk, stats.abandonmentRisk),
    }));
  }

  /**
   * Créer des features dérivées et enrichies
   * Augmente le nombre de features pour améliorer la prédiction
   */
  createDerivedFeatures(features: FeatureVector[]): Record<string, any>[] {
    return features.map(feature => {
      return {
        // Features originales
        timeOnPage: feature.timeOnPage,
        scrollDepth: feature.scrollDepth,
        clickMisses: feature.clickMisses,
        hesitations: feature.hesitations,
        abandonmentRisk: feature.abandonmentRisk,
        helpTriggered: feature.helpTriggered,
        hasError: feature.hasError,
        multiplePages: feature.multiplePages,

        // Features dérivées - Interactions
        timeScrollInteraction: (feature.timeOnPage || 0) * (feature.scrollDepth || 0) / 100,
        clickHesitationRatio: feature.hesitations > 0 
          ? (feature.clickMisses || 0) / (feature.hesitations || 1) 
          : 0,
        frictionScore: this.calculateFrictionScore(feature),

        // Features polynomiales
        timeOnPageSquared: Math.pow(feature.timeOnPage || 0, 2),
        scrollDepthSquared: Math.pow(feature.scrollDepth || 0, 2),
        abandonmentRiskSquared: Math.pow(feature.abandonmentRisk || 0, 2),

        // Features log-transformées (éviter log(0))
        logTimeOnPage: Math.log1p(feature.timeOnPage || 0),
        logClickMisses: Math.log1p(feature.clickMisses || 0),
        logHesitations: Math.log1p(feature.hesitations || 0),

        // Features booléennes complexes
        highFriction: this.calculateFrictionScore(feature) > 0.7 ? 1 : 0,
        lowEngagement: (feature.scrollDepth || 0) < 20 && (feature.timeOnPage || 0) < 30 ? 1 : 0,
        multipleIssues: ((feature.clickMisses || 0) > 1 && (feature.hesitations || 0) > 0) ? 1 : 0,

        // Ratios normalisés
        clickMissRatio: feature.scrollDepth > 0 ? (feature.clickMisses || 0) / feature.scrollDepth : 0,
        hesitationByTime: feature.timeOnPage > 0 ? (feature.hesitations || 0) / feature.timeOnPage : 0,

        // Label
        label: feature.label,

        // Métadonnées
        sessionId: feature.sessionId,
        userId: feature.userId,
        analyzedAt: feature.analyzedAt,
      };
    });
  }

  /**
   * Détecter et traiter les valeurs manquantes
   */
  handleMissingValues(features: FeatureVector[], strategy: 'mean' | 'median' | 'drop' = 'mean'): FeatureVector[] {
    if (strategy === 'drop') {
      return features.filter(f =>
        f.timeOnPage !== undefined &&
        f.scrollDepth !== undefined &&
        f.clickMisses !== undefined &&
        f.hesitations !== undefined &&
        f.abandonmentRisk !== undefined
      );
    }

    // Calculer statistiques pour imputation
    const stats = this.calculateStatistics(features.filter(f =>
      f.timeOnPage !== undefined ||
      f.scrollDepth !== undefined ||
      f.clickMisses !== undefined ||
      f.hesitations !== undefined ||
      f.abandonmentRisk !== undefined
    ));

    const imputeValue = strategy === 'mean' ? stats : this.calculateMedian(features);

    return features.map(feature => ({
      ...feature,
      timeOnPage: feature.timeOnPage ?? imputeValue.timeOnPage.mean,
      scrollDepth: feature.scrollDepth ?? imputeValue.scrollDepth.mean,
      clickMisses: feature.clickMisses ?? imputeValue.clickMisses.mean,
      hesitations: feature.hesitations ?? imputeValue.hesitations.mean,
      abandonmentRisk: feature.abandonmentRisk ?? imputeValue.abandonmentRisk.mean,
    }));
  }

  /**
   * Détecter les outliers (IQR method)
   */
  detectOutliers(features: FeatureVector[], threshold = 1.5): {
    outliers: FeatureVector[];
    clean: FeatureVector[];
  } {
    const statistics = this.calculateStatistics(features);
    const outliers: FeatureVector[] = [];
    const clean: FeatureVector[] = [];

    features.forEach(feature => {
      let isOutlier = false;

      // Vérifier abandonment_risk (clé métrique)
      if (this.isOutlierValue(feature.abandonmentRisk, statistics.abandonmentRisk, threshold)) {
        isOutlier = true;
      }

      // Vérifier time_on_page
      if (this.isOutlierValue(feature.timeOnPage, statistics.timeOnPage, threshold)) {
        isOutlier = true;
      }

      // Vérifier click_misses
      if (this.isOutlierValue(feature.clickMisses, statistics.clickMisses, threshold)) {
        isOutlier = true;
      }

      if (isOutlier) {
        outliers.push(feature);
      } else {
        clean.push(feature);
      }
    });

    this.logger.log(
      `Outliers détectés: ${outliers.length}/${features.length} (${((outliers.length / features.length) * 100).toFixed(2)}%)`
    );

    return { outliers, clean };
  }

  /**
   * Balancer le dataset (pour skewed labels)
   * Augmente les minoritaires ou réduit les majoritaires
   */
  balanceDataset(features: FeatureVector[], strategy: 'oversample' | 'undersample' = 'oversample'): FeatureVector[] {
    const positives = features.filter(f => f.label === 1);
    const negatives = features.filter(f => f.label === 0);

    const ratio = positives.length / negatives.length;

    this.logger.log(`Ratio original: ${ratio.toFixed(2)} (${positives.length} positifs / ${negatives.length} négatifs)`);

    if (strategy === 'oversample') {
      // Dupliquer les minoritaires
      const duplicationFactor = Math.ceil(negatives.length / positives.length);
      const oversampled = [
        ...positives,
        ...this.duplicateRandomly(positives, duplicationFactor),
        ...negatives,
      ];

      this.logger.log(`Après oversampling: ${oversampled.length} samples`);
      return oversampled;
    } else {
      // Réduire les majoritaires
      const targetSize = Math.floor(positives.length * 1.5);
      const undersampled = [...positives, ...this.sampleRandomly(negatives, targetSize)];

      this.logger.log(`Après undersampling: ${undersampled.length} samples`);
      return undersampled;
    }
  }

  /**
   * Sélectionner les N features les plus importantes
   */
  selectTopFeatures(features: FeatureVector[], featureNames: string[], topK = 10): string[] {
    // Dans une vraie impl, on calculerait l'importance via correlation ou feature_importance
    // Pour l'instant, retourner les features clés
    const importanceOrder = [
      'abandonmentRisk',    // La plus prédictive
      'clickMisses',
      'hesitations',
      'timeOnPage',
      'scrollDepth',
      'helpTriggered',
      'hasError',
      'frictionScore',
      'highFriction',
      'multipleIssues',
    ];

    return importanceOrder.slice(0, topK);
  }

  // ============= Méthodes privées =============

  private calculateStatistics(features: FeatureVector[]) {
    const numeric = {
      timeOnPage: features.map(f => f.timeOnPage || 0),
      scrollDepth: features.map(f => f.scrollDepth || 0),
      clickMisses: features.map(f => f.clickMisses || 0),
      hesitations: features.map(f => f.hesitations || 0),
      abandonmentRisk: features.map(f => f.abandonmentRisk || 0),
    };

    return Object.entries(numeric).reduce((stats, [key, values]) => {
      stats[key] = this.computeStats(values);
      return stats;
    }, {} as Record<string, any>);
  }

  private computeStats(values: number[]) {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0, q1: 0, q3: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const q1Index = Math.floor(values.length * 0.25);
    const q3Index = Math.floor(values.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];

    return { min, max, mean, stdDev, q1, q3 };
  }

  private calculateMedian(features: FeatureVector[]) {
    const stats = {
      timeOnPage: { mean: 0 },
      scrollDepth: { mean: 0 },
      clickMisses: { mean: 0 },
      hesitations: { mean: 0 },
      abandonmentRisk: { mean: 0 },
    };

    const keys = Object.keys(stats) as Array<keyof typeof stats>;
    keys.forEach(key => {
      const values = (features.map(f => f[key] || 0) as number[]).filter(v => v !== 0);
      stats[key].mean = values.length > 0 ? values.reduce((a, b) => a + b) / values.length : 0;
    });

    return stats;
  }

  private normalize(value: number, stats: any): number {
    if (stats.max === stats.min) return 0;
    return (value - stats.min) / (stats.max - stats.min);
  }

  private standardize(value: number, stats: any): number {
    if (stats.stdDev === 0) return 0;
    return (value - stats.mean) / stats.stdDev;
  }

  private calculateFrictionScore(feature: FeatureVector): number {
    let score = 0;
    // Poids pour chaque facteur
    score += (feature.clickMisses || 0) * 0.3;
    score += (feature.hesitations || 0) * 0.25;
    score += Math.min((feature.timeOnPage || 0) / 120, 1) * 0.2; // Temps > 2min
    score += (1 - (feature.scrollDepth || 0) / 100) * 0.25; // Bas scroll depth
    return Math.min(score, 1.0);
  }

  private isOutlierValue(value: number, stats: any, threshold: number): boolean {
    const iqr = stats.q3 - stats.q1;
    const lowerBound = stats.q1 - threshold * iqr;
    const upperBound = stats.q3 + threshold * iqr;
    return value < lowerBound || value > upperBound;
  }

  private duplicateRandomly(items: any[], factor: number): any[] {
    const result: any[] = [];
    for (let i = 0; i < factor; i++) {
      const randomIndex = Math.floor(Math.random() * items.length);
      result.push(JSON.parse(JSON.stringify(items[randomIndex])));
    }
    return result;
  }

  private sampleRandomly(items: any[], size: number): any[] {
    const result: any[] = [];
    const indices = new Set<number>();
    while (indices.size < Math.min(size, items.length)) {
      indices.add(Math.floor(Math.random() * items.length));
    }
    indices.forEach(i => result.push(items[i]));
    return result;
  }
}
