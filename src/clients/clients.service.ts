import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientStatus } from '@prisma/client';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  create(data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    status?: ClientStatus;
  }) {
    return this.prisma.client.create({ data });
  }

  findAll() {
    return this.prisma.client.findMany({
      include: { orders: true },
      orderBy: { name: 'asc' }, // Ordenamos alfabéticamente
    });
  }

  findOne(id: number) {
    return this.prisma.client.findUnique({
      where: { id },
      include: { orders: true },
    });
  }

  update(
    id: number,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      status?: ClientStatus; // ✨ Permite actualizar el estado
    },
  ) {
    return this.prisma.client.update({
      where: { id },
      data,
    });
  }

  updateStatus(id: number, status: ClientStatus) {
    return this.prisma.client.update({
      where: { id },
      data: { status },
    });
  }

  remove(id: number) {
    return this.prisma.client.delete({ where: { id } });
  }
}
