import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TokenUser,
} from "./auth";
import { PrismaService } from "./prisma.service";
import { OrderStatus, Role } from "./types";

class OrderItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}
export class CreateOrderDto {
  @IsString() shopId!: string;
  @IsString() address!: string;
  @IsString() payment!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
export class ProductDto {
  @IsString() name!: string;
  @IsInt() @Min(1) price!: number;
  @IsString() image!: string;
  @IsString() category!: string;
  @IsString() shopId!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) price?: number;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateStatusDto {
  @IsIn([
    "PLACED",
    "ACCEPTED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ])
  status!: OrderStatus;
}
export class SettingDto {
  @IsString() key!: string;
  @IsString() value!: string;
}

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}
  async catalog() {
    const [shops, products, settings] = await Promise.all([
      this.prisma.shop.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.product.findMany({
        where: { active: true },
        include: { shop: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.appSetting.findMany(),
    ]);
    return {
      shops,
      products,
      settings: Object.fromEntries(
        settings.map((s: { key: string; value: string }) => [s.key, s.value]),
      ),
    };
  }
  async createOrder(customer: TokenUser, dto: CreateOrderDto) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: dto.shopId, active: true },
    });
    if (!shop) throw new NotFoundException("Shop not found.");
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: dto.items.map((x) => x.productId) },
        shopId: shop.id,
        active: true,
      },
    });
    if (products.length !== dto.items.length)
      throw new ForbiddenException("One or more items are unavailable.");
    const total = dto.items.reduce(
      (sum, line) =>
        sum +
        (products.find(
          (p: { id: string; price: number }) => p.id === line.productId,
        )?.price || 0) *
          line.quantity,
      0,
    );
    return this.prisma.order.create({
      data: {
        code: `CD-${Date.now().toString().slice(-6)}`,
        total,
        payment: dto.payment,
        address: dto.address,
        customerId: customer.id,
        shopId: shop.id,
        lines: {
          create: dto.items.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: products.find(
              (p: { id: string; price: number }) => p.id === line.productId,
            )!.price,
          })),
        },
      },
      include: { lines: { include: { product: true } }, shop: true },
    });
  }
  mine(user: TokenUser) {
    const where =
      user.role === Role.STUDENT
        ? { customerId: user.id }
        : user.role === Role.SHOPKEEPER
          ? { shopId: user.shopId || "__none__" }
          : {};
    return this.prisma.order.findMany({
      where,
      include: {
        lines: { include: { product: true } },
        shop: true,
        customer: { select: { name: true, place: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async updateOrder(user: TokenUser, id: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    if (user.role === Role.SHOPKEEPER && order.shopId !== user.shopId)
      throw new ForbiddenException();
    return this.prisma.order.update({ where: { id }, data: { status } });
  }
  async overview() {
    const [users, shops, orders, products] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.shop.count(),
      this.prisma.order.count(),
      this.prisma.product.count(),
    ]);
    return { users, shops, orders, products };
  }
  products() {
    return this.prisma.product.findMany({
      include: { shop: true },
      orderBy: { updatedAt: "desc" },
    });
  }
  createProduct(dto: ProductDto) {
    return this.prisma.product.create({ data: dto });
  }
  updateProduct(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto });
  }
  shops() {
    return this.prisma.shop.findMany({
      include: { _count: { select: { products: true, orders: true } } },
      orderBy: { name: "asc" },
    });
  }
  users() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        place: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  settings() {
    return this.prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  }
  setSetting(dto: SettingDto) {
    return this.prisma.appSetting.upsert({
      where: { key: dto.key },
      update: { value: dto.value },
      create: dto,
    });
  }
}

@Controller("v1")
export class StoreController {
  constructor(private readonly store: StoreService) {}
  @Get("catalog") catalog() {
    return this.store.catalog();
  }
  @Post("orders")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  order(@CurrentUser() user: TokenUser, @Body() dto: CreateOrderDto) {
    return this.store.createOrder(user, dto);
  }
  @Get("orders/my") @UseGuards(JwtAuthGuard) mine(
    @CurrentUser() user: TokenUser,
  ) {
    return this.store.mine(user);
  }
  @Patch("orders/:id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOPKEEPER, Role.ADMIN)
  updateStatus(
    @CurrentUser() user: TokenUser,
    @Param("id") id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.store.updateOrder(user, id, dto.status);
  }
}

@Controller("v1/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly store: StoreService) {}
  @Get("overview") overview() {
    return this.store.overview();
  }
  @Get("products") products() {
    return this.store.products();
  }
  @Post("products") createProduct(@Body() dto: ProductDto) {
    return this.store.createProduct(dto);
  }
  @Patch("products/:id") product(
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.store.updateProduct(id, dto);
  }
  @Get("shops") shops() {
    return this.store.shops();
  }
  @Get("users") users() {
    return this.store.users();
  }
  @Get("orders") orders(@CurrentUser() user: TokenUser) {
    return this.store.mine(user);
  }
  @Get("settings") settings() {
    return this.store.settings();
  }
  @Post("settings") setting(@Body() dto: SettingDto) {
    return this.store.setSetting(dto);
  }
}
