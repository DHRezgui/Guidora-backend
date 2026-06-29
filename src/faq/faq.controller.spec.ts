import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqEntryService } from './faq-entry.service';
import { FaqService } from './faq.service';

describe('FaqController', () => {
  let controller: FaqController;

  const faqService = {
    semanticSearch: jest.fn(),
  };

  const faqEntryService = {
    listForOrganization: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setActive: jest.fn(),
    remove: jest.fn(),
    rebuildEmbeddings: jest.fn(),
    listActiveForOrganization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqController],
      providers: [
        {
          provide: FaqService,
          useValue: faqService,
        },
        {
          provide: FaqEntryService,
          useValue: faqEntryService,
        },
      ],
    }).compile();

    controller = module.get<FaqController>(FaqController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return semantic search results scoped to organization', async () => {
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
      ],
    });

    const request = {
      question: 'comment reinitialiser mon mot de passe',
      topK: 2,
      minSimilarity: 0.2,
    };

    const user = { organizationId: 'org-123' };
    const result = await controller.semanticSearch(request, user);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(faqService.semanticSearch).toHaveBeenCalledWith(request, 'org-123');
  });
});
