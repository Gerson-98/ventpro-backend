import { Test, TestingModule } from '@nestjs/testing';
import { WindowTypController } from './window-typ.controller';
import { WindowTypService } from './window-typ.service';

describe('WindowTypController', () => {
  let controller: WindowTypController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WindowTypController],
      providers: [WindowTypService],
    }).compile();

    controller = module.get<WindowTypController>(WindowTypController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
