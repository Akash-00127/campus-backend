import "dotenv/config";
import { Review } from '../modules/commerce/commerce';
import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  AuditLog,
  Campus,
  Category,
  Coupon,
  Order,
  OrderItem,
  OrderStatusHistory,
  Product,
  University,
  User,
  Vendor,
} from "../platform/entities";
import {
  Address,
  AppSetting,
  DeviceToken,
  Notification,
  SupportTicket,
} from "../modules/shared/entities";
export const entities = [
  Review,
  University,
  Campus,
  User,
  Vendor,
  Category,
  Product,
  Coupon,
  Order,
  OrderItem,
  OrderStatusHistory,
  AuditLog,
  Address,
  AppSetting,
  DeviceToken,
  Notification,
  SupportTicket,
];
export const dataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities,
  synchronize: false,
  migrations: [__dirname + "/migrations/*.js"],
  logging: false,
});
