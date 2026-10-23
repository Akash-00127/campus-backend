import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity, User, Campus } from "../../platform/entities";

@Entity("addresses")
export class Address extends BaseEntity {
  @Index() @Column({ type: "uuid" }) userId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user!: User;
  @Index() @Column({ type: "uuid" }) campusId!: string;
  @ManyToOne(() => Campus, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "campusId" })
  campus!: Campus;
  @Column() label!: string;
  @Column() building!: string;
  @Column() details!: string;
  @Column() phone!: string;
}

@Entity("notifications")
export class Notification extends BaseEntity {
  @Index() @Column({ type: "uuid" }) userId!: string;
  @Column() title!: string;
  @Column() body!: string;
  @Column({ type: "uuid", nullable: true }) orderId?: string;
  @Column({ default: false }) read!: boolean;
  @Index() @Column({ default: "PENDING" }) pushStatus!: string;
  @Column({ default: 0 }) attempts!: number;
  @Column({ type: "timestamp with time zone", nullable: true })
  nextAttemptAt?: Date;
}

@Entity("device_tokens")
export class DeviceToken extends BaseEntity {
  @Index() @Column({ type: "uuid" }) userId!: string;
  @Index({ unique: true }) @Column() token!: string;
  @Column({ default: "ANDROID" }) platform!: string;
}

@Entity("app_settings")
export class AppSetting extends BaseEntity {
  @Index({ unique: true }) @Column() key!: string;
  @Column() value!: string;
}

@Entity("support_tickets")
export class SupportTicket extends BaseEntity {
  @Index() @Column({ type: "uuid" }) userId!: string;
  @Column() subject!: string;
  @Column() message!: string;
  @Column({ default: "OPEN" }) status!: string;
  @Column({ nullable: true }) reply?: string;
}
