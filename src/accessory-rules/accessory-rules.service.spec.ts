import { Test, TestingModule } from '@nestjs/testing';
import { AccessoryRulesService } from './accessory-rules.service';

describe('AccessoryRulesService', () => {
  let service: AccessoryRulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccessoryRulesService],
    }).compile();

    service = module.get<AccessoryRulesService>(AccessoryRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
