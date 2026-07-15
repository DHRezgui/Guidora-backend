import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  PredictionFeaturesDto,
  PredictionRequestDto,
  PredictionResponseDto,
  PredictionResultDto,
  ModelHealthDto,
} from './dto/prediction.dto';
import { enrichAbandonmentFeatures } from './abandonment-derived-features';
import { AbandonmentPythonWorkerService } from './abandonment-python-worker.service';

@Injectable()
export class PredictionService implements OnModuleInit {
  private readonly logger = new Logger(PredictionService.name);
  private modelPath: string;
  private featurePath: string;
  private modelLoaded = false;
  private modelVersion = '1.0';
  private featureNames: string[] = [];
  private readonly sessionRateLimitMs = 10_000;
  private readonly sessionLastRequestAt = new Map<string, number>();

  constructor(private readonly abandonmentWorker: AbandonmentPythonWorkerService) {
    const cwd = process.cwd();
    const workspaceRoot = path.basename(cwd).toLowerCase() === 'backend'
      ? path.resolve(cwd, '..')
      : cwd;

    this.modelPath = path.join(workspaceRoot, 'ml', 'models', 'lightgbm_model.pkl');
    this.featurePath = path.join(workspaceRoot, 'ml', 'models', 'feature_names.json');
  }

  async onModuleInit(): Promise<void> {
    try {
      const filesReady = await this.checkModelFiles();
      await this.loadFeatureNames();
      this.modelLoaded = filesReady;

      if (this.modelLoaded) {
        this.logger.log('Prediction service initialized successfully');
      } else {
        this.logger.warn('Prediction service initialized without model artifacts');
      }
    } catch (error) {
      this.modelLoaded = false;
      this.logger.error(`Failed to initialize prediction service: ${this.getErrorMessage(error)}`);
    }
  }

  private async checkModelFiles(): Promise<boolean> {
    const files = { model: this.modelPath, features: this.featurePath };
    let allFound = true;

    for (const [name, filePath] of Object.entries(files)) {
      try {
        await fs.access(filePath);
        this.logger.debug(`${name} file found: ${filePath}`);
      } catch {
        allFound = false;
        this.logger.warn(`${name} file not found: ${filePath}`);
      }
    }

    return allFound;
  }

  private async loadFeatureNames(): Promise<void> {
    try {
      const content = await fs.readFile(this.featurePath, 'utf-8');
      const data = JSON.parse(content);
      this.featureNames = Array.isArray(data) ? data : data.features || [];
      this.logger.debug(`Loaded ${this.featureNames.length} feature names`);
    } catch (error) {
      this.logger.warn(`Could not load feature names: ${this.getErrorMessage(error)}`);
      this.featureNames = [
        'timeOnPage',
        'pageTime',
        'scrollDepth',
        'clickMisses',
        'hesitations',
        'helpTriggered',
        'hasError',
        'multiplePages',
        'timePerPage',
        'clickMissRate',
        'hesitationRate',
        'frictionScore',
        'highFriction',
        'multipleIssues',
      ];
    }
  }

  async predict(requestDto: PredictionRequestDto): Promise<PredictionResponseDto> {
    const startTime = Date.now();

    try {
      this.checkSessionRateLimit(requestDto.sessionId);

      if (!this.modelLoaded) {
        return {
          success: false,
          error: 'Model not loaded. Service may not be fully initialized.',
          timestamp: new Date().toISOString(),
        };
      }

      const features = this.computeDerivedFeatures(requestDto.features);
      const threshold = requestDto.threshold ?? 0.5;
      const shouldExplain = Boolean(requestDto.explain && requestDto.debug);
      const workerResponse = await this.abandonmentWorker.infer(
        features,
        threshold,
        { explain: shouldExplain, debug: requestDto.debug },
        shouldExplain ? 12_000 : undefined,
      );

      const executionTime = Date.now() - startTime;

      if (!workerResponse.ok) {
        const reason =
          workerResponse.reason === 'timeout' ||
          workerResponse.reason === 'worker_crashed' ||
          workerResponse.reason === 'worker_unavailable'
            ? 'worker_unavailable'
            : workerResponse.reason;

        return {
          success: false,
          reason,
          error: workerResponse.error ?? 'Abandonment prediction worker unavailable',
          timestamp: new Date().toISOString(),
          metadata: {
            modelVersion: this.modelVersion || '1.0',
            executionTimeMs: executionTime,
          },
        };
      }

      this.recordSessionRequest(requestDto.sessionId);

      return {
        success: true,
        prediction: this.mapWorkerPrediction(workerResponse.result),
        timestamp: new Date().toISOString(),
        metadata: {
          modelVersion: this.modelVersion || '1.0',
          executionTimeMs: executionTime,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const executionTime = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Prediction error: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage || 'Prediction failed',
        timestamp: new Date().toISOString(),
        metadata: {
          modelVersion: this.modelVersion || '1.0',
          executionTimeMs: executionTime,
        },
      };
    }
  }

  async warmupAbandonmentWorker(): Promise<{
    success: boolean;
    workerReady: boolean;
    modelLoaded: boolean;
  }> {
    const warmed = await this.abandonmentWorker.warmup();
    return {
      success: warmed,
      workerReady: warmed,
      modelLoaded: this.modelLoaded,
    };
  }

  private checkSessionRateLimit(sessionId?: string): void {
    const key = sessionId?.trim() || 'anonymous';
    const now = Date.now();
    const last = this.sessionLastRequestAt.get(key);
    if (last !== undefined && now - last < this.sessionRateLimitMs) {
      throw new HttpException(
        'Abandonment prediction rate limit exceeded (max 1 request per 10 seconds per session).',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordSessionRequest(sessionId?: string): void {
    const key = sessionId?.trim() || 'anonymous';
    this.sessionLastRequestAt.set(key, Date.now());
  }

  private mapWorkerPrediction(result: Record<string, unknown>): PredictionResultDto {
    const mapped: PredictionResultDto = {
      abandonmentRisk: Number(result.abandonmentRisk),
      willAbandon: Boolean(result.willAbandon),
      confidence: Number(result.confidence),
      threshold: Number(result.threshold),
    };

    const explanation = result.explanation;
    if (explanation && typeof explanation === 'object') {
      const raw = explanation as Record<string, unknown>;
      const topFeatures = Array.isArray(raw.topFeatures)
        ? raw.topFeatures
            .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
            .map((row) => ({
              feature: String(row.feature ?? ''),
              contribution: Number(row.contribution),
              value: Number(row.value),
            }))
        : [];
      if (topFeatures.length > 0) {
        mapped.explanation = {
          topFeatures,
          expectedValue:
            raw.expectedValue === undefined || raw.expectedValue === null
              ? undefined
              : Number(raw.expectedValue),
          baseProbability:
            raw.baseProbability === undefined || raw.baseProbability === null
              ? undefined
              : Number(raw.baseProbability),
        };
      }
    }

    return mapped;
  }

  private computeDerivedFeatures(features: PredictionFeaturesDto): Record<string, number> {
    const result = { ...features } as Record<string, number>;

    if (result.abandonmentRisk === undefined || result.abandonmentRisk === null) {
      result.abandonmentRisk = 0;
    }

    return enrichAbandonmentFeatures(result);
  }

  async getModelHealth(): Promise<ModelHealthDto> {
    try {
      const modelExists = await this.fileExists(this.modelPath);
      const featuresExists = await this.fileExists(this.featurePath);

      return {
        success: true,
        modelLoaded: this.modelLoaded && modelExists,
        workerReady: this.abandonmentWorker.isWarmed(),
        modelVersion: this.modelVersion || '1.0',
        featureCount: this.featureNames.length,
        lastUpdated: new Date().toISOString(),
      };
    } catch {
      return {
        success: false,
        modelLoaded: false,
        workerReady: false,
      };
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
