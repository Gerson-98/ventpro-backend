import { Test, TestingModule } from '@nestjs/testing';
import { WindowTypesController } from './window-types.controller';
import { WindowTypesService } from './window-types.service';

describe('WindowTypesController', () => {
  let controller: WindowTypesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WindowTypesController],
      providers: [WindowTypesService],
    }).compile();

    controller = module.get<WindowTypesController>(WindowTypesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
