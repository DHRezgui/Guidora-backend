import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';

describe('FaqController', () => {
  let controller: FaqController;

  const faqService = {
    semanticSearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqController],
      providers: [
        {
          provide: FaqService,
          useValue: faqService,
        },
      ],
    }).compile();

    controller = module.get<FaqController>(FaqController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return semantic search results', async () => {
    faqService.semanticSearch.mockResolvedValue({
      success: true,
      query: 'comment reinitialiser mon mot de passe',
      total: 2,
      results: [
        {
          id: 'faq-003',
          question: 'Comment reinitialiser mon mot de passe ?',
          answer: "Depuis l'ecran de connexion, cliquez sur Mot de passe oublie.",
          category: 'auth',
          priority: 'high',
          score: 0.96,
        },
        {
          id: 'faq-006',
          question: 'Comment changer mon mot de passe apres connexion ?',
          answer: 'Accedez a votre profil utilisateur pour le modifier.',
          category: 'auth',
          priority: 'high',
          score: 0.72,
        },
      ],
    });

    const request = {
      question: 'comment reinitialiser mon mot de passe',
      topK: 2,
      minSimilarity: 0.2,
    };

    const result = await controller.semanticSearch(request);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.results[0].id).toBe('faq-003');
    expect(faqService.semanticSearch).toHaveBeenCalledWith(request);
  });
});
