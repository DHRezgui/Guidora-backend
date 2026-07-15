/**
 * DTOs for ML Module
 */

export interface FeatureVector {
  // Numeric features
  timeOnPage: number;
  scrollDepth: number;
  clickMisses: number;
  hesitations: number;
  abandonmentRisk: number;

  // Binary features (one-hot encoded)
  helpTriggered: 0 | 1;
  hasError: 0 | 1;
  multiplePages: 0 | 1;

  // Label (supervised learning)
  label: 0 | 1; // 0=success, 1=abandoned
  labelSource: 'real' | 'synthetic';
  /** Ground truth from user_progress when status is terminal; null when synthetic fallback was used. */
  isAbandoned?: boolean | null;
  progressStatus?: string | null;

  // Metadata
  sessionId: string;
  userId?: string | null;
  analyzedAt: Date;
}

export interface MLDataset {
  organizationId: string;
  totalSamples: number;
  features: FeatureVector[];
  metadata: {
    generatedAt: Date;
    version: string;
    featureNames: string[];
    labelSourceCounts?: {
      real: number;
      synthetic: number;
    };
  };
}

export interface DatasetStats {
  totalSamples: number;
  positiveSamples: number;
  negativeSamples: number;
  imbalanceRatio: number;
  avgFeaturesPerSample: number;
  missingValues: number;
}

export interface FeatureImportance {
  featureName: string;
  importance: number;
  rank: number;
}
