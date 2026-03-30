import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  PredictionFeaturesDto,
  PredictionRequestDto,
  PredictionResponseDto,
  ModelHealthDto,
} from './dto/prediction.dto';

@Injectable()
export class PredictionService implements OnModuleInit {
  private readonly logger = new Logger(PredictionService.name);
  private modelPath: string;
  private featurePath: string;
  private pythonScriptPath: string;
  private pythonExecutable: string;
  private modelLoaded = false;
  private modelVersion: string;
  private featureNames: string[] = [];

  constructor() {
    // Resolve workspace root whether process starts from repo root or backend/
    const cwd = process.cwd();
    const workspaceRoot = path.basename(cwd).toLowerCase() === 'backend'
      ? path.resolve(cwd, '..')
      : cwd;

    this.modelPath = path.join(workspaceRoot, 'ml', 'models', 'lightgbm_model.pkl');
    this.featurePath = path.join(workspaceRoot, 'ml', 'models', 'feature_names.json');
    this.pythonScriptPath = path.join(workspaceRoot, 'ml', 'predict.py');

    const envPython = process.env.PYTHON_EXECUTABLE?.trim();
    if (envPython) {
      this.pythonExecutable = envPython;
    } else {
      const windowsVenvPython = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
      const unixVenvPython = path.join(workspaceRoot, '.venv', 'bin', 'python');
      this.pythonExecutable = process.platform === 'win32' ? windowsVenvPython : unixVenvPython;
    }
  }

  async onModuleInit(): Promise<void> {
    /**
     * Initialize prediction service on application startup
     * - Verify model and features files exist
     * - Load feature names
     */
    try {
      const filesReady = await this.checkModelFiles();
      await this.loadFeatureNames();
      await this.testPythonEnvironment();
      this.modelLoaded = filesReady;

      if (this.modelLoaded) {
        this.logger.log('Prediction service initialized successfully');
      } else {
        this.logger.warn('Prediction service initialized without model artifacts');
      }
    } catch (error) {
      this.modelLoaded = false;
      this.logger.error(`Failed to initialize prediction service: ${error.message}`);
      // Don't fail module init - just log warning
    }
  }

  /**
   * Verify model and feature files exist
   */
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

  /**
   * Load feature names from feature_names.json
   */
  private async loadFeatureNames(): Promise<void> {
    try {
      const content = await fs.readFile(this.featurePath, 'utf-8');
      const data = JSON.parse(content);
      this.featureNames = Array.isArray(data) ? data : data.features || [];
      this.logger.debug(`Loaded ${this.featureNames.length} feature names`);
    } catch (error) {
      this.logger.warn(`Could not load feature names: ${error.message}`);
      // Set defaults
      this.featureNames = [
        'timeOnPage',
        'scrollDepth',
        'clickMisses',
        'hesitations',
        'abandonmentRisk',
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

  /**
   * Test Python environment and model loading
   */
  private async testPythonEnvironment(): Promise<void> {
    try {
    } catch (error) {
      // Python environment will be tested on first prediction
    }
  }

  /**
   * Make real-time abandonment prediction
   */
  async predict(requestDto: PredictionRequestDto): Promise<PredictionResponseDto> {
    const startTime = Date.now();

    try {
      // Validate model is loaded
      if (!this.modelLoaded) {
        return {
          success: false,
          error: 'Model not loaded. Service may not be fully initialized.',
          timestamp: new Date().toISOString(),
        };
      }

      // Compute derived features if not provided
      const features = this.computeDerivedFeatures(requestDto.features);

      // Prepare input for Python script
      const inputData = {
        features,
      };

      // Call prediction script
      const prediction = await this.executePredictionScript(
        inputData,
        requestDto.threshold || 0.5,
      );

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        prediction,
        timestamp: new Date().toISOString(),
        metadata: {
          modelVersion: this.modelVersion || '1.0',
          executionTimeMs: executionTime,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Prediction error: ${error.message}`);

      return {
        success: false,
        error: error.message || 'Prediction failed',
        timestamp: new Date().toISOString(),
        metadata: {
          modelVersion: this.modelVersion || '1.0',
          executionTimeMs: executionTime,
        },
      };
    }
  }

  /**
   * Compute derived features from raw features
   */
  private computeDerivedFeatures(features: PredictionFeaturesDto): Record<string, number> {
    const result = { ...features };

    // Ensure all expected fields are present
    if (result.timeOnPage && result.multiplePages) {
      result.timePerPage = result.timeOnPage / (result.multiplePages || 1);
    } else if (!result.timePerPage) {
      result.timePerPage = result.timeOnPage || 0;
    }

    // Click miss rate
    if (!result.clickMissRate) {
      result.clickMissRate = (result.clickMisses || 0) > 0 ? 
        Math.min((result.clickMisses / 5), 1.0) : 0; // Normalize to 0-1
    }

    // Hesitation rate
    if (!result.hesitationRate) {
      result.hesitationRate = (result.hesitations || 0) > 0 ?
        Math.min((result.hesitations / 5), 1.0) : 0;
    }

    // Friction score (weighted combination)
    if (!result.frictionScore) {
      result.frictionScore = (
        (result.clickMissRate * 0.55) +
        (result.hesitationRate * 0.45)
      );
    }

    // High friction flag
    if (result.frictionScore !== undefined && result.frictionScore > 0.5) {
      result.highFriction = 1;
    } else {
      result.highFriction = result.highFriction || 0;
    }

    // Multiple issues flag
    const issueCount = (result.clickMisses || 0) + (result.hesitations || 0);
    if (issueCount > 2) {
      result.multipleIssues = 1;
    } else {
      result.multipleIssues = result.multipleIssues || 0;
    }

    return result;
  }

  /**
   * Execute Python prediction script via child_process
   */
  private async executePredictionScript(
    inputData: { features: Record<string, number> },
    threshold: number,
  ): Promise<any> {
    try {
      // Spawn Python process with stdin
      const child = spawn(this.pythonExecutable, [
        this.pythonScriptPath,
        '--threshold',
        threshold.toString(),
      ]);

      let stdout = '';
      let stderr = '';

      // Collect output
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send input via stdin
      child.stdin.write(JSON.stringify(inputData));
      child.stdin.end();

      // Wait for process to complete
      return new Promise((resolve, reject) => {
        child.on('error', (error) => {
          reject(new Error(`Failed to start python process (${this.pythonExecutable}): ${error.message}`));
        });

        child.on('close', (code) => {
          try {
            if (stderr) {
              this.logger.debug(`Python script stderr: ${stderr}`);
            }

            if (code !== 0) {
              reject(new Error(`Python process exited with code ${code}: ${stderr}`));
              return;
            }

            const result = JSON.parse(stdout);

            if (!result.success) {
              reject(new Error(result.error || 'Python script failed'));
              return;
            }

            resolve(result.prediction);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        // JSON parse error - Python script output was malformed
        throw new Error(`Invalid prediction response: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check model health and readiness
   */
  async getModelHealth(): Promise<ModelHealthDto> {
    try {
      const modelExists = await this.fileExists(this.modelPath);
      const featuresExists = await this.fileExists(this.featurePath);

      return {
        success: true,
        modelLoaded: this.modelLoaded && modelExists,
        modelVersion: this.modelVersion || '1.0',
        featureCount: this.featureNames.length,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        modelLoaded: false,
      };
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
