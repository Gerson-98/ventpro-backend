import { Test, TestingModule } from '@nestjs/testing';
import { WindowCalculationsService } from './window-calculations.service';

describe('WindowCalculationsService', () => {
  let service: WindowCalculationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WindowCalculationsService],
    }).compile();

    service = module.get<WindowCalculationsService>(WindowCalculationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
