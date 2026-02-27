// RUTA: ventpro-backend/scripts/migrate-catalog.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();

// Helper para convertir a número o null
const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value === null || value.trim() === '') return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
};

// Helper para convertir a string o null
const toString = (value: string | undefined): string | null => {
  return value && value.trim() !== '' ? value.trim() : null;
};

async function main() {
  console.log('🚀 Iniciando script de migración de catálogo...');

  // --- 1. LEER Y PROCESAR EL ARCHIVO CSV ---
  const filePath = path.join(__dirname, 'catalogo_para_migrar.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      '❌ No se encontró el archivo catalogo_para_migrar.csv en la carpeta /scripts.',
    );
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });
  const rows = parsed.data as any[];

  // --- 2. CREAR TODOS LOS MATERIALES DE TIPO "PERFIL" ---
  console.log('\n🔍 Analizando y creando materiales de tipo PERFIL...');
  const profileNames = new Set<string>();
  const profileColumns = [
    'PERFIL MARCO',
    'PERFIL HOJA',
    'MOSQUITERO',
    'BATIENTE',
    'TAPAJAMBA',
  ];

  rows.forEach((row) => {
    profileColumns.forEach((col) => {
      const profileName = toString(row[col]);
      if (profileName) {
        profileNames.add(profileName);
      }
    });
  });

  for (const name of Array.from(profileNames)) {
    await prisma.material.upsert({
      where: { name: name },
      update: {},
      create: {
        name: name,
        type: 'PERFIL',
        unit: 'Barra 5.8m',
      },
    });
  }
  console.log(
    `✅ ${profileNames.size} materiales de tipo PERFIL asegurados en la base de datos.`,
  );

  // --- 3. ACTUALIZAR LA TABLA catalogo_perfiles ---
  console.log(
    '\n🔄 Actualizando la tabla catalogo_perfiles con los nuevos IDs...',
  );
  const allMaterials = await prisma.material.findMany();
  const materialMap = new Map(allMaterials.map((m) => [m.name, m.id]));

  for (const row of rows) {
    const id = toNumber(row.id);
    // ✨ ESTA ES LA CORRECCIÓN ✨
    // Validamos que tanto el ID como el TIPO DE VENTANA existan.
    const tipoVentana = toString(row['TIPO DE VENTANA']);

    if (!id || !tipoVentana) {
      console.warn(`⚠️ Fila omitida por faltar ID o TIPO DE VENTANA:`, row);
      continue;
    }

    const getMaterialId = (columnName: string): number | null => {
      const name = toString(row[columnName]);
      if (!name) return null;
      return materialMap.get(name) || null;
    };

    const dataToUpdate = {
      perfil_marco_id: getMaterialId('PERFIL MARCO'),
      perfil_hoja_id: getMaterialId('PERFIL HOJA'),
      perfil_mosquitero_id: getMaterialId('MOSQUITERO'),
      perfil_batiente_id: getMaterialId('BATIENTE'),
      perfil_tapajamba_id: getMaterialId('TAPAJAMBA'),

      tipo_ventana: tipoVentana, // Ahora TypeScript sabe que no es null
      cant_vidrios: toNumber(row['CANT_VIDRIOS']),
      regla_marco: toString(row['MULT_MARCO']),
      regla_hoja: toString(row['MULT_HOJA']),
      regla_mosquitero: toString(row['MULT_MOSQ']),
      regla_batiente: toString(row['MULT_BATIENTE']),
      regla_tapajamba: toString(row['MULT_TAPAJAMBA']),
      cerrojos: toNumber(row['CERROJOS']),
      rodos: toNumber(row['RODOS']),
      rodo_mosquitero: toNumber(row['RODO MOSQUITERO']),
      bisagras: toString(row['BISAGRAS']),
      chapa: toString(row['CHAPA']),
      demas_accesorios: toString(row['DEMAS ACCESORIOS']),
      accesorios: toString(row['ACCESORIOS']),
    };

    try {
      await prisma.catalogoPerfiles.update({
        where: { id: id },
        data: dataToUpdate,
      });
      console.log(`👍 Fila de catálogo ID #${id} actualizada.`);
    } catch (error) {
      console.error(`👎 Error al actualizar fila ID #${id}:`, error);
    }
  }

  console.log('\n🎉 Migración de datos completada.');
}

main()
  .catch((e) => {
    console.error('❌ Ocurrió un error fatal durante la migración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
