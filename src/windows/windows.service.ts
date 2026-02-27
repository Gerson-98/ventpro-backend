import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowsService {
  constructor(private prisma: PrismaService) {}

  private async recalculateOrderTotal(orderId: number) {
    // CAMBIO: orders -> order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { windows: true },
    });
    if (order) {
      const newTotal = order.windows.reduce((sum, w) => {
        return sum + (Number(w.price) || 0) * (Number(w.quantity) || 1);
      }, 0);
      // CAMBIO: orders -> order
      await this.prisma.order.update({
        where: { id: orderId },
        data: { total: newTotal },
      });
    }
  }

  async findAll() {
    // CAMBIO: windows -> window, window_type -> windowType, clients -> client
    return this.prisma.window.findMany({
      include: {
        windowType: true,
        pvcColor: true,
        glassColor: true,
        order: { include: { client: true } },
      },
    });
  }

  async findOne(id: number) {
    // CAMBIO: windows -> window, window_type -> windowType, clients -> client
    return this.prisma.window.findUnique({
      where: { id },
      include: {
        windowType: true,
        pvcColor: true,
        glassColor: true,
        order: { include: { client: true } },
      },
    });
  }

  async create(data: any) {
    const {
      order_id,
      window_type_id,
      width_cm,
      height_cm,
      color_id,
      glass_color_id,
      options,
      price,
      displayName,
    } = data;

    const { hojaAncho, hojaAlto, vidrioAncho, vidrioAlto } =
      await this.calculateWindowMeasurements(
        Number(window_type_id),
        Number(width_cm),
        Number(height_cm),
        options,
      );

    const createData: any = {
      displayName,
      options: options || {},
      width_cm: Number(width_cm),
      height_cm: Number(height_cm),
      price: Number(price || 0),
      hojaAncho,
      hojaAlto,
      vidrioAncho,
      vidrioAlto,
      order: { connect: { id: Number(order_id) } },
      // CAMBIO: window_type -> windowType
      windowType: { connect: { id: Number(window_type_id) } },
      pvcColor: { connect: { id: Number(color_id) } },
    };

    if (glass_color_id) {
      createData.glassColor = { connect: { id: Number(glass_color_id) } };
    }

    // CAMBIO: windows -> window, clients -> client
    const newWindow = await this.prisma.window.create({
      data: createData,
      include: {
        order: { include: { client: true } },
        windowType: true,
        pvcColor: true,
        glassColor: true,
      },
    });

    await this.recalculateOrderTotal(Number(order_id));
    return newWindow;
  }

  async updateWindow(id: number, data: any) {
    // CAMBIO: windows -> window
    const existing = await this.prisma.window.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(`No se encontró la ventana con id ${id}`);

    const windowTypeId = data.window_type_id
      ? Number(data.window_type_id)
      : existing.window_type_id;
    if (!windowTypeId)
      throw new BadRequestException('El tipo de ventana es requerido.');

    const width =
      data.width_cm !== undefined ? Number(data.width_cm) : existing.width_cm;
    const height =
      data.height_cm !== undefined
        ? Number(data.height_cm)
        : existing.height_cm;
    const options =
      data.options !== undefined ? data.options : existing.options;
    const quantity =
      data.quantity !== undefined ? Number(data.quantity) : existing.quantity;

    let price = existing.price;

    if (
      data.width_cm ||
      data.height_cm ||
      data.window_type_id ||
      data.options
    ) {
      // CAMBIO: window_types -> windowType
      const windowType = await this.prisma.windowType.findUnique({
        where: { id: windowTypeId },
      });
      if (windowType) {
        const areaM2 = (width * height) / 10000;
        const basePrice =
          (windowType as any).base_price || (windowType as any).price || 0;
        if (basePrice > 0) price = areaM2 * basePrice;
      }
    }

    if (data.price !== undefined && Number(data.price) > 0)
      price = Number(data.price);

    const { hojaAncho, hojaAlto, vidrioAncho, vidrioAlto } =
      await this.calculateWindowMeasurements(
        windowTypeId,
        width,
        height,
        options,
      );

    const updateData: any = {
      displayName:
        data.displayName !== undefined
          ? data.displayName
          : existing.displayName,
      options,
      width_cm: width,
      height_cm: height,
      price,
      hojaAncho,
      hojaAlto,
      vidrioAncho,
      vidrioAlto,
      quantity,
    };

    if (data.design_image_url !== undefined)
      updateData.design_image_url = data.design_image_url;
    // CAMBIO: window_type -> windowType
    if (data.window_type_id)
      updateData.windowType = { connect: { id: windowTypeId } };
    if (data.color_id)
      updateData.pvcColor = { connect: { id: Number(data.color_id) } };
    if (data.glass_color_id) {
      updateData.glassColor = { connect: { id: Number(data.glass_color_id) } };
    } else if (
      data.hasOwnProperty('glass_color_id') &&
      data.glass_color_id === null
    ) {
      updateData.glassColor = { disconnect: true };
    }

    // CAMBIO: windows -> window
    const updated = await this.prisma.window.update({
      where: { id },
      data: updateData,
      include: { order: true, windowType: true },
    });

    if (updated.order_id) await this.recalculateOrderTotal(updated.order_id);
    return updated;
  }

  async duplicateWindow(id: number) {
    // CAMBIO: windows -> window
    const original = await this.prisma.window.findUnique({ where: { id } });
    if (!original)
      throw new NotFoundException(`Ventana con ID #${id} no encontrada.`);
    if (!original.order_id || !original.window_type_id || !original.color_id) {
      throw new BadRequestException(
        'La ventana original no puede ser duplicada porque le faltan relaciones clave.',
      );
    }

    // CAMBIO: windows -> window, window_type -> windowType, clients -> client
    const duplicated = await this.prisma.window.create({
      data: {
        displayName: original.displayName,
        options: original.options || {},
        quantity: original.quantity,
        width_cm: original.width_cm,
        height_cm: original.height_cm,
        price: original.price,
        hojaAncho: original.hojaAncho,
        hojaAlto: original.hojaAlto,
        vidrioAncho: original.vidrioAncho,
        vidrioAlto: original.vidrioAlto,
        design_image_url: original.design_image_url,
        order: { connect: { id: original.order_id } },
        windowType: { connect: { id: original.window_type_id } },
        pvcColor: { connect: { id: original.color_id } },
        ...(original.glass_color_id && {
          glassColor: { connect: { id: original.glass_color_id } },
        }),
      },
      include: { windowType: true, pvcColor: true, glassColor: true },
    });

    await this.recalculateOrderTotal(original.order_id);
    return duplicated;
  }

  async remove(id: number) {
    // CAMBIO: windows -> window
    const existing = await this.prisma.window.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ventana no encontrada');

    const deleted = await this.prisma.window.delete({ where: { id } });
    if (existing.order_id) await this.recalculateOrderTotal(existing.order_id);
    return deleted;
  }

  async calculateWindowMeasurements(
    windowTypeId: number,
    width: number,
    height: number,
    options: any = {},
  ) {
    // CAMBIO: window_calculations -> windowCalculation
    const calcParams = await this.prisma.windowCalculation.findUnique({
      where: { window_type_id: windowTypeId },
    });

    if (!calcParams)
      return {
        hojaAncho: width,
        hojaAlto: height,
        vidrioAncho: width,
        vidrioAlto: height,
      };

    let hojaMargen = calcParams.hojaMargen;
    let hojaDescuento = calcParams.hojaDescuento;
    let vidrioDescuento = calcParams.vidrioDescuento;
    let hojaDivision = calcParams.hojaDivision;

    if (options && calcParams.calculationOverrides) {
      const overrides = calcParams.calculationOverrides as any;
      const optionKey = Object.keys(options).find(
        (key) => overrides[options[key]],
      );
      if (optionKey) {
        const overrideRules = overrides[options[optionKey]];
        hojaMargen = overrideRules.hojaMargen ?? hojaMargen;
        hojaDescuento = overrideRules.hojaDescuento ?? hojaDescuento;
        vidrioDescuento = overrideRules.vidrioDescuento ?? vidrioDescuento;
        hojaDivision = overrideRules.hojaDivision ?? hojaDivision;
      }
    }

    let hojaAncho: number;
    switch (hojaDivision) {
      case 'Mitad':
        hojaAncho = (width + hojaMargen) / 2;
        break;
      case 'Tercios':
        hojaAncho = (width + hojaMargen) / 3;
        break;
      case 'Cuartos':
        hojaAncho = (width + hojaMargen) / 4;
        break;
      default:
        hojaAncho = width + hojaMargen;
        break;
    }

    const hojaAlto = height - hojaDescuento;
    const vidrioAncho = hojaAncho - vidrioDescuento;
    const vidrioAlto = hojaAlto - vidrioDescuento;

    return {
      hojaAncho: Number(hojaAncho.toFixed(1)),
      hojaAlto: Number(hojaAlto.toFixed(1)),
      vidrioAncho: Number(vidrioAncho.toFixed(1)),
      vidrioAlto: Number(vidrioAlto.toFixed(1)),
    };
  }
}
