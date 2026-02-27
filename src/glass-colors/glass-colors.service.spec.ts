import { Test, TestingModule } from '@nestjs/testing';
import { GlassColorsService } from './glass-colors.service';

describe('GlassColorsService', () => {
  let service: GlassColorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlassColorsService],
    }).compile();

    service = module.get<GlassColorsService>(GlassColorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
