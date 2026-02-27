import { Injectable } from '@nestjs/common';
import { CreateWindowTypDto } from './dto/create-window-typ.dto';
import { UpdateWindowTypDto } from './dto/update-window-typ.dto';

@Injectable()
export class WindowTypService {
  create(createWindowTypDto: CreateWindowTypDto) {
    return 'This action adds a new windowTyp';
  }

  findAll() {
    return `This action returns all windowTyp`;
  }

  findOne(id: number) {
    return `This action returns a #${id} windowTyp`;
  }

  update(id: number, updateWindowTypDto: UpdateWindowTypDto) {
    return `This action updates a #${id} windowTyp`;
  }

  remove(id: number) {
    return `This action removes a #${id} windowTyp`;
  }
}
