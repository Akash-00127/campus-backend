import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { DataSource, EntityManager, Column, Entity, Index } from "typeorm";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  BaseEntity,
  Coupon,
  Order,
  OrderStatus,
  Product,
  RecordStatus,
  User,
  UserRole as R,
  Vendor,
} from "../../platform/entities";
import {
  campusAccess,
  audit,
  ownedVendor,
  CatalogService,
} from "../catalog/catalog.service";
import { CurrentUser, JwtGuard, Roles, RolesGuard } from "../auth/access";
import { ActiveDto, AddressDto, OrderDto, PageDto } from "../shared/dtos";
import { Address } from "../shared/entities";

@Entity("reviews")
@Index(["orderId"], { unique: true })
export class Review extends BaseEntity {
  @Column({ type: "uuid" }) orderId!: string;
  @Index() @Column({ type: "uuid" }) userId!: string;
  @Index() @Column({ type: "uuid" }) vendorId!: string;
  @Column({ type: "int" }) rating!: number;
  @Column() comment!: string;
  @Column({ default: true }) visible!: boolean;
}
export class ReviewDto {
  @IsUUID() orderId!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(3) @MaxLength(1000) comment!: string;
}
export class CouponDto {
  @IsString() @Matches(/^[A-Z0-9_-]{3,30}$/) code!: string;
  @IsIn(["FIXED", "PERCENTAGE"]) type!: "FIXED" | "PERCENTAGE";
  @IsInt() @Min(1) @Max(10000000) value!: number;
  @IsInt() @Min(0) @Max(100000000) minOrderPaise!: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000000) maxDiscountPaise?: number;
  @IsOptional() @IsUUID() universityId?: string;
  @IsOptional() @IsUUID() campusId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsDateString() endsAt!: string;
  @IsInt() @Min(1) @Max(1000000) usageLimit!: number;
  @IsInt() @Min(1) @Max(100) perUserLimit!: number;
  @IsBoolean() active!: boolean;
}
export class VisibleDto {
  @IsBoolean() visible!: boolean;
}
export async function couponDiscount(
  m: EntityManager,
  user: User,
  vendorId: string,
  subtotal: number,
  code?: string,
  lock = false,
) {
  if (!code) return 0;
  const coupon = await m.findOne(Coupon, {
    where: { code: code.trim().toUpperCase(), active: true },
    ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
  });
  const now = new Date();
  if (
    !coupon ||
    (coupon.universityId && coupon.universityId !== user.universityId) ||
    (coupon.campusId && coupon.campusId !== user.campusId) ||
    (coupon.vendorId && coupon.vendorId !== vendorId) ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.endsAt && coupon.endsAt <= now) ||
    subtotal < coupon.minOrderPaise
  )
    throw new ForbiddenException("Coupon is not eligible for this order.");
  // Placed orders consume a use, even if later cancelled; retries return the original order.
  const [total, mine] = await Promise.all([
    m.countBy(Order, { couponCode: coupon.code }),
    m.countBy(Order, { couponCode: coupon.code, studentId: user.id }),
  ]);
  if (
    (coupon.usageLimit > 0 && total >= coupon.usageLimit) ||
    mine >= coupon.perUserLimit
  )
    throw new ForbiddenException("Coupon usage limit reached.");
  const amount =
    coupon.type === "FIXED"
      ? coupon.value
      : Math.floor((subtotal * coupon.value) / 100);
  return Math.min(subtotal, amount, coupon.maxDiscountPaise ?? subtotal);
}
@Injectable()
export class CommerceService {
  constructor(
    private db: DataSource,
    private catalog: CatalogService,
  ) {}
  async quote(user: User, d: OrderDto) {
    const campus = await campusAccess(this.db.manager, user, true);
    let subtotal = 0;
    if (new Set(d.items.map((i) => i.productId)).size !== d.items.length)
      throw new ForbiddenException("Duplicate product lines.");
    for (const line of d.items) {
      const p = await this.catalog.product(user, line.productId);
      if (
        p.vendorId !== d.vendorId ||
        !p.available ||
        !p.vendor.acceptingOrders ||
        (p.stock !== null && p.stock < line.quantity)
      )
        throw new ForbiddenException("A product is unavailable.");
      subtotal += p.pricePaise * line.quantity;
    }
    const discount = await couponDiscount(
      this.db.manager,
      user,
      d.vendorId,
      subtotal,
      d.couponCode,
    );
    return {
      subtotalPaise: subtotal,
      discountPaise: discount,
      deliveryFeePaise: campus.deliveryFeePaise,
      platformFeePaise: campus.platformFeePaise,
      totalPaise:
        subtotal - discount + campus.deliveryFeePaise + campus.platformFeePaise,
    };
  }
  async review(user: User, d: ReviewDto) {
    return this.db.transaction(async (m) => {
      const order = await m.findOne(Order, {
        where: {
          id: d.orderId,
          studentId: user.id,
          status: OrderStatus.DELIVERED,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!order)
        throw new ForbiddenException(
          "Only your delivered orders can be reviewed.",
        );
      if (await m.existsBy(Review, { orderId: order.id }))
        throw new ForbiddenException("This order has already been reviewed.");
      return m.save(
        Review,
        m.create(Review, { ...d, userId: user.id, vendorId: order.vendorId }),
      );
    });
  }
  async reviews(user: User, vendorId: string) {
    await campusAccess(this.db.manager, user);
    if (
      !(await this.db.manager.existsBy(Vendor, {
        id: vendorId,
        universityId: user.universityId,
        campusId: user.campusId,
        status: RecordStatus.ACTIVE,
        approvalStatus: "APPROVED",
      }))
    )
      throw new NotFoundException();
    const repo = this.db.getRepository(Review);
    const [rows, stats] = await Promise.all([
      repo.find({
        where: { vendorId, visible: true },
        order: { createdAt: "DESC" },
        take: 30,
      }),
      repo
        .createQueryBuilder("r")
        .select("COUNT(*)", "count")
        .addSelect("AVG(r.rating)", "rating")
        .where("r.vendorId = :vendorId AND r.visible = true", { vendorId })
        .getRawOne(),
    ]);
    return {
      items: rows.map(({ id, rating, comment, createdAt }) => ({
        id,
        rating,
        comment,
        createdAt,
      })),
      count: Number(stats.count),
      rating: stats.rating ? Number(stats.rating) : null,
    };
  }
  async address(user: User, id: string, d?: AddressDto) {
    const a = await this.db.manager.findOneBy(Address, {
      id,
      userId: user.id,
      campusId: user.campusId,
    });
    if (!a) throw new NotFoundException();
    if (!d) {
      await this.db.manager.remove(a);
      return { id };
    }
    await campusAccess(this.db.manager, user);
    return this.db.manager.save(Address, Object.assign(a, d));
  }
  async dashboard(user: User) {
    const v = await ownedVendor(this.db.manager, user, false);
    const rows = await this.db
      .getRepository(Order)
      .createQueryBuilder("o")
      .select("o.status", "status")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(o.totalPaise)", "total")
      .where("o.vendorId = :id", { id: v.id })
      .andWhere(
        `o.createdAt >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`,
      )
      .groupBy("o.status")
      .getRawMany();
    return {
      orders: rows.reduce((n, r) => n + Number(r.count), 0),
      delivered: rows
        .filter((r) => r.status === "DELIVERED")
        .reduce((n, r) => n + Number(r.count), 0),
      deliveredSalesPaise: rows
        .filter((r) => r.status === "DELIVERED")
        .reduce((n, r) => n + Number(r.total), 0),
      pending: rows
        .filter((r) => r.status === "PLACED")
        .reduce((n, r) => n + Number(r.count), 0),
    };
  }
  async createCoupon(user: User, d: CouponDto) {
    if (d.type === "PERCENTAGE" && d.value > 100)
      throw new ForbiddenException("Percentage must be at most 100.");
    if (
      new Date(d.endsAt) <= new Date() ||
      (d.startsAt && new Date(d.startsAt) >= new Date(d.endsAt))
    )
      throw new ForbiddenException("Choose a valid future coupon period.");
    if (d.campusId) {
      const { Campus } = await import("../../platform/entities");
      const c = await this.db.manager.findOneBy(Campus, { id: d.campusId });
      if (!c || (d.universityId && c.universityId !== d.universityId))
        throw new ForbiddenException("Campus does not match university.");
    }
    if (d.vendorId) {
      const v = await this.db.manager.findOneBy(Vendor, { id: d.vendorId });
      if (
        !v ||
        (d.universityId && v.universityId !== d.universityId) ||
        (d.campusId && v.campusId !== d.campusId)
      )
        throw new ForbiddenException("Vendor scope does not match.");
    }
    return this.db.transaction(async (m) => {
      const c = await m.save(
        Coupon,
        m.create(Coupon, {
          ...d,
          startsAt: d.startsAt ? new Date(d.startsAt) : undefined,
          endsAt: new Date(d.endsAt),
        }),
      );
      await audit(m, user.id, "COUPON_CREATED", "Coupon", c.id, {
        code: c.code,
      });
      return c;
    });
  }
  async moderate(user: User, id: string, d: VisibleDto) {
    return this.db.transaction(async (m) => {
      const r = await m.findOneBy(Review, { id });
      if (!r) throw new NotFoundException();
      r.visible = d.visible;
      await m.save(r);
      await audit(m, user.id, "REVIEW_VISIBILITY", "Review", id, d);
      return r;
    });
  }
  async couponStatus(user: User, id: string, d: ActiveDto) {
    return this.db.transaction(async (m) => {
      const c = await m.findOne(Coupon, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!c) throw new NotFoundException();
      c.active = d.active;
      await m.save(c);
      await audit(m, user.id, "COUPON_STATUS", "Coupon", id, d);
      return c;
    });
  }
}
@Controller("v1")
@UseGuards(JwtGuard, RolesGuard)
@Roles(R.STUDENT)
export class CommerceController {
  constructor(private service: CommerceService) {}
  @Post("checkout/quote") quote(@CurrentUser() u: User, @Body() d: OrderDto) {
    return this.service.quote(u, d);
  }
  @Post("reviews") review(@CurrentUser() u: User, @Body() d: ReviewDto) {
    return this.service.review(u, d);
  }
  @Get("vendors/:id/reviews") reviews(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.reviews(u, id);
  }
  @Patch("addresses/:id") address(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AddressDto,
  ) {
    return this.service.address(u, id, d);
  }
  @Delete("addresses/:id") remove(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.address(u, id);
  }
  @Get("vendor/dashboard") @Roles(R.VENDOR) dashboard(@CurrentUser() u: User) {
    return this.service.dashboard(u);
  }
  @Post("admin/coupons") @Roles(R.ADMIN, R.SUPER_ADMIN) coupon(
    @CurrentUser() u: User,
    @Body() d: CouponDto,
  ) {
    return this.service.createCoupon(u, d);
  }
  @Patch("admin/reviews/:id") @Roles(R.ADMIN, R.SUPER_ADMIN) moderate(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: VisibleDto,
  ) {
    return this.service.moderate(u, id, d);
  }
  @Patch("admin/coupons/:id") @Roles(R.ADMIN, R.SUPER_ADMIN) couponStatus(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: ActiveDto,
  ) {
    return this.service.couponStatus(u, id, d);
  }
}
