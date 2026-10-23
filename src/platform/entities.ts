import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

export enum UserRole {
  STUDENT = "STUDENT",
  VENDOR = "VENDOR",
  DELIVERY_PARTNER = "DELIVERY_PARTNER",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}
export enum RecordStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}
export enum VendorStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
  BUSY = "BUSY",
  PAUSED = "PAUSED",
  OFFLINE = "OFFLINE",
}
export enum OrderStatus {
  PENDING_PAYMENT = "PENDING_PAYMENT",
  PAID = "PAID",
  PLACED = "PLACED",
  VENDOR_ACCEPTED = "VENDOR_ACCEPTED",
  PREPARING = "PREPARING",
  READY_FOR_PICKUP = "READY_FOR_PICKUP",
  ASSIGNED_TO_DELIVERY = "ASSIGNED_TO_DELIVERY",
  PICKED_UP = "PICKED_UP",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  CANCELLED_BY_USER = "CANCELLED_BY_USER",
  CANCELLED_BY_VENDOR = "CANCELLED_BY_VENDOR",
  CANCELLED_BY_ADMIN = "CANCELLED_BY_ADMIN",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  REFUND_PENDING = "REFUND_PENDING",
  REFUNDED = "REFUNDED",
}
export enum PaymentStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  REFUND_PENDING = "REFUND_PENDING",
  REFUNDED = "REFUNDED",
}

export abstract class BaseEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity("universities")
export class University extends BaseEntity {
  @Index({ unique: true }) @Column() slug!: string;
  @Column() name!: string;
  @Column({ nullable: true }) officialName?: string;
  @Column({ default: "OTHER" }) type!: string;
  @Column() state!: string;
  @Column() city!: string;
  @Column({ nullable: true }) address?: string;
  @Column({ nullable: true }) logo?: string;
  @Column({ nullable: true }) website?: string;
  @Column({ type: "enum", enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;
  @Column({ default: false }) verified!: boolean;
  @OneToMany(() => Campus, (campus) => campus.university) campuses!: Campus[];
}

@Entity("campuses")
@Unique(["universityId", "slug"])
export class Campus extends BaseEntity {
  @Index() @Column({ type: "uuid" }) universityId!: string;
  @ManyToOne(() => University, (university) => university.campuses, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "universityId" })
  university!: University;
  @Column() slug!: string;
  @Column() name!: string;
  @Column({ nullable: true }) address?: string;
  @Column({ type: "enum", enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;
  @Column({ default: 15 }) defaultDeliveryMinutes!: number;
  @Column({ default: false }) serviceEnabled!: boolean;
  @Column({ default: true }) codEnabled!: boolean;
  @Column({ type: "int", default: 0 }) deliveryFeePaise!: number;
  @Column({ type: "int", default: 0 }) platformFeePaise!: number;
  @Column({ type: "int", default: 100000 }) codLimitPaise!: number;
}

@Entity("users")
export class User extends BaseEntity {
  @Index({ unique: true }) @Column() email!: string;
  @Column({ select: false }) passwordHash!: string;
  @Column() name!: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ type: "enum", enum: UserRole, default: UserRole.STUDENT })
  role!: UserRole;
  @Index() @Column({ type: "uuid", nullable: true }) universityId?: string;
  @Index() @Column({ type: "uuid", nullable: true }) campusId?: string;
  @ManyToOne(() => University, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "universityId" })
  university?: University;
  @ManyToOne(() => Campus, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "campusId" })
  campus?: Campus;
  @Column({ type: "enum", enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;
  @Column({ default: false }) verified!: boolean;
  @Column({ nullable: true, select: false }) refreshTokenHash?: string;
  @Column({ nullable: true }) photo?: string;
  @Column({ type: "int", default: 0 }) tokenVersion!: number;
}

@Entity("vendors")
export class Vendor extends BaseEntity {
  @Index({ unique: true }) @Column() slug!: string;
  @Index() @Column({ type: "uuid" }) universityId!: string;
  @Index() @Column({ type: "uuid" }) campusId!: string;
  @Index() @Column({ type: "uuid" }) ownerId!: string;
  @ManyToOne(() => University, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "universityId" })
  university!: University;
  @ManyToOne(() => Campus, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "campusId" })
  campus!: Campus;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "ownerId" })
  owner!: User;
  @Column() name!: string;
  @Column({ nullable: true }) description?: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ nullable: true }) logo?: string;
  @Column({ nullable: true }) coverImage?: string;
  @Column({ nullable: true }) address?: string;
  @Column({ type: "enum", enum: VendorStatus, default: VendorStatus.CLOSED })
  operatingStatus!: VendorStatus;
  @Column({ type: "enum", enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;
  @Column({ default: false }) verified!: boolean;
  @Column({ default: 15 }) preparationMinutes!: number;
  @Column({ default: 20, type: "int" }) commissionRateBps!: number;
  @Column({ type: "jsonb", nullable: true }) operatingHours?: Record<
    string,
    unknown
  >;
  @Column({ default: 0 }) maxConcurrentOrders!: number;
  @Column({ default: "PENDING" }) approvalStatus!: string;
  @Column({ nullable: true }) reviewReason?: string;
  @Column({ default: true }) codEnabled!: boolean;
}

@Entity("categories")
@Unique(["universityId", "name"])
export class Category extends BaseEntity {
  @Index() @Column({ type: "uuid" }) universityId!: string;
  @Column() name!: string;
  @Column({ nullable: true }) image?: string;
  @Column({ default: true }) active!: boolean;
}

@Entity("products")
export class Product extends BaseEntity {
  @Index() @Column({ type: "uuid" }) vendorId!: string;
  @Index() @Column({ type: "uuid" }) universityId!: string;
  @Index() @Column({ type: "uuid" }) campusId!: string;
  @Index() @Column({ type: "uuid", nullable: true }) categoryId?: string;
  @ManyToOne(() => Vendor, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendorId" })
  vendor!: Vendor;
  @ManyToOne(() => Category, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category?: Category;
  @Column() name!: string;
  @Column({ nullable: true }) description?: string;
  @Column({ type: "int" }) pricePaise!: number;
  @Column({ type: "int", nullable: true }) compareAtPricePaise?: number;
  @Column({ nullable: true }) image?: string;
  @Column({ default: false }) vegetarian!: boolean;
  @Column({ default: true }) available!: boolean;
  @Column({ default: true }) active!: boolean;
  @Column({ type: "jsonb", nullable: true }) addOns?: unknown[];
  @Column({ type: "jsonb", nullable: true }) variants?: unknown[];
  @Column({ type: "int", nullable: true }) stock!: number | null;
}

@Entity("coupons")
export class Coupon extends BaseEntity {
  @Index({ unique: true }) @Column() code!: string;
  @Column() type!: "PERCENTAGE" | "FIXED";
  @Column({ type: "int" }) value!: number;
  @Column({ type: "int", default: 0 }) minOrderPaise!: number;
  @Column({ type: "int", nullable: true }) maxDiscountPaise?: number;
  @Index() @Column({ type: "uuid", nullable: true }) universityId?: string;
  @Index() @Column({ type: "uuid", nullable: true }) campusId?: string;
  @Index() @Column({ type: "uuid", nullable: true }) vendorId?: string;
  @Column({ type: "timestamp with time zone", nullable: true }) startsAt?: Date;
  @Column({ type: "timestamp with time zone", nullable: true }) endsAt?: Date;
  @Column({ default: true }) active!: boolean;
  @Column({ default: 0 }) usageLimit!: number;
  @Column({ default: 1 }) perUserLimit!: number;
}

@Entity("orders")
@Unique(["studentId", "idempotencyKey"])
export class Order extends BaseEntity {
  @Index({ unique: true }) @Column() code!: string;
  @Index() @Column({ type: "uuid" }) studentId!: string;
  @Index() @Column({ type: "uuid" }) vendorId!: string;
  @Index() @Column({ type: "uuid" }) universityId!: string;
  @Index() @Column({ type: "uuid" }) campusId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "studentId" })
  student!: User;
  @ManyToOne(() => Vendor, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "vendorId" })
  vendor!: Vendor;
  @Column({
    type: "enum",
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status!: OrderStatus;
  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;
  @Column() paymentMethod!: string;
  @Column({ type: "int" }) subtotalPaise!: number;
  @Column({ type: "int", default: 0 }) discountPaise!: number;
  @Column({ type: "int", default: 0 }) deliveryFeePaise!: number;
  @Column({ type: "int", default: 0 }) platformFeePaise!: number;
  @Column({ type: "int", default: 0 }) taxPaise!: number;
  @Column({ type: "int" }) totalPaise!: number;
  @Column({ type: "int" }) commissionPaise!: number;
  @Column() deliveryAddress!: string;
  @Column({ nullable: true }) deliveryNote?: string;
  @Column() idempotencyKey!: string;
  @Column({ nullable: true }) couponCode?: string;
  @Column({ type: "timestamp with time zone", nullable: true })
  estimatedReadyAt?: Date;
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];
  @Column({ nullable: true }) requestHash?: string;
  @Column({ nullable: true, select: false }) deliveryPinHash?: string;
  @Column({ type: "int", default: 0 }) deliveryPinAttempts!: number;
  @Column({ type: "timestamp with time zone", nullable: true })
  deliveryPinExpiresAt?: Date;
  @Column({ type: "uuid", nullable: true }) cashCollectedBy?: string;
  @Column({ type: "timestamp with time zone", nullable: true })
  cashCollectedAt?: Date;
  @Column({ type: "int", nullable: true }) cashCollectedPaise?: number;
}

@Entity("order_items")
export class OrderItem extends BaseEntity {
  @Index() @Column({ type: "uuid" }) orderId!: string;
  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order!: Order;
  @Column({ type: "uuid" }) productId!: string;
  @Column() name!: string;
  @Column({ type: "int" }) unitPricePaise!: number;
  @Column({ type: "int" }) quantity!: number;
  @Column({ type: "jsonb", nullable: true }) addOns?: unknown[];
  @Column({ nullable: true }) note?: string;
}

@Entity("order_status_history")
export class OrderStatusHistory extends BaseEntity {
  @Index() @Column({ type: "uuid" }) orderId!: string;
  @Column({ type: "enum", enum: OrderStatus }) status!: OrderStatus;
  @Column({ type: "uuid", nullable: true }) actorId?: string;
  @Column({ nullable: true }) reason?: string;
}
@Entity("audit_logs")
export class AuditLog extends BaseEntity {
  @Index() @Column({ type: "uuid", nullable: true }) actorId?: string;
  @Index() @Column() action!: string;
  @Column() entity!: string;
  @Index() @Column() entityId!: string;
  @Column({ type: "jsonb", nullable: true }) before?: unknown;
  @Column({ type: "jsonb", nullable: true }) after?: unknown;
  @Column({ nullable: true }) ip?: string;
}
