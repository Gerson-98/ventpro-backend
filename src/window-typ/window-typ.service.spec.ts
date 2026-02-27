import { Test, TestingModule } from '@nestjs/testing';
import { WindowTypService } from './window-typ.service';

describe('WindowTypService', () => {
  let service: WindowTypService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WindowTypService],
    }).compile();

    service = module.get<WindowTypService>(WindowTypService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
