import { EventEmitter } from 'events';
import { FaqService } from './faq.service';
import { FaqEntryService } from './faq-entry.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';

describe('FaqService', () => {
  let service: FaqService;
  const faqEntryService = {
    ensureEmbeddingsForOrganization: jest.fn().mockResolvedValue(null),
    listActiveForOrganization: jest.fn().mockResolvedValue([]),
  } as unknown as FaqEntryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FaqService(faqEntryService);
  });

  it('should return empty results when org has no FAQ corpus for the requested pack', async () => {
    (faqEntryService.ensureEmbeddingsForOrganization as jest.Mock).mockResolvedValue(null);

    const result = await service.semanticSearch(
      {
        question: 'comment creer un compte',
        topK: 3,
        projectKey: 'test-11-v1',
      },
      'org-123',
    );

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(result.strategyStep).toBe('no_org_corpus');
    expect(result.results).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should return parsed semantic search response', async () => {
    (faqEntryService.ensureEmbeddingsForOrganization as jest.Mock).mockResolvedValue(
      '/tmp/faq_embeddings.json',
    );
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    (spawn as unknown as jest.Mock).mockReturnValue(child);

    const promise = service.semanticSearch({
      question: 'comment reinitialiser mon mot de passe',
      topK: 2,
      minSimilarity: 0.2,
    });

    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          success: true,
          query: 'comment reinitialiser mon mot de passe',
          total: 1,
          results: [
            {
              id: 'faq-003',
              question: 'Comment reinitialiser mon mot de passe ?',
              answer: 'Depuis la page de connexion.',
              category: 'auth',
              priority: 'high',
              score: 0.96,
            },
          ],
        }),
      ),
    );
    child.emit('close', 0);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.results[0].id).toBe('faq-003');
  });

  it('should prefer near-exact FAQ over a weak semantic neighbor', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (spawn as unknown as jest.Mock).mockReturnValue(child);

    const promise = service.semanticSearch({
      question: "Que signifie 'Total Book of Business' ?",
      topK: 5,
    });

    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          success: true,
          query: "Que signifie 'Total Book of Business' ?",
          total: 2,
          results: [
            {
              id: 'faq-pulse',
              question: 'Que représente le tableau de bord Portfolio Pulse ?',
              answer: 'Vue portefeuille.',
              category: 'portfolio',
              priority: 'medium',
              score: 0.32,
            },
            {
              id: 'faq-tbo',
              question: "Que signifie 'Total Book of Business' ?",
              answer: 'Valeur totale des revenus.',
              category: 'metrics',
              priority: 'medium',
              score: 0.28,
            },
          ],
        }),
      ),
    );
    child.emit('close', 0);

    const result = await promise;
    expect(result.results[0].id).toBe('faq-tbo');
    expect(result.results[0].score).toBeGreaterThanOrEqual(0.9);
    expect(result.strategyStep?.startsWith('threshold_')).toBe(true);
  });

  it('should return no_confident_match instead of a weak forced top-1', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (spawn as unknown as jest.Mock).mockReturnValue(child);

    const promise = service.semanticSearch({
      question: 'question sans rapport avec le corpus',
      topK: 5,
    });

    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          success: true,
          query: 'question sans rapport avec le corpus',
          total: 1,
          results: [
            {
              id: 'faq-unrelated',
              question: 'Que représente le tableau de bord Portfolio Pulse ?',
              answer: 'Vue portefeuille.',
              category: 'portfolio',
              priority: 'medium',
              score: 0.32,
            },
          ],
        }),
      ),
    );
    child.emit('close', 0);

    const result = await promise;
    expect(result.strategyStep).toBe('no_confident_match');
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('should recover near-exact FAQ from DB when missing from embedding top-K', async () => {
    (faqEntryService.ensureEmbeddingsForOrganization as jest.Mock).mockResolvedValue(
      '/tmp/faq_embeddings.json',
    );
    (faqEntryService.listActiveForOrganization as jest.Mock).mockResolvedValue([
      {
        id: 'faq-pulse',
        question: 'Que représente le tableau de bord Portfolio Pulse ?',
        answer: 'Vue portefeuille.',
        category: 'portfolio',
        tags: [],
      },
      {
        id: 'faq-tbo',
        question: 'Que signifie "Total Book of Business" ?',
        answer: 'Valeur totale des revenus.',
        category: 'metrics',
        tags: [],
      },
    ]);

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (spawn as unknown as jest.Mock).mockReturnValue(child);

    const promise = service.semanticSearch(
      {
        question: 'Que signifie "Total Book of Business" ?',
        topK: 5,
        projectKey: 'test-13-v1',
      },
      'org-123',
    );

    // ensureEmbeddings is awaited before spawn — flush microtasks first
    await Promise.resolve();
    await Promise.resolve();

    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          success: true,
          query: 'Que signifie "Total Book of Business" ?',
          total: 1,
          results: [
            {
              id: 'faq-pulse',
              question: 'Que représente le tableau de bord Portfolio Pulse ?',
              answer: 'Vue portefeuille.',
              category: 'portfolio',
              priority: 'medium',
              score: 0.32,
            },
          ],
        }),
      ),
    );
    child.emit('close', 0);

    const result = await promise;
    expect(result.results[0].id).toBe('faq-tbo');
    expect(result.results[0].score).toBeGreaterThanOrEqual(0.9);
    expect(result.strategyStep?.startsWith('threshold_')).toBe(true);
  });

  it('should reject when python process fails', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    (spawn as unknown as jest.Mock).mockReturnValue(child);

    const promise = service.semanticSearch({
      question: 'test',
    });

    child.stderr.emit('data', Buffer.from('script error'));
    child.emit('close', 1);

    await expect(promise).rejects.toThrow('Semantic search process exited with code 1');
  });
});
