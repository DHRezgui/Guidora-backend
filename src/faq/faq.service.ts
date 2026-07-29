import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SemanticSearchRequestDto, SemanticSearchResponseDto, SemanticSearchResultDto } from './dto/semantic-search.dto';
import { FaqEntryService } from './faq-entry.service';
import {
	DEFAULT_FAQ_FALLBACK_MIN_SCORE,
	applyAdaptiveFaqStrategy,
	applyLexicalBoostToResults,
	mergeNearExactCorpusHits,
} from './faq-search-ranking';

@Injectable()
export class FaqService {
	private readonly logger = new Logger(FaqService.name);
	private readonly workspaceRoot: string;
	private readonly pythonExecutable: string;
	private readonly semanticScriptPath: string;
	private readonly pythonTimeoutMs: number;
	private readonly adaptiveThresholds: number[];
	private readonly fallbackMinScore: number;
	private readonly lexicalBoostEnabled: boolean;

	constructor(private readonly faqEntryService: FaqEntryService) {
		const cwd = process.cwd();
		this.workspaceRoot = path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
		this.pythonTimeoutMs = Number(process.env.FAQ_PYTHON_TIMEOUT_MS ?? 600000);
		this.adaptiveThresholds = this.parseAdaptiveThresholds(
			process.env.FAQ_ADAPTIVE_THRESHOLDS ?? '0.7,0.65,0.6',
		);
		this.fallbackMinScore = this.parseFallbackMinScore(
			process.env.FAQ_FALLBACK_MIN_SCORE ?? String(DEFAULT_FAQ_FALLBACK_MIN_SCORE),
		);
		this.lexicalBoostEnabled = process.env.FAQ_LEXICAL_BOOST !== 'false';
		this.pythonExecutable = this.resolvePythonExecutable();
		this.semanticScriptPath = this.resolveSemanticScriptPath();
	}

	async semanticSearch(
		request: SemanticSearchRequestDto,
		organizationId?: string,
	): Promise<SemanticSearchResponseDto> {
		const topK = request.topK ?? 5;
		const requestedMinSimilarity = request.minSimilarity;

		if (!fs.existsSync(this.semanticScriptPath)) {
			throw new InternalServerErrorException(
				`Semantic search script not found at ${this.semanticScriptPath}`,
			);
		}

		let orgEmbeddingsPath: string | null = null;
		if (organizationId) {
			orgEmbeddingsPath = await this.faqEntryService.ensureEmbeddingsForOrganization(
				organizationId,
				request.projectKey,
			);
			if (!orgEmbeddingsPath) {
				return {
					success: true,
					query: request.question,
					total: 0,
					strategyStep: 'no_org_corpus',
					results: [],
				};
			}
		}

		const rawResponse = await this.executeSemanticSearch(
			request.question,
			Math.max(1, topK),
			-1,
			orgEmbeddingsPath,
		);

		if (!rawResponse.results?.length && !organizationId) {
			return {
				...rawResponse,
				strategyStep: 'no_results',
			};
		}

		let candidateResults: SemanticSearchResultDto[] = [...(rawResponse.results ?? [])];

		if (this.lexicalBoostEnabled && organizationId) {
			const activeItems = await this.faqEntryService.listActiveForOrganization(
				organizationId,
				request.projectKey,
			);
			candidateResults = mergeNearExactCorpusHits(
				candidateResults,
				activeItems.map((item) => ({
					id: item.id,
					question: item.question,
					answer: item.answer,
					category: item.category,
					priority: this.extractPriorityLabel(item.tags),
				})),
				request.question,
			) as SemanticSearchResultDto[];
		}

		if (!candidateResults.length) {
			return {
				success: true,
				query: rawResponse.query ?? request.question,
				total: 0,
				strategyStep: 'no_results',
				results: [],
			};
		}

		const ranked: SemanticSearchResultDto[] = this.lexicalBoostEnabled
			? applyLexicalBoostToResults(candidateResults, request.question)
			: [...candidateResults].sort((a, b) => b.score - a.score);

		const thresholds = this.getEffectiveThresholds(requestedMinSimilarity);
		const strategy = applyAdaptiveFaqStrategy({
			results: ranked,
			thresholds,
			topK,
			fallbackMinScore: this.fallbackMinScore,
			allowFallbackTop1: true,
		});

		this.logger.log(
			`FAQ strategy=${strategy.strategyStep} total=${strategy.total} lexicalBoost=${this.lexicalBoostEnabled}`,
		);

		return {
			success: rawResponse.success ?? true,
			query: rawResponse.query ?? request.question,
			total: strategy.total,
			strategyStep: strategy.strategyStep,
			results: strategy.results,
		};
	}

	private extractPriorityLabel(tags?: string[] | null): string {
		const priorityTag = (tags ?? []).find((tag) => tag.startsWith('priority:'));
		if (!priorityTag) return 'medium';
		const value = priorityTag.slice('priority:'.length).trim();
		return value || 'medium';
	}

	private parseFallbackMinScore(value: string): number {
		const num = Number(value);
		if (!Number.isFinite(num)) return DEFAULT_FAQ_FALLBACK_MIN_SCORE;
		return Math.max(0, Math.min(1, num));
	}

	private parseAdaptiveThresholds(value: string): number[] {
		const parsed = value
			.split(',')
			.map((token) => Number(token.trim()))
			.filter((num) => Number.isFinite(num))
			.filter((num) => num >= 0 && num <= 1)
			.sort((a, b) => b - a);

		if (parsed.length > 0) {
			return parsed;
		}

		return [0.7, 0.65, 0.6];
	}

	private getEffectiveThresholds(requestedMinSimilarity?: number): number[] {
		if (requestedMinSimilarity === undefined || Number.isNaN(requestedMinSimilarity)) {
			return this.adaptiveThresholds;
		}

		const clampedRequested = Math.max(0, Math.min(1, requestedMinSimilarity));
		const merged = [clampedRequested, ...this.adaptiveThresholds];
		return [...new Set(merged)].sort((a, b) => b - a);
	}

	private resolvePythonExecutable(): string {
		const envPython = process.env.PYTHON_EXECUTABLE;
		if (envPython?.trim()) {
			return envPython.trim();
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
		embeddingsPath?: string | null,
	): Promise<SemanticSearchResponseDto> {
		const scriptCwd = path.join(this.workspaceRoot, 'ml');
		const args = [
			this.semanticScriptPath,
			query,
			'--top-k',
			topK.toString(),
			'--min-similarity',
			minSimilarity.toString(),
			'--json',
		];

		if (embeddingsPath) {
			args.push('--embeddings', embeddingsPath);
		}

		return new Promise((resolve, reject) => {
			const child = spawn(
				this.pythonExecutable,
				args,
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
