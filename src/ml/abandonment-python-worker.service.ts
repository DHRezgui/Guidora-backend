import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const READY_MARKER = 'ABANDONMENT_WORKER_READY';

export type AbandonmentWorkerFailureReason =
  | 'timeout'
  | 'worker_crashed'
  | 'worker_unavailable'
  | 'invalid_response'
  | 'warmup_failed';

export interface AbandonmentWorkerInferResult {
  ok: true;
  result: Record<string, unknown>;
}

export interface AbandonmentWorkerInferFailure {
  ok: false;
  reason: AbandonmentWorkerFailureReason;
  error?: string;
}

export type AbandonmentWorkerResponse =
  | AbandonmentWorkerInferResult
  | AbandonmentWorkerInferFailure;

interface PendingRequest {
  resolve: (value: AbandonmentWorkerResponse) => void;
  timer: NodeJS.Timeout;
}

/**
 * Keeps a single Python worker alive for LightGBM abandonment inference.
 * Loads the model once per worker process; auto-restarts the worker once
 * on crash, then reports unavailable until re-warmed.
 */
@Injectable()
export class AbandonmentPythonWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AbandonmentPythonWorkerService.name);
  private readonly workspaceRoot: string;
  private readonly pythonExecutable: string;
  private readonly workerScriptPath: string;
  private readonly workerCwd: string;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  private child: ChildProcess | null = null;
  private stdoutBuffer = '';
  private readonly pending = new Map<string, PendingRequest>();
  private readyPromise: Promise<void> | null = null;
  private warmed = false;
  private restartAttemptedForProcess = false;
  private shuttingDown = false;

  constructor() {
    const cwd = process.cwd();
    this.workspaceRoot =
      path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
    this.pythonExecutable = this.resolvePythonExecutable();
    this.workerScriptPath = this.resolveWorkerScriptPath();
    this.workerCwd = path.join(this.workspaceRoot, 'ml');
    this.startupTimeoutMs = Math.max(
      5000,
      Number.parseInt(process.env.ML_ABANDONMENT_WORKER_STARTUP_TIMEOUT_MS ?? '60000', 10) ||
        60000,
    );
    this.requestTimeoutMs = Math.max(
      500,
      Number.parseInt(process.env.ML_ABANDONMENT_WORKER_REQUEST_TIMEOUT_MS ?? '5000', 10) || 5000,
    );
  }

  async onModuleInit(): Promise<void> {
    if ((process.env.ML_ABANDONMENT_WORKER_ENABLED ?? 'true').toLowerCase() !== 'true') {
      this.logger.log('Abandonment worker disabled (ML_ABANDONMENT_WORKER_ENABLED=false)');
      return;
    }
    if ((process.env.ML_ABANDONMENT_AUTO_WARMUP ?? 'true').toLowerCase() === 'false') {
      this.logger.log('Abandonment auto-warmup disabled (ML_ABANDONMENT_AUTO_WARMUP=false)');
      return;
    }
    try {
      const warmed = await this.warmup();
      if (warmed) {
        this.logger.log('Abandonment Python worker warmed up on backend start');
      } else {
        this.logger.warn('Abandonment Python worker auto-warmup did not complete successfully');
      }
    } catch (error) {
      this.logger.warn(
        `Abandonment Python worker auto-warmup failed: ${this.getErrorMessage(error)}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.rejectAllPending('worker_unavailable', 'Backend shutting down');
    this.stopChild();
  }

  isWarmed(): boolean {
    return this.warmed;
  }

  /**
   * Ensures the worker is running and the model is loaded.
   */
  async warmup(): Promise<boolean> {
    try {
      await this.ensureReady();
      const response = await this.request({ action: 'warmup' }, this.requestTimeoutMs);
      if (response.ok) {
        this.warmed = true;
        return true;
      }
      this.logger.warn(`Abandonment worker warmup failed: ${response.error ?? response.reason}`);
      return false;
    } catch (error) {
      this.logger.warn(`Abandonment worker warmup error: ${this.getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Run inference via the persistent worker.
   */
  async infer(
    features: Record<string, number>,
    threshold: number,
    options?: { explain?: boolean; debug?: boolean },
    timeoutMs = this.requestTimeoutMs,
  ): Promise<AbandonmentWorkerResponse> {
    try {
      await this.ensureReady();
      const body: Record<string, unknown> = { features, threshold };
      if (options?.explain) {
        body.explain = true;
      }
      if (options?.debug) {
        body.debug = true;
      }
      return await this.request(body, timeoutMs);
    } catch (error) {
      return {
        ok: false,
        reason: 'worker_unavailable',
        error: this.getErrorMessage(error),
      };
    }
  }

  private async ensureReady(): Promise<void> {
    if (!fs.existsSync(this.workerScriptPath)) {
      throw new Error(`Worker script not found at ${this.workerScriptPath}`);
    }
    if (this.child && !this.child.killed && this.readyPromise) {
      await this.readyPromise;
      return;
    }
    await this.startWorker();
  }

  private async startWorker(): Promise<void> {
    this.stopChild();
    this.restartAttemptedForProcess = false;

    const child = spawn(this.pythonExecutable, [this.workerScriptPath], {
      cwd: this.workerCwd,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;
    this.stdoutBuffer = '';

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const startupTimer = setTimeout(() => {
        reject(new Error(`Worker startup exceeded ${this.startupTimeoutMs}ms`));
        try {
          child.kill('SIGKILL');
        } catch {
          /* noop */
        }
      }, this.startupTimeoutMs);

      const onStderr = (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        if (text.includes(READY_MARKER)) {
          clearTimeout(startupTimer);
          child.stderr?.off('data', onStderr);
          resolve();
        }
        const trimmed = text.trim();
        if (trimmed) {
          this.logger.debug(`Abandonment worker stderr: ${trimmed}`);
        }
      };

      child.stderr?.on('data', onStderr);

      child.on('error', (error) => {
        clearTimeout(startupTimer);
        reject(error);
      });

      child.on('close', (code) => {
        if (!this.warmed) {
          clearTimeout(startupTimer);
          reject(new Error(`Worker exited before ready (code ${code ?? 'unknown'})`));
        }
      });
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      this.handleStdout(chunk.toString('utf-8'));
    });

    child.on('close', (code, signal) => {
      this.logger.warn(
        `Abandonment worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      );
      this.child = null;
      this.readyPromise = null;
      this.warmed = false;
      this.rejectAllPending('worker_crashed', 'Python worker process exited');
    });

    await this.readyPromise;
  }

  private async request(
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<AbandonmentWorkerResponse> {
    if (!this.child?.stdin) {
      return { ok: false, reason: 'worker_unavailable', error: 'Worker stdin unavailable' };
    }

    const id = randomUUID();
    const line = JSON.stringify({ id, ...body }) + '\n';

    const responsePromise = new Promise<AbandonmentWorkerResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, reason: 'timeout', error: `Worker request exceeded ${timeoutMs}ms` });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
    });

    try {
      this.child.stdin.write(line);
    } catch (error) {
      this.pending.delete(id);
      return {
        ok: false,
        reason: 'worker_unavailable',
        error: this.getErrorMessage(error),
      };
    }

    const response = await responsePromise;

    if (
      !response.ok &&
      (response.reason === 'worker_crashed' || response.reason === 'worker_unavailable') &&
      !this.restartAttemptedForProcess
    ) {
      this.restartAttemptedForProcess = true;
      this.logger.warn('Restarting abandonment worker once after failure…');
      try {
        await this.startWorker();
        return await this.request(body, timeoutMs);
      } catch (error) {
        return {
          ok: false,
          reason: 'worker_unavailable',
          error: this.getErrorMessage(error),
        };
      }
    }

    return response;
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = this.stdoutBuffer.indexOf('\n');
      if (!line) continue;
      this.dispatchLine(line);
    }
  }

  private dispatchLine(line: string): void {
    let parsed: { id?: string; ok?: boolean; result?: Record<string, unknown>; error?: string };
    try {
      parsed = JSON.parse(line) as typeof parsed;
    } catch {
      this.logger.warn(`Abandonment worker returned non-JSON stdout line: ${line.slice(0, 200)}`);
      return;
    }

    const id = parsed.id;
    if (!id) return;

    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (parsed.ok === true && parsed.result) {
      pending.resolve({ ok: true, result: parsed.result });
      return;
    }

    pending.resolve({
      ok: false,
      reason: 'invalid_response',
      error: parsed.error ?? 'Worker returned ok=false',
    });
  }

  private rejectAllPending(reason: AbandonmentWorkerFailureReason, error: string): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, reason, error });
      this.pending.delete(id);
    }
  }

  private stopChild(): void {
    if (!this.child) return;
    try {
      this.child.kill('SIGKILL');
    } catch {
      /* noop */
    }
    this.child = null;
    this.readyPromise = null;
  }

  private resolvePythonExecutable(): string {
    const envPython = process.env.PYTHON_EXECUTABLE?.trim();
    if (envPython) return envPython;
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private resolveWorkerScriptPath(): string {
    const envPath = process.env.ML_ABANDONMENT_WORKER_SCRIPT_PATH?.trim();
    if (envPath) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(this.workspaceRoot, envPath);
    }

    const candidates = [
      path.join(this.workspaceRoot, 'ml', 'abandonment_worker.py'),
      path.join(process.cwd(), 'ml', 'abandonment_worker.py'),
      path.join(process.cwd(), '..', 'ml', 'abandonment_worker.py'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return candidates[0];
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
