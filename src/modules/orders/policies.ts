import { ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { OrderStatus as S, UserRole as R } from "../../platform/entities";
import type { OrderDto } from "../shared/dtos";
export const vendorTransitions: Partial<Record<S, S[]>> = {
  [S.PLACED]: [S.VENDOR_ACCEPTED, S.CANCELLED_BY_VENDOR],
  [S.VENDOR_ACCEPTED]: [S.PREPARING, S.CANCELLED_BY_VENDOR],
  [S.PREPARING]: [S.READY_FOR_PICKUP],
  [S.READY_FOR_PICKUP]: [S.OUT_FOR_DELIVERY],
  [S.OUT_FOR_DELIVERY]: [S.DELIVERED],
};
export function assertTransition(role: R, from: S, to: S) {
  const allowed =
    role === R.STUDENT
      ? from === S.PLACED && to === S.CANCELLED_BY_USER
      : role === R.VENDOR
        ? vendorTransitions[from]?.includes(to)
        : [R.ADMIN, R.SUPER_ADMIN].includes(role) &&
          (([
            S.PLACED,
            S.VENDOR_ACCEPTED,
            S.PREPARING,
            S.READY_FOR_PICKUP,
          ].includes(from) &&
            to === S.CANCELLED_BY_ADMIN) ||
            (from === S.OUT_FOR_DELIVERY && to === S.DELIVERED));
  if (!allowed)
    throw new ForbiddenException(
      "Order cannot move to that status for your role.",
    );
}
export function fingerprint(dto: OrderDto) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        vendorId: dto.vendorId,
        addressId: dto.addressId,
        paymentMethod: dto.paymentMethod,
        couponCode: dto.couponCode || "",
        items: [...dto.items]
          .sort((a, b) => a.productId.localeCompare(b.productId))
          .map((x) => ({
            productId: x.productId,
            quantity: x.quantity,
            note: x.note || "",
          })),
      }),
    )
    .digest("hex");
}
export function calculatePrice(
  subtotal: number,
  delivery: number,
  platform: number,
  commissionBps: number,
) {
  const total = subtotal + delivery + platform;
  if (
    ![subtotal, delivery, platform, total, commissionBps].every(
      Number.isSafeInteger,
    ) ||
    subtotal < 1 ||
    delivery < 0 ||
    platform < 0 ||
    total > 100000000 ||
    commissionBps < 0 ||
    commissionBps > 10000
  )
    throw new ForbiddenException("Invalid order pricing.");
  return {
    subtotalPaise: subtotal,
    deliveryFeePaise: delivery,
    platformFeePaise: platform,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: total,
    commissionPaise: Math.floor((subtotal * commissionBps) / 10000),
  };
}
