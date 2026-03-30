import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SemanticSearchRequestDto, SemanticSearchResponseDto } from './dto/semantic-search.dto';

@Injectable()
export class FaqService {
	private readonly logger = new Logger(FaqService.name);
	private readonly workspaceRoot: string;
	private readonly pythonExecutable: string;
	private readonly semanticScriptPath: string;
	private readonly pythonTimeoutMs: number;
	private readonly strictMinSimilarity: number;
	private readonly enforceStrictFiltering: boolean;

	constructor() {
		const cwd = process.cwd();
		this.workspaceRoot = path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
		this.pythonTimeoutMs = Number(process.env.FAQ_PYTHON_TIMEOUT_MS ?? 600000);
		this.strictMinSimilarity = Number(process.env.FAQ_STRICT_MIN_SIMILARITY ?? 0.7);
		this.enforceStrictFiltering = (process.env.FAQ_ENFORCE_STRICT ?? 'true').toLowerCase() === 'true';
		this.pythonExecutable = this.resolvePythonExecutable();
		this.semanticScriptPath = this.resolveSemanticScriptPath();
	}

	async semanticSearch(request: SemanticSearchRequestDto): Promise<SemanticSearchResponseDto> {
		const topK = request.topK ?? 5;
		const requestedMinSimilarity = request.minSimilarity ?? this.strictMinSimilarity;
		const minSimilarity = this.enforceStrictFiltering
			? Math.max(requestedMinSimilarity, this.strictMinSimilarity)
			: requestedMinSimilarity;

		if (requestedMinSimilarity !== minSimilarity) {
			this.logger.log(
				`Strict FAQ filter applied: requested minSimilarity=${requestedMinSimilarity}, effective=${minSimilarity}`,
			);
		}

		if (!fs.existsSync(this.semanticScriptPath)) {
			throw new InternalServerErrorException(
				`Semantic search script not found at ${this.semanticScriptPath}`,
			);
		}

		return this.executeSemanticSearch(request.question, topK, minSimilarity);
	}

	private resolvePythonExecutable(): string {
		const envPython = process.env.PYTHON_EXECUTABLE;
		if (envPython?.trim()) {
			return envPython.trim();
		}

		const windowsVenvPython = path.join(this.workspaceRoot, '.venv', 'Scripts', 'python.exe');
		if (process.platform === 'win32' && fs.existsSync(windowsVenvPython)) {
			return windowsVenvPython;
		}

		const unixVenvPython = path.join(this.workspaceRoot, '.venv', 'bin', 'python');
		if (process.platform !== 'win32' && fs.existsSync(unixVenvPython)) {
			return unixVenvPython;
		}

		if (process.platform !== 'win32') {
			return 'python3';
		}

		return 'python';
	}

	private resolveSemanticScriptPath(): string {
		const envScriptPath = process.env.SEMANTIC_SCRIPT_PATH;
		if (envScriptPath?.trim()) {
			return envScriptPath.trim();
		}

		const candidates = [
			path.join(this.workspaceRoot, 'ml', 'rag', 'semantic_search.py'),
			path.join(process.cwd(), 'ml', 'rag', 'semantic_search.py'),
			path.join(process.cwd(), '..', 'ml', 'rag', 'semantic_search.py'),
		];

		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}

		return candidates[0];
	}

	private extractJsonPayload(rawOutput: string): SemanticSearchResponseDto {
		const direct = rawOutput.trim();
		if (direct) {
			try {
				return JSON.parse(direct) as SemanticSearchResponseDto;
			} catch {
				// Continue with tolerant parsing for mixed stdout.
			}
		}

		const lines = rawOutput
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.startsWith('{') && line.endsWith('}'));

		for (let idx = lines.length - 1; idx >= 0; idx--) {
			try {
				return JSON.parse(lines[idx]) as SemanticSearchResponseDto;
			} catch {
				// Ignore invalid json line and continue.
			}
		}

		throw new Error('Unable to parse semantic-search JSON output');
	}

	private async executeSemanticSearch(
		query: string,
		topK: number,
		minSimilarity: number,
	): Promise<SemanticSearchResponseDto> {
		const scriptCwd = path.join(this.workspaceRoot, 'ml');

		return new Promise((resolve, reject) => {
			const child = spawn(
				this.pythonExecutable,
				[
					this.semanticScriptPath,
					query,
					'--top-k',
					topK.toString(),
					'--min-similarity',
					minSimilarity.toString(),
					'--json',
				],
				{
					cwd: scriptCwd,
					env: {
						...process.env,
						PYTHONUTF8: '1',
						PYTHONIOENCODING: 'utf-8',
					},
				},
			);

			let stdout = '';
			let stderr = '';
			let settled = false;

			const timeoutHandle = setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				child.kill();
				reject(
					new InternalServerErrorException(
						`Semantic search timed out after ${this.pythonTimeoutMs}ms`,
					),
				);
			}, this.pythonTimeoutMs);

			child.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('error', (error) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeoutHandle);
				reject(
					new InternalServerErrorException(
						`Failed to start semantic search process: ${error.message}`,
					),
				);
			});

			child.on('close', (code) => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeoutHandle);

				if (stderr.trim()) {
					this.logger.warn(`Semantic search stderr: ${stderr.trim()}`);
				}

				if (code !== 0) {
					reject(
						new InternalServerErrorException(
							`Semantic search process exited with code ${code}`,
						),
					);
					return;
				}

				try {
					const parsed = this.extractJsonPayload(stdout);
					resolve(parsed);
				} catch (error) {
					reject(
						new InternalServerErrorException(
							`Invalid semantic search response: ${(error as Error).message}`,
						),
					);
				}
			});
		});
	}
}
