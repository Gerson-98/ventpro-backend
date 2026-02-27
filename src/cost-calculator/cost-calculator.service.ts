import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WindowCostInput {
  window_type_id: number;
  width_cm: number;
  height_cm: number;
  color_id: number;
  glass_color_id?: number;
  options?: Record<string, string>;
  quantity?: number;
}

interface MaterialCostLine {
  material_id: number;
  nombre: string;
  tipo: string;
  cantidad: number;
  precio_unitario: number;
  costo_total: number;
  unidad: string;
}

export interface WindowCostResult {
  costo_perfiles: number;
  costo_vidrio: number;
  costo_accesorios: number;
  costo_total: number;
  precio_sugerido_minimo: number;
  detalle: MaterialCostLine[];
}

// ✅ AGREGA ESTA INTERFAZ:
export interface QuotationCostResult {
  costo_total_proyecto: number;
  precio_sugerido_minimo: number;
  por_ventana: WindowCostResult[];
}

const LARGO_BARRA_CM = 580;
const PLANCHA_VIDRIO_CM2 = 35310;
const MARGEN_MINIMO = 0.4;

@Injectable()
export class CostCalculatorService {
  constructor(private prisma: PrismaService) {}

  async calcularCostoVentana(
    input: WindowCostInput,
  ): Promise<WindowCostResult> {
    // ... todo tu código de calcularCostoVentana se queda exactamente igual ...
    const {
      window_type_id,
      width_cm,
      height_cm,
      color_id,
      options = {},
      quantity = 1,
    } = input;

    const pvcColor = await this.prisma.pvcColor.findUnique({
      where: { id: color_id },
    });
    const esBlanco = pvcColor
      ? pvcColor.name.toUpperCase().includes('BLANCO')
      : false;

    const windowType = await this.prisma.windowType.findUnique({
      where: { id: window_type_id },
    });

    if (!windowType)
      throw new Error(`Tipo de ventana ${window_type_id} no encontrado`);

    const catalogo = await this.prisma.catalogoPerfiles.findFirst({
      where: { window_type_id: windowType.id },
      include: {
        perfilMarco: true,
        perfilHoja: true,
        perfilMosquitero: true,
        perfilBatiente: true,
        perfilTapajamba: true,
      },
    });

    const calcParams = await this.prisma.windowCalculation.findUnique({
      where: { window_type_id },
    });

    const { hojaAncho, hojaAlto } = this.calcularMedidasHoja(
      width_cm,
      height_cm,
      calcParams,
      options,
    );

    const detalle: MaterialCostLine[] = [];

    if (catalogo) {
      const perfiles = [
        {
          perfil: catalogo.perfilMarco,
          regla: catalogo.regla_marco,
          usaHoja: false,
          label: 'MARCO',
        },
        {
          perfil: catalogo.perfilHoja,
          regla: catalogo.regla_hoja,
          usaHoja: true,
          label: 'HOJA',
        },
        {
          perfil: catalogo.perfilMosquitero,
          regla: catalogo.regla_mosquitero,
          usaHoja: true,
          label: 'MOSQUITERO',
        },
        {
          perfil: catalogo.perfilBatiente,
          regla: catalogo.regla_batiente,
          usaHoja: true,
          label: 'BATIENTE',
        },
        {
          perfil: catalogo.perfilTapajamba,
          regla: catalogo.regla_tapajamba,
          usaHoja: false,
          label: 'TAPAJAMBA',
        },
      ];

      for (const { perfil, regla, usaHoja, label } of perfiles) {
        if (!perfil || !regla) continue;

        const ancho = usaHoja ? hojaAncho : width_cm;
        const alto = usaHoja ? hojaAlto : height_cm;

        const metrosTotales = this.aplicarRegla(regla, ancho, alto);
        const barras = metrosTotales / LARGO_BARRA_CM;

        const precio = esBlanco
          ? (perfil.price_white ?? 0)
          : (perfil.price_color ?? perfil.price_white ?? 0);

        const barrasEnteras = Math.ceil(barras * quantity);
        const costoLinea = barrasEnteras * precio;

        detalle.push({
          material_id: perfil.id,
          nombre: perfil.name,
          tipo: label,
          cantidad: barrasEnteras,
          precio_unitario: precio,
          costo_total: costoLinea,
          unidad: 'barras',
        });
      }

      // Costo de vidrio
      if (
        catalogo.cant_vidrios &&
        catalogo.cant_vidrios > 0 &&
        input.glass_color_id
      ) {
        const glassColor = await this.prisma.glassColor.findUnique({
          where: { id: input.glass_color_id },
          include: { material: true },
        });

        if (glassColor?.material) {
          const materialVidrio = glassColor.material;
          const areaVidrioCm2 = hojaAncho * hojaAlto * catalogo.cant_vidrios;
          const planchasEnteras = Math.ceil(
            (areaVidrioCm2 / PLANCHA_VIDRIO_CM2) * quantity,
          );

          const precioVidrio = esBlanco
            ? (materialVidrio.price_white ?? materialVidrio.price_color ?? 0)
            : (materialVidrio.price_color ?? materialVidrio.price_white ?? 0);

          detalle.push({
            material_id: materialVidrio.id,
            nombre: materialVidrio.name,
            tipo: 'VIDRIO',
            cantidad: planchasEnteras,
            precio_unitario: precioVidrio,
            costo_total: planchasEnteras * precioVidrio,
            unidad: 'planchas',
          });
        }
      }
    }

    await this.calcularAccesorios(
      window_type_id,
      options,
      esBlanco,
      quantity,
      detalle,
    );

    const costo_perfiles = detalle
      .filter((d) =>
        ['MARCO', 'HOJA', 'MOSQUITERO', 'BATIENTE', 'TAPAJAMBA'].includes(
          d.tipo,
        ),
      )
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_vidrio = detalle
      .filter((d) => d.tipo === 'VIDRIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_accesorios = detalle
      .filter((d) => d.tipo === 'ACCESORIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_total = costo_perfiles + costo_vidrio + costo_accesorios;

    return {
      costo_perfiles,
      costo_vidrio,
      costo_accesorios,
      costo_total,
      precio_sugerido_minimo: costo_total / MARGEN_MINIMO,
      detalle,
    };
  }

  private aplicarRegla(regla: string, ancho: number, alto: number): number {
    const r = regla.toUpperCase().trim();
    const multiplicador = this.extraerMultiplicador(r);
    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO'))
      return ancho + alto * multiplicador;
    if (r.includes('SUMAR ANCHO Y ALTO')) return (ancho + alto) * multiplicador;
    if (r.includes('SUMAR ALTO')) return alto * multiplicador;
    return (ancho + alto) * multiplicador;
  }

  private extraerMultiplicador(regla: string): number {
    const match = regla.match(/\*\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  private calcularMedidasHoja(
    width: number,
    height: number,
    calcParams: any,
    options: Record<string, string>,
  ): { hojaAncho: number; hojaAlto: number } {
    if (!calcParams) return { hojaAncho: width, hojaAlto: height };

    let hojaMargen = calcParams.hojaMargen ?? 0;
    let hojaDescuento = calcParams.hojaDescuento ?? 0;
    let hojaDivision = calcParams.hojaDivision ?? 'Completo';

    if (options && calcParams.calculationOverrides) {
      const overrides = calcParams.calculationOverrides as Record<string, any>;
      for (const optionValue of Object.values(options)) {
        if (overrides[optionValue as string]) {
          const override = overrides[optionValue as string];
          hojaMargen = override.hojaMargen ?? hojaMargen;
          hojaDescuento = override.hojaDescuento ?? hojaDescuento;
          hojaDivision = override.hojaDivision ?? hojaDivision;
        }
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

    return {
      hojaAncho: Number(hojaAncho.toFixed(2)),
      hojaAlto: Number((height - hojaDescuento).toFixed(2)),
    };
  }

  private async calcularAccesorios(
    window_type_id: number,
    options: Record<string, string>,
    esBlanco: boolean,
    quantity: number,
    detalle: MaterialCostLine[],
  ): Promise<void> {
    const rules = await this.prisma.accessoryRule.findMany({
      where: { window_type_id },
      include: { material: true },
    });

    for (const rule of rules) {
      const esFija = !rule.option_group && !rule.option_key;
      const aplicaCondicional =
        rule.option_group &&
        rule.option_key &&
        options[rule.option_group] === rule.option_key;
      if (!esFija && !aplicaCondicional) continue;

      const precio = esBlanco
        ? (rule.material.price_white ?? 0)
        : (rule.material.price_color ?? rule.material.price_white ?? 0);
      const cantidad = rule.quantity * quantity;

      detalle.push({
        material_id: rule.material.id,
        nombre: rule.material.name,
        tipo: 'ACCESORIO',
        cantidad,
        precio_unitario: precio,
        costo_total: cantidad * precio,
        unidad: rule.material.unit ?? 'unidad',
      });
    }
  }

  // ✅ AQUÍ CAMBIAMOS LA FIRMA DE LA FUNCIÓN:
  async calcularCostoCotizacion(
    windows: WindowCostInput[],
  ): Promise<QuotationCostResult> {
    // Usamos la interfaz que creamos
    const resultados = await Promise.all(
      windows.map((w) => this.calcularCostoVentana(w)),
    );
    const costo_total_proyecto = resultados.reduce(
      (s, r) => s + r.costo_total,
      0,
    );
    return {
      costo_total_proyecto,
      precio_sugerido_minimo: costo_total_proyecto / MARGEN_MINIMO,
      por_ventana: resultados,
    };
  }
}
