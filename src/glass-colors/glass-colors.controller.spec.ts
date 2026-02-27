import { Test, TestingModule } from '@nestjs/testing';
import { GlassColorsController } from './glass-colors.controller';
import { GlassColorsService } from './glass-colors.service';

describe('GlassColorsController', () => {
  let controller: GlassColorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GlassColorsController],
      providers: [GlassColorsService],
    }).compile();

    controller = module.get<GlassColorsController>(GlassColorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
