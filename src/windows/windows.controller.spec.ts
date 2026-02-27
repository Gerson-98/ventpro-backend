import { Test, TestingModule } from '@nestjs/testing';
import { WindowsController } from './windows.controller';
import { WindowsService } from './windows.service';

describe('WindowsController', () => {
  let controller: WindowsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WindowsController],
      providers: [WindowsService],
    }).compile();

    controller = module.get<WindowsController>(WindowsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
