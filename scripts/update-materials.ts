// RUTA: scripts/update-materials.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando script de actualización de precios...');

  // Helper function to read a CSV and update prices for a specific color type
  const updatePricesFromFile = async (
    filePath: string,
    priceField: 'price_white' | 'price_color',
  ) => {
    if (!fs.existsSync(filePath)) {
      console.warn(
        `⚠️ Archivo no encontrado: ${path.basename(filePath)}. Saltando...`,
      );
      return 0;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const records = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    }).data;

    let updatedCount = 0;
    for (const record of records as any[]) {
      const name = record.name?.trim();
      const price = parseFloat(record.price);

      if (!name || isNaN(price)) {
        console.warn(
          `Registro inválido en ${path.basename(filePath)}: ${JSON.stringify(record)}`,
        );
        continue;
      }

      try {
        // Find the material first to ensure it exists
        const material = await prisma.material.findUnique({ where: { name } });

        if (material) {
          await prisma.material.update({
            where: { name },
            data: {
              // Dynamically set 'price_white' or 'price_color'
              [priceField]: price,
            },
          });
          updatedCount++;
        } else {
          console.warn(
            `- Material "${name}" no encontrado en la base de datos. No se actualizó el precio.`,
          );
        }
      } catch (error) {
        console.error(`❌ Error actualizando el material "${name}":`, error);
      }
    }
    return updatedCount;
  };

  // 1. Update prices for WHITE PVC
  const whitePricesPath = path.join(__dirname, 'precios_blanco.csv');
  const whiteUpdated = await updatePricesFromFile(
    whitePricesPath,
    'price_white',
  );
  console.log(`✅ ${whiteUpdated} precios para PVC blanco actualizados.`);

  // 2. Update prices for COLOR PVC
  const colorPricesPath = path.join(__dirname, 'precios_color.csv');
  const colorUpdated = await updatePricesFromFile(
    colorPricesPath,
    'price_color',
  );
  console.log(`✅ ${colorUpdated} precios para PVC de color actualizados.`);

  console.log('🏁 Script finalizado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
