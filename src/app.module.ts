// RUTA: src/app.module.ts

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { OrdersModule } from './orders/orders.module';
import { WindowsModule } from './windows/windows.module';
import { WindowTypesModule } from './window-types/window-types.module';
import { PvcColorsModule } from './pvc-colors/pvc-colors.module';
import { ProfileTypesModule } from './profile-types/profile-types.module';
import { ClientsModule } from './clients/clients.module';
import { GlassColorsModule } from './glass-colors/glass-colors.module';

import { PrismaService } from './prisma/prisma.service';
import { WindowCalculationsModule } from './window-calculations/window-calculations.module';
import { ReportsModule } from './reports/reports.module';
import { QuotationsModule } from './quotations/quotations.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { UploadsController } from './uploads/uploads.controller';
import { CostCalculatorModule } from './cost-calculator/cost-calculator.module';
import { MaterialsModule } from './materials/materials.module';
import { CatalogoPerfilesModule } from './catalogo-perfiles/catalogo-perfiles.module';
import { AccessoryRulesModule } from './accessory-rules/accessory-rules.module';
import { OptionGroupsModule } from './option-groups/option-groups.module';
import { OptionValuesModule } from './option-values/option-values.module';
import { WindowTypeOptionsModule } from './window-type-options/window-type-options.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { WindowSeriesModule } from './window-series/window-series.module';
import { WindowCategoriesModule } from './window-categories/window-categories.module';

@Module({
  imports: [
    // En Render varios usuarios pueden compartir IP de salida. El throttler
    // global cuenta por IP, así que un equipo de 3-5 vendedores trabajando
    // sobre cotizaciones grandes (muchas llamadas a /cost-calculator/window)
    // se acerca al límite con 1000 req/min. Subimos a 5000.
    //
    // IMPORTANTE: un solo throttler nombrado. Con @nestjs/throttler, CADA
    // throttler definido en forRoot() se aplica a TODAS las rutas por
    // defecto, salvo que la ruta lo sobreescriba explícitamente. Antes
    // existía un throttler 'login' (limit:5) separado del 'global' — al no
    // estar restringido solo al endpoint de login, ese límite de 5/min se
    // aplicaba a TODO el sitio (cotizador incluido), causando 429 reales en
    // producción tras solo 5 requests por minuto. El login ahora sobreescribe
    // el límite del MISMO throttler 'global' únicamente en su propia ruta
    // (ver @Throttle({ global: {...} }) en auth.controller.ts).
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60000, limit: 5000 },
    ]),
    OrdersModule,
    WindowsModule,
    WindowTypesModule,
    PvcColorsModule,
    ProfileTypesModule,
    ClientsModule,
    GlassColorsModule,
    WindowCalculationsModule,
    ReportsModule,
    QuotationsModule,
    UsersModule,
    AuthModule,
    CostCalculatorModule,
    MaterialsModule,
    CatalogoPerfilesModule,
    AccessoryRulesModule,
    OptionGroupsModule,
    OptionValuesModule,
    WindowTypeOptionsModule,
    ChecklistsModule,
    DashboardModule,
    AppSettingsModule,
    WindowSeriesModule,
    WindowCategoriesModule,
  ],
  controllers: [AppController, UploadsController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
