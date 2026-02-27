import { Injectable } from '@nestjs/common';
import { CreateProfileTypeDto } from './dto/create-profile-type.dto';
import { UpdateProfileTypeDto } from './dto/update-profile-type.dto';

@Injectable()
export class ProfileTypesService {
  create(createProfileTypeDto: CreateProfileTypeDto) {
    return 'This action adds a new profileType';
  }

  findAll() {
    return `This action returns all profileTypes`;
  }

  findOne(id: number) {
    return `This action returns a #${id} profileType`;
  }

  update(id: number, updateProfileTypeDto: UpdateProfileTypeDto) {
    return `This action updates a #${id} profileType`;
  }

  remove(id: number) {
    return `This action removes a #${id} profileType`;
  }
}
