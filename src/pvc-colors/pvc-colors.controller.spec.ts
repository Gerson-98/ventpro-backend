import { Test, TestingModule } from '@nestjs/testing';
import { PvcColorsController } from './pvc-colors.controller';
import { PvcColorsService } from './pvc-colors.service';

describe('PvcColorsController', () => {
  let controller: PvcColorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PvcColorsController],
      providers: [PvcColorsService],
    }).compile();

    controller = module.get<PvcColorsController>(PvcColorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
