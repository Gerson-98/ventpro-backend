import { Test, TestingModule } from '@nestjs/testing';
import { WindowsService } from './windows.service';

describe('WindowsService', () => {
  let service: WindowsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WindowsService],
    }).compile();

    service = module.get<WindowsService>(WindowsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
