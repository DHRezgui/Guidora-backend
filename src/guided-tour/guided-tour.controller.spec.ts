import { Test, TestingModule } from '@nestjs/testing';
import { GuidedTourController } from './guided-tour.controller';

describe('GuidedTourController', () => {
  let controller: GuidedTourController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuidedTourController],
    }).compile();

    controller = module.get<GuidedTourController>(GuidedTourController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
