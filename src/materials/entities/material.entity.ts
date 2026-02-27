import { MaterialType } from '@prisma/client';

export class Material {
  id: number;
  name: string;
  type: MaterialType;
  price_white: number | null;
  price_color: number | null;
  unit: string | null;
}
