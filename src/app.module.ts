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

@Module({
  imports: [
    // ✅ Rate limiting: máximo 5 requests por minuto por IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
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
  ],
  controllers: [AppController, UploadsController],
  providers: [
    AppService,
    PrismaService,
    // ✅ Aplica rate limiting globalmente a todos los endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
