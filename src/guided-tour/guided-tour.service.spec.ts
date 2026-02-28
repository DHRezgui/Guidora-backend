import { Test, TestingModule } from '@nestjs/testing';
import { GuidedTourService } from './guided-tour.service';

describe('GuidedTourService', () => {
  let service: GuidedTourService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuidedTourService],
    }).compile();

    service = module.get<GuidedTourService>(GuidedTourService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
