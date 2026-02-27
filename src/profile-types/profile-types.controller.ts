import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProfileTypesService } from './profile-types.service';
import { CreateProfileTypeDto } from './dto/create-profile-type.dto';
import { UpdateProfileTypeDto } from './dto/update-profile-type.dto';

@Controller('profile-types')
export class ProfileTypesController {
  constructor(private readonly profileTypesService: ProfileTypesService) {}

  @Post()
  create(@Body() createProfileTypeDto: CreateProfileTypeDto) {
    return this.profileTypesService.create(createProfileTypeDto);
  }

  @Get()
  findAll() {
    return this.profileTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.profileTypesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProfileTypeDto: UpdateProfileTypeDto) {
    return this.profileTypesService.update(+id, updateProfileTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.profileTypesService.remove(+id);
  }
}
