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
  } as unknown as FaqEntryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FaqService(faqEntryService);
  });

  it('should return parsed semantic search response', async () => {
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
