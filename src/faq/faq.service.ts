import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import { SemanticSearchRequestDto, SemanticSearchResponseDto } from './dto/semantic-search.dto';

@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);
  private readonly pythonExecutable: string;
  private readonly semanticScriptPath: string;

  constructor() {
    const cwd = process.cwd();
    const workspaceRoot = path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;

    this.pythonExecutable =
      process.platform === 'win32'
        ? path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe')
        : path.join(workspaceRoot, '.venv', 'bin', 'python');

    this.semanticScriptPath = path.join(workspaceRoot, 'ml', 'rag', 'semantic_search.py');
  }

  async semanticSearch(request: SemanticSearchRequestDto): Promise<SemanticSearchResponseDto> {
    const topK = request.topK ?? 5;
    const minSimilarity = request.minSimilarity ?? 0.2;

    return this.executeSemanticSearch(request.question, topK, minSimilarity);
  }

  private async executeSemanticSearch(
    query: string,
    topK: number,
    minSimilarity: number,
  ): Promise<SemanticSearchResponseDto> {
    const child = spawn(this.pythonExecutable, [
      this.semanticScriptPath,
      query,
      '--top-k',
      topK.toString(),
      '--min-similarity',
      minSimilarity.toString(),
      '--json',
    ]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    return new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (stderr) {
          this.logger.debug(`Semantic search stderr: ${stderr}`);
        }

        if (code !== 0) {
          reject(new Error(`Semantic search process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as SemanticSearchResponseDto;
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Invalid semantic search response: ${(error as Error).message}`));
        }
      });
    });
  }
}
