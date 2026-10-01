import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientStatus } from '@prisma/client';
import { isGenericClientName } from '../common/client-name.util';

function assertRealClientName(name: string | undefined | null): void {
  if (!name || !name.trim()) {
    throw new BadRequestException('El nombre del cliente es obligatorio.');
  }
  if (isGenericClientName(name)) {
    throw new BadRequestException(
      `"${name}" no es un nombre de cliente válido — escribe el nombre real de la persona o empresa (llama al cliente si no lo tienes a mano).`,
    );
  }
}

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
    assertRealClientName(data.name);
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
    if (data.name !== undefined) assertRealClientName(data.name);
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
