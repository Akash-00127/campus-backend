export const Role = {
  ADMIN: "ADMIN",
  STUDENT: "STUDENT",
  SHOPKEEPER: "SHOPKEEPER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const OrderStatus = {
  PLACED: "PLACED",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PREPARING",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
