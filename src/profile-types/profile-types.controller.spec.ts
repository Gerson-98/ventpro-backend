import { Test, TestingModule } from '@nestjs/testing';
import { ProfileTypesController } from './profile-types.controller';
import { ProfileTypesService } from './profile-types.service';

describe('ProfileTypesController', () => {
  let controller: ProfileTypesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileTypesController],
      providers: [ProfileTypesService],
    }).compile();

    controller = module.get<ProfileTypesController>(ProfileTypesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
