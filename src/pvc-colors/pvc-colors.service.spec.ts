import { Test, TestingModule } from '@nestjs/testing';
import { PvcColorsService } from './pvc-colors.service';

describe('PvcColorsService', () => {
  let service: PvcColorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PvcColorsService],
    }).compile();

    service = module.get<PvcColorsService>(PvcColorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
