import { Test, TestingModule } from '@nestjs/testing';
import { WindowTypesService } from './window-types.service';

describe('WindowTypesService', () => {
  let service: WindowTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WindowTypesService],
    }).compile();

    service = module.get<WindowTypesService>(WindowTypesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
