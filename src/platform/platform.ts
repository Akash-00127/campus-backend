import {
  Body,
  ConflictException,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "@nestjs/passport";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import * as bcrypt from "bcrypt";
import {
  AuditLog,
  Campus,
  Category,
  Coupon,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
  PaymentStatus,
  Product,
  RecordStatus,
  University,
  User,
  UserRole,
  Vendor,
  VendorStatus,
} from "./entities";

type Session = {
  id: string;
  role: UserRole;
  universityId?: string;
  campusId?: string;
  vendorId?: string;
  email: string;
};
const ROLES = "roles";
export const RequireRoles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user as Session,
);
export class JwtGuard extends AuthGuard("jwt") {}
@Injectable()
export class RoleGuard {
  canActivate(ctx: ExecutionContext) {
    const allowed = Reflect.getMetadata(ROLES, ctx.getHandler()) as
      UserRole[] | undefined;
    return (
      !allowed || allowed.includes(ctx.switchToHttp().getRequest().user?.role)
    );
  }
}

export class RegisterDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() universityId!: string;
  @IsString() campusId!: string;
}
export class LoginDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
}
export class UniversityDto {
  @IsString() slug!: string;
  @IsString() name!: string;
  @IsString() state!: string;
  @IsString() city!: string;
  @IsOptional() @IsString() type?: string;
}
export class CampusDto {
  @IsString() universityId!: string;
  @IsString() slug!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
}
export class VendorDto {
  @IsString() slug!: string;
  @IsString() name!: string;
  @IsString() universityId!: string;
  @IsString() campusId!: string;
  @IsString() ownerId!: string;
  @IsOptional() @IsString() description?: string;
}
export class ProductDto {
  @IsString() vendorId!: string;
  @IsString() name!: string;
  @IsInt() @Min(1) pricePaise!: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() image?: string;
}
class OrderLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() note?: string;
}
export class OrderDto {
  @IsString() vendorId!: string;
  @IsString() deliveryAddress!: string;
  @IsString() paymentMethod!: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}
export class StatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
  @IsOptional() @IsString() reason?: string;
}
export class CouponDto {
  @IsString() code!: string;
  @IsString() type!: "PERCENTAGE" | "FIXED";
  @IsInt() @Min(1) value!: number;
  @IsOptional() @IsInt() minOrderPaise?: number;
  @IsOptional() @IsString() universityId?: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() @IsString() vendorId?: string;
}

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(University) private universities: Repository<University>,
    @InjectRepository(Campus) private campuses: Repository<Campus>,
    @InjectRepository(Vendor) private vendors: Repository<Vendor>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Category) private categories: Repository<Category>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Coupon) private coupons: Repository<Coupon>,
    @InjectRepository(AuditLog) private audits: Repository<AuditLog>,
    private data: DataSource,
    private jwt: JwtService,
  ) {}
  private session(user: User): Session {
    return {
      id: user.id,
      role: user.role,
      universityId: user.universityId,
      campusId: user.campusId,
      email: user.email,
    };
  }
  private response(user: User) {
    return {
      accessToken: this.jwt.sign(this.session(user)),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        universityId: user.universityId,
        campusId: user.campusId,
      },
    };
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.existsBy({ email }))
      throw new ConflictException("An account already exists with this email.");
    const campus = await this.campuses.findOneBy({
      id: dto.campusId,
      universityId: dto.universityId,
      status: RecordStatus.ACTIVE,
    });
    if (!campus)
      throw new ForbiddenException(
        "Choose an active campus belonging to the selected university.",
      );
    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 12),
        universityId: dto.universityId,
        campusId: dto.campusId,
        role: UserRole.STUDENT,
      }),
    );
    return this.response(user);
  }
  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("LOWER(user.email) = LOWER(:email)", { email: dto.email.trim() })
      .getOne();
    if (
      !user ||
      user.status !== RecordStatus.ACTIVE ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException("Invalid email or password.");
    return this.response(user);
  }
  universitiesList() {
    return this.universities.find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: "ASC" },
    });
  }
  campusesList(universityId: string) {
    return this.campuses.find({
      where: { universityId, status: RecordStatus.ACTIVE },
      order: { name: "ASC" },
    });
  }
  async catalog(session: Session) {
    if (!session.universityId || !session.campusId)
      throw new ForbiddenException(
        "Your account does not have a verified campus.",
      );
    const vendors = await this.vendors.find({
      where: {
        universityId: session.universityId,
        campusId: session.campusId,
        status: RecordStatus.ACTIVE,
      },
      order: { name: "ASC" },
    });
    const products = await this.products.find({
      where: {
        universityId: session.universityId,
        campusId: session.campusId,
        active: true,
        available: true,
      },
      relations: { vendor: true, category: true },
      order: { name: "ASC" },
    });
    const categories = await this.categories.find({
      where: { universityId: session.universityId, active: true },
      order: { name: "ASC" },
    });
    return {
      vendors: vendors.filter(
        (vendor) =>
          vendor.operatingStatus === VendorStatus.OPEN ||
          vendor.operatingStatus === VendorStatus.BUSY,
      ),
      products,
      categories,
    };
  }
  private async verifyCoupon(
    code: string | undefined,
    amount: number,
    session: Session,
    vendorId: string,
  ) {
    if (!code) return { discount: 0, code: undefined };
    const coupon = await this.coupons.findOneBy({
      code: code.toUpperCase(),
      active: true,
    });
    if (
      !coupon ||
      (coupon.universityId && coupon.universityId !== session.universityId) ||
      (coupon.campusId && coupon.campusId !== session.campusId) ||
      (coupon.vendorId && coupon.vendorId !== vendorId) ||
      amount < coupon.minOrderPaise
    )
      throw new ForbiddenException("Coupon is not valid for this order.");
    const raw =
      coupon.type === "PERCENTAGE"
        ? Math.floor((amount * coupon.value) / 100)
        : coupon.value;
    return {
      discount: coupon.maxDiscountPaise
        ? Math.min(raw, coupon.maxDiscountPaise)
        : raw,
      code: coupon.code,
    };
  }
  async createOrder(session: Session, dto: OrderDto) {
    if (!session.universityId || !session.campusId)
      throw new ForbiddenException("Select a verified campus first.");
    const existing = await this.orders.findOne({
      where: { studentId: session.id, idempotencyKey: dto.idempotencyKey },
      relations: { items: true },
    });
    if (existing) return existing;
    return this.data.transaction(async (manager) => {
      const vendor = await manager.findOne(Vendor, {
        where: {
          id: dto.vendorId,
          universityId: session.universityId,
          campusId: session.campusId,
          status: RecordStatus.ACTIVE,
        },
      });
      if (!vendor)
        throw new ForbiddenException("You cannot order from this vendor.");
      if (
        vendor.operatingStatus !== VendorStatus.OPEN &&
        vendor.operatingStatus !== VendorStatus.BUSY
      )
        throw new ForbiddenException("Vendor is currently closed.");
      const ids = dto.items.map((item) => item.productId);
      const products = await manager.find(Product, {
        where: {
          id: In(ids),
          vendorId: vendor.id,
          universityId: session.universityId,
          campusId: session.campusId,
          active: true,
          available: true,
        },
      });
      if (products.length !== ids.length)
        throw new ForbiddenException(
          "One or more products are currently unavailable.",
        );
      const subtotal = dto.items.reduce(
        (total, line) =>
          total +
          products.find((product) => product.id === line.productId)!
            .pricePaise *
            line.quantity,
        0,
      );
      const coupon = await this.verifyCoupon(
        dto.couponCode,
        subtotal,
        session,
        vendor.id,
      );
      const delivery = subtotal >= 19900 ? 0 : 2500;
      const platform = 500;
      const total = subtotal - coupon.discount + delivery + platform;
      const order = manager.create(Order, {
        code: `CD${Date.now().toString().slice(-8)}`,
        studentId: session.id,
        vendorId: vendor.id,
        universityId: session.universityId!,
        campusId: session.campusId!,
        paymentMethod: dto.paymentMethod,
        deliveryAddress: dto.deliveryAddress,
        idempotencyKey: dto.idempotencyKey,
        couponCode: coupon.code,
        subtotalPaise: subtotal,
        discountPaise: coupon.discount,
        deliveryFeePaise: delivery,
        platformFeePaise: platform,
        taxPaise: 0,
        totalPaise: total,
        commissionPaise: Math.floor(
          (subtotal * vendor.commissionRateBps) / 10000,
        ),
        status:
          dto.paymentMethod === "CASH"
            ? OrderStatus.PLACED
            : OrderStatus.PENDING_PAYMENT,
        paymentStatus:
          dto.paymentMethod === "CASH"
            ? PaymentStatus.PENDING
            : PaymentStatus.PENDING,
        estimatedReadyAt: new Date(
          Date.now() + vendor.preparationMinutes * 60_000,
        ),
        items: dto.items.map((line) => {
          const product = products.find((p) => p.id === line.productId)!;
          return manager.create(OrderItem, {
            productId: product.id,
            name: product.name,
            unitPricePaise: product.pricePaise,
            quantity: line.quantity,
            note: line.note,
          });
        }),
      });
      const saved = await manager.save(order);
      await manager.save(OrderStatusHistory, {
        orderId: saved.id,
        status: saved.status,
        actorId: session.id,
      });
      return saved;
    });
  }
  private transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.PENDING_PAYMENT]: [
      OrderStatus.PAID,
      OrderStatus.PAYMENT_FAILED,
    ],
    [OrderStatus.PAID]: [OrderStatus.PLACED],
    [OrderStatus.PLACED]: [
      OrderStatus.VENDOR_ACCEPTED,
      OrderStatus.CANCELLED_BY_USER,
      OrderStatus.CANCELLED_BY_VENDOR,
      OrderStatus.CANCELLED_BY_ADMIN,
    ],
    [OrderStatus.VENDOR_ACCEPTED]: [
      OrderStatus.PREPARING,
      OrderStatus.CANCELLED_BY_VENDOR,
    ],
    [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP],
    [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.ASSIGNED_TO_DELIVERY],
    [OrderStatus.ASSIGNED_TO_DELIVERY]: [OrderStatus.PICKED_UP],
    [OrderStatus.PICKED_UP]: [OrderStatus.OUT_FOR_DELIVERY],
    [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  };
  async changeStatus(session: Session, id: string, dto: StatusDto) {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException("Order not found.");
    if (session.role === UserRole.STUDENT && order.studentId !== session.id)
      throw new ForbiddenException();
    const vendor =
      session.role === UserRole.VENDOR
        ? await this.vendors.findOneBy({ ownerId: session.id })
        : undefined;
    if (session.role === UserRole.VENDOR && order.vendorId !== vendor?.id)
      throw new ForbiddenException();
    const next = this.transitions[order.status] || [];
    if (!next.includes(dto.status))
      throw new ForbiddenException(
        "Order cannot move to that status at this stage.",
      );
    order.status = dto.status;
    await this.orders.save(order);
    await this.data
      .getRepository(OrderStatusHistory)
      .save({
        orderId: order.id,
        status: dto.status,
        actorId: session.id,
        reason: dto.reason,
      });
    return order;
  }
  async adminCreateUniversity(session: Session, dto: UniversityDto) {
    const university = await this.universities.save(
      this.universities.create({ ...dto, type: dto.type || "OTHER" }),
    );
    await this.audit(
      session,
      "CREATE_UNIVERSITY",
      "University",
      university.id,
      university,
    );
    return university;
  }
  async adminCreateCampus(session: Session, dto: CampusDto) {
    const university = await this.universities.findOneBy({
      id: dto.universityId,
    });
    if (!university) throw new NotFoundException("University not found.");
    const campus = await this.campuses.save(this.campuses.create(dto));
    await this.audit(session, "CREATE_CAMPUS", "Campus", campus.id, campus);
    return campus;
  }
  async adminCreateVendor(session: Session, dto: VendorDto) {
    const campus = await this.campuses.findOneBy({
      id: dto.campusId,
      universityId: dto.universityId,
    });
    const owner = await this.users.findOneBy({ id: dto.ownerId });
    if (!campus || !owner)
      throw new NotFoundException("Campus or owner not found.");
    const vendor = await this.vendors.save(this.vendors.create(dto));
    owner.role = UserRole.VENDOR;
    await this.users.save(owner);
    await this.audit(session, "CREATE_VENDOR", "Vendor", vendor.id, vendor);
    return vendor;
  }
  async vendorProduct(session: Session, dto: ProductDto) {
    const vendor = await this.vendors.findOneBy({ ownerId: session.id });
    if (!vendor || vendor.id !== dto.vendorId)
      throw new ForbiddenException("You can only manage your own products.");
    const product = await this.products.save(
      this.products.create({
        ...dto,
        universityId: vendor.universityId,
        campusId: vendor.campusId,
      }),
    );
    await this.audit(session, "CREATE_PRODUCT", "Product", product.id, product);
    return product;
  }
  async adminOverview() {
    const [universities, campuses, vendors, students, orders] =
      await Promise.all([
        this.universities.count(),
        this.campuses.count(),
        this.vendors.count({ where: { status: RecordStatus.ACTIVE } }),
        this.users.count({ where: { role: UserRole.STUDENT } }),
        this.orders.find(),
      ]);
    return {
      universities,
      campuses,
      vendors,
      students,
      orders: orders.length,
      gmvPaise: orders.reduce((total, order) => total + order.totalPaise, 0),
      completedOrders: orders.filter(
        (order) => order.status === OrderStatus.DELIVERED,
      ).length,
    };
  }
  async audit(
    session: Session,
    action: string,
    entity: string,
    entityId: string,
    after: unknown,
  ) {
    await this.audits.save(
      this.audits.create({
        actorId: session.id,
        action,
        entity,
        entityId,
        after,
      }),
    );
  }
}

@Controller("v1/auth")
export class PlatformAuthController {
  constructor(private service: PlatformService) {}
  @Post("register") register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }
  @Post("login") login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }
}
@Controller("v1")
export class PlatformPublicController {
  constructor(private service: PlatformService) {}
  @Get("universities") universities() {
    return this.service.universitiesList();
  }
  @Get("universities/:universityId/campuses") campuses(
    @Param("universityId") id: string,
  ) {
    return this.service.campusesList(id);
  }
  @Get("catalog") @UseGuards(JwtGuard) catalog(
    @CurrentSession() session: Session,
  ) {
    return this.service.catalog(session);
  }
  @Post("orders")
  @UseGuards(JwtGuard, RoleGuard)
  @RequireRoles(UserRole.STUDENT)
  order(@CurrentSession() session: Session, @Body() dto: OrderDto) {
    return this.service.createOrder(session, dto);
  }
  @Patch("orders/:id/status")
  @UseGuards(JwtGuard, RoleGuard)
  @RequireRoles(
    UserRole.STUDENT,
    UserRole.VENDOR,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  status(
    @CurrentSession() session: Session,
    @Param("id") id: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.changeStatus(session, id, dto);
  }
}
@Controller("v1/vendor")
@UseGuards(JwtGuard, RoleGuard)
@RequireRoles(UserRole.VENDOR)
export class VendorController {
  constructor(private service: PlatformService) {}
  @Post("products") product(
    @CurrentSession() session: Session,
    @Body() dto: ProductDto,
  ) {
    return this.service.vendorProduct(session, dto);
  }
}
@Controller("v1/admin")
@UseGuards(JwtGuard, RoleGuard)
@RequireRoles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PlatformAdminController {
  constructor(private service: PlatformService) {}
  @Get("overview") overview() {
    return this.service.adminOverview();
  }
  @Post("universities") university(
    @CurrentSession() s: Session,
    @Body() dto: UniversityDto,
  ) {
    return this.service.adminCreateUniversity(s, dto);
  }
  @Post("campuses") campus(
    @CurrentSession() s: Session,
    @Body() dto: CampusDto,
  ) {
    return this.service.adminCreateCampus(s, dto);
  }
  @Post("vendors") vendor(
    @CurrentSession() s: Session,
    @Body() dto: VendorDto,
  ) {
    return this.service.adminCreateVendor(s, dto);
  }
}
