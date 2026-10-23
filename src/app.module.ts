import { Module } from "@nestjs/common";
import { CommerceController, CommerceService } from './modules/commerce/commerce';
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { entities } from "./database/data-source";
import {
  AuthController,
  CatalogController,
  OrdersController,
  VendorController,
  AdminController,
  NotificationsController,
} from "./modules/controllers";
import { RolesGuard } from "./modules/auth/access";
import { DatabaseJwtStrategy } from "./modules/auth/jwt.strategy";
import { AuthService } from "./modules/auth/auth.service";
import { CatalogService } from "./modules/catalog/catalog.service";
import { OrdersService } from "./modules/orders/orders.service";
import { AdminService } from "./modules/admin/admin.service";
import { NotificationsService } from "./modules/notifications/notifications.service";
import { MediaService } from "./modules/media/media.service";
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "12h" },
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
      entities,
      synchronize: false,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [
    CommerceController,
    AuthController,
    CatalogController,
    OrdersController,
    VendorController,
    AdminController,
    NotificationsController,
  ],
  providers: [
    CommerceService,
    AuthService,
    CatalogService,
    OrdersService,
    AdminService,
    NotificationsService,
    MediaService,
    DatabaseJwtStrategy,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
