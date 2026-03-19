// RUTA: src/app-settings/app-settings.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Claves conocidas del sistema
export const SETTINGS_KEYS = {
  PROFIT_MARGIN: 'profit_margin',
} as const;

// Valores por defecto si la clave no existe en BD
const DEFAULTS: Record<string, string> = {
  [SETTINGS_KEYS.PROFIT_MARGIN]: '60',
};

@Injectable()
export class AppSettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string> {
    const record = await this.prisma.appSetting.findUnique({ where: { key } });
    return record?.value ?? DEFAULTS[key] ?? '';
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // ── Helpers tipados ──────────────────────────────────────────────────────
  async getProfitMargin(): Promise<number> {
    const val = await this.get(SETTINGS_KEYS.PROFIT_MARGIN);
    const num = parseFloat(val);
    // Validar rango 1-99 para evitar división por cero o valores absurdos
    return Number.isFinite(num) && num > 0 && num < 100 ? num : 60;
  }

  async getAll(): Promise<Record<string, string>> {
    const records = await this.prisma.appSetting.findMany();
    const result: Record<string, string> = { ...DEFAULTS };
    records.forEach((r) => {
      result[r.key] = r.value;
    });
    return result;
  }
}
