import { Test, TestingModule } from '@nestjs/testing';
import { AccessoryRulesController } from './accessory-rules.controller';
import { AccessoryRulesService } from './accessory-rules.service';

describe('AccessoryRulesController', () => {
  let controller: AccessoryRulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessoryRulesController],
      providers: [AccessoryRulesService],
    }).compile();

    controller = module.get<AccessoryRulesController>(AccessoryRulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
