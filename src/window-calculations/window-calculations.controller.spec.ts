import { Test, TestingModule } from '@nestjs/testing';
import { WindowCalculationsController } from './window-calculations.controller';
import { WindowCalculationsService } from './window-calculations.service';

describe('WindowCalculationsController', () => {
  let controller: WindowCalculationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WindowCalculationsController],
      providers: [WindowCalculationsService],
    }).compile();

    controller = module.get<WindowCalculationsController>(WindowCalculationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
