import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { DataSource, EntityManager, In } from "typeorm";
import {
  Order,
  OrderItem,
  OrderStatus as S,
  OrderStatusHistory,
  PaymentStatus,
  Product,
  RecordStatus,
  User,
  UserRole,
  Vendor,
  VendorStatus,
} from "../../platform/entities";
import { Address, Notification } from "../shared/entities";
import { CashDto, OrderDto, PageDto, StatusDto } from "../shared/dtos";
import { audit, campusAccess, ownedVendor } from "../catalog/catalog.service";
import { assertTransition, calculatePrice, fingerprint } from "./policies";
import { acceptsOrders } from "../catalog/availability";
import { couponDiscount } from "../commerce/commerce";

const cancelled = [
  S.CANCELLED_BY_USER,
  S.CANCELLED_BY_VENDOR,
  S.CANCELLED_BY_ADMIN,
];
function pinFor(id: string) {
  const secret = process.env.DELIVERY_PIN_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("Delivery PIN secret is not configured");
  return (
    createHmac("sha256", secret)
      .update(`delivery:${id}`)
      .digest()
      .readUInt32BE(0) % 1000000
  )
    .toString()
    .padStart(6, "0");
}
const hashPin = (pin: string) => createHash("sha256").update(pin).digest("hex");
async function notify(
  manager: EntityManager,
  userId: string,
  order: Order,
  title: string,
) {
  await manager.save(
    Notification,
    manager.create(Notification, {
      userId,
      orderId: order.id,
      title,
      body: `Order ${order.code}: ${order.status.replaceAll("_", " ").toLowerCase()}. Open Campus Drop for details.`,
    }),
  );
}
@Injectable()
export class OrdersService {
  constructor(private readonly db: DataSource) {}
  private serialize(order: Order, user: User) {
    const { deliveryPinHash, requestHash, deliveryPinAttempts, ...safe } =
      order;
    const pin =
      user.id === order.studentId &&
      !cancelled.includes(order.status) &&
      order.status !== S.DELIVERED &&
      order.deliveryPinExpiresAt &&
      order.deliveryPinExpiresAt > new Date()
        ? pinFor(order.id)
        : undefined;
    if (user.role === UserRole.VENDOR)
      return {
        ...safe,
        student: undefined,
        vendor: undefined,
        deliveryPin: undefined,
      };
    return { ...safe, deliveryPin: pin };
  }
  private async owned(
    manager: EntityManager,
    user: User,
    id: string,
    lock = false,
  ) {
    const order = await manager
      .getRepository(Order)
      .createQueryBuilder("o")
      .addSelect("o.deliveryPinHash")
      .where("o.id = :id", { id })
      .setLock(lock ? "pessimistic_write" : (undefined as any))
      .getOne();
    if (!order) throw new NotFoundException("Order not found.");
    if (user.role === UserRole.STUDENT && order.studentId !== user.id)
      throw new NotFoundException("Order not found.");
    if (user.role === UserRole.VENDOR) {
      const vendor = await ownedVendor(manager, user);
      if (vendor.id !== order.vendorId)
        throw new NotFoundException("Order not found.");
    }
    if (
      ![
        UserRole.STUDENT,
        UserRole.VENDOR,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ].includes(user.role)
    )
      throw new ForbiddenException();
    return order;
  }
  async create(user: User, dto: OrderDto) {
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException();
    const result = await this.db.transaction(async (manager) => {
      // Serializes retries of the same logical request, including concurrent submissions.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${user.id}:${dto.idempotencyKey}`],
      );
      const existing = await manager.findOne(Order, {
        where: { studentId: user.id, idempotencyKey: dto.idempotencyKey },
        relations: { items: true },
      });
      const requestHash = fingerprint(dto);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException(
            "This checkout key was already used for a different order.",
          );
        return existing;
      }
      const current = await manager.findOneByOrFail(User, {
        id: user.id,
        status: RecordStatus.ACTIVE,
      });
      const campus = await campusAccess(manager, current, true);
      if (dto.paymentMethod !== "COD" || !campus.codEnabled)
        throw new ForbiddenException("Cash on delivery is unavailable.");
      const vendor = await manager.findOne(Vendor, {
        where: {
          id: dto.vendorId,
          universityId: current.universityId,
          campusId: current.campusId,
          status: RecordStatus.ACTIVE,
          approvalStatus: "APPROVED",
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!vendor)
        throw new ForbiddenException("You cannot order from this vendor.");
      if (!acceptsOrders(vendor))
        throw new ForbiddenException(
          "Vendor is currently not accepting orders.",
        );
      if (vendor.maxConcurrentOrders > 0) {
        const activeCount = await manager.count(Order, {
          where: {
            vendorId: vendor.id,
            status: In([
              S.PLACED,
              S.VENDOR_ACCEPTED,
              S.PREPARING,
              S.READY_FOR_PICKUP,
              S.OUT_FOR_DELIVERY,
            ]),
          },
        });
        if (activeCount >= vendor.maxConcurrentOrders)
          throw new ForbiddenException(
            "This shop has reached its order capacity. Please try again later.",
          );
      }
      if (!vendor.codEnabled)
        throw new ForbiddenException("This shop does not accept COD.");
      const address = await manager.findOneBy(Address, {
        id: dto.addressId,
        userId: current.id,
        campusId: current.campusId,
      });
      if (!address)
        throw new ForbiddenException(
          "Choose your own delivery address on this campus.",
        );
      const ids = dto.items.map((i) => i.productId);
      if (!ids.length || new Set(ids).size !== ids.length)
        throw new ForbiddenException("Use one cart line per product.");
      const products = await manager
        .getRepository(Product)
        .createQueryBuilder("p")
        .where("p.id IN (:...ids)", { ids })
        .andWhere(
          "p.vendorId = :vendorId AND p.campusId = :campusId AND p.universityId = :universityId",
          {
            vendorId: vendor.id,
            campusId: current.campusId,
            universityId: current.universityId,
          },
        )
        .orderBy("p.id", "ASC")
        .setLock("pessimistic_write")
        .getMany();
      if (products.length !== ids.length)
        throw new ForbiddenException(
          "Products must belong to the selected shop.",
        );
      let subtotal = 0;
      for (const line of dto.items) {
        const product = products.find((p) => p.id === line.productId)!;
        if (
          !product.active ||
          !product.available ||
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 50 ||
          (product.stock !== null && product.stock < line.quantity)
        )
          throw new ForbiddenException(
            `${product.name} is unavailable in that quantity.`,
          );
        subtotal += product.pricePaise * line.quantity;
        if (product.stock !== null) {
          product.stock -= line.quantity;
          await manager.save(product);
        }
      }
      const pricing = calculatePrice(
        subtotal,
        campus.deliveryFeePaise,
        campus.platformFeePaise,
        vendor.commissionRateBps,
      );
      const discount = await couponDiscount(
        manager,
        current,
        vendor.id,
        subtotal,
        dto.couponCode,
        true,
      );
      pricing.discountPaise = discount;
      pricing.totalPaise -= discount;
      if (pricing.totalPaise < 1)
        throw new ForbiddenException(
          "This coupon leaves no COD balance. Choose a different coupon.",
        );
      pricing.commissionPaise = Math.floor(
        ((subtotal - discount) * vendor.commissionRateBps) / 10000,
      );
      if (
        dto.expectedTotalPaise !== undefined &&
        dto.expectedTotalPaise !== pricing.totalPaise
      )
        throw new ConflictException(
          "Prices or fees changed. Refresh your basket before placing the order.",
        );
      if (pricing.totalPaise > campus.codLimitPaise)
        throw new ForbiddenException(
          "This order exceeds the campus COD limit.",
        );
      const id = randomUUID();
      const order = manager.create(Order, {
        id,
        code: `CD-${id.replaceAll("-", "").toUpperCase()}`,
        studentId: current.id,
        vendorId: vendor.id,
        universityId: current.universityId!,
        campusId: current.campusId!,
        ...pricing,
        paymentMethod: "COD",
        paymentStatus: PaymentStatus.PENDING,
        status: S.PLACED,
        idempotencyKey: dto.idempotencyKey,
        requestHash,
        couponCode: dto.couponCode,
        deliveryAddress: `${address.label} | ${address.building} | ${address.details} | ${address.phone}`,
        deliveryPinHash: hashPin(pinFor(id)),
        deliveryPinExpiresAt: new Date(Date.now() + 86400000),
        estimatedReadyAt: new Date(
          Date.now() + vendor.preparationMinutes * 60000,
        ),
        items: dto.items.map((line) =>
          manager.create(OrderItem, {
            productId: line.productId,
            name: products.find((p) => p.id === line.productId)!.name,
            unitPricePaise: products.find((p) => p.id === line.productId)!
              .pricePaise,
            quantity: line.quantity,
            note: line.note,
          }),
        ),
      });
      await manager.save(order);
      await manager.save(OrderStatusHistory, {
        orderId: id,
        status: S.PLACED,
        actorId: current.id,
      });
      await notify(manager, vendor.ownerId, order, "New campus order");
      await notify(manager, current.id, order, "Order placed");
      return order;
    });
    return this.serialize(result, user);
  }
  async list(user: User, query: PageDto) {
    const where =
      user.role === UserRole.STUDENT
        ? { studentId: user.id }
        : user.role === UserRole.VENDOR
          ? { vendorId: (await ownedVendor(this.db.manager, user, false)).id }
          : null;
    if (!where) throw new ForbiddenException();
    const [orders, total] = await this.db.getRepository(Order).findAndCount({
      where,
      relations: { items: true },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: orders.map((o) => this.serialize(o, user)),
      total,
      page: query.page,
    };
  }
  async detail(user: User, id: string) {
    const order = await this.owned(this.db.manager, user, id);
    order.items = await this.db
      .getRepository(OrderItem)
      .findBy({ orderId: id });
    const history = await this.db
      .getRepository(OrderStatusHistory)
      .find({ where: { orderId: id }, order: { createdAt: "ASC" } });
    return { ...this.serialize(order, user), history };
  }
  async change(user: User, id: string, dto: StatusDto) {
    const result = await this.db.transaction(async (manager) => {
      const order = await this.owned(manager, user, id, true);
      assertTransition(user.role, order.status, dto.status);
      if (cancelled.includes(dto.status) && !dto.reason?.trim())
        throw new ForbiddenException("Please provide a cancellation reason.");
      if (
        dto.status === S.DELIVERED &&
        ![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)
      ) {
        if (
          !order.deliveryPinExpiresAt ||
          order.deliveryPinExpiresAt < new Date() ||
          order.deliveryPinAttempts >= 5
        )
          throw new ForbiddenException(
            "Delivery confirmation expired or locked. Contact support.",
          );
        if (!dto.pin || hashPin(dto.pin) !== order.deliveryPinHash) {
          order.deliveryPinAttempts += 1;
          await manager.save(order);
          return { invalidPin: true as const };
        }
      }
      if (cancelled.includes(dto.status)) {
        if (order.cashCollectedAt)
          throw new ForbiddenException(
            "Collected cash requires a support-reviewed refund.",
          );
        const items = await manager.findBy(OrderItem, { orderId: id });
        for (const item of [...items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await manager
            .createQueryBuilder()
            .update(Product)
            .set({ stock: () => '"stock" + :quantity' })
            .where("id = :id AND stock IS NOT NULL", {
              id: item.productId,
              quantity: item.quantity,
            })
            .execute();
        }
      }
      order.status = dto.status;
      await manager.save(order);
      await manager.save(OrderStatusHistory, {
        orderId: id,
        status: dto.status,
        actorId: user.id,
        reason: dto.reason,
      });
      await audit(manager, user.id, "ORDER_STATUS", "Order", id, {
        status: dto.status,
        reason: dto.reason,
      });
      const vendor = await manager.findOneByOrFail(Vendor, {
        id: order.vendorId,
      });
      await notify(manager, order.studentId, order, "Order updated");
      if (user.id !== vendor.ownerId)
        await notify(manager, vendor.ownerId, order, "Order updated");
      return { order };
    });
    if ("invalidPin" in result)
      throw new ForbiddenException("Incorrect delivery PIN.");
    return this.serialize(result.order, user);
  }
  async collect(user: User, id: string, dto: CashDto) {
    return this.db.transaction(async (manager) => {
      if (user.role !== UserRole.VENDOR) throw new ForbiddenException();
      const order = await this.owned(manager, user, id, true);
      if (
        order.paymentMethod !== "COD" ||
        ![S.OUT_FOR_DELIVERY, S.DELIVERED].includes(order.status)
      )
        throw new ForbiddenException(
          "Cash can only be recorded during or after delivery.",
        );
      if (dto.amountPaise !== order.totalPaise)
        throw new ForbiddenException(
          "Collected cash must match the order total.",
        );
      if (!order.cashCollectedAt) {
        order.cashCollectedAt = new Date();
        order.cashCollectedBy = user.id;
        order.cashCollectedPaise = dto.amountPaise;
        order.paymentStatus = PaymentStatus.SUCCESS;
        await manager.save(order);
        await audit(manager, user.id, "COD_COLLECTED", "Order", id, {
          amountPaise: dto.amountPaise,
        });
        await notify(
          manager,
          order.studentId,
          order,
          "Cash collection recorded",
        );
      }
      return this.serialize(order, user);
    });
  }
}
