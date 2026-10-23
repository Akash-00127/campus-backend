import { Vendor, VendorStatus } from "../../platform/entities";
export type ShopHours = { alwaysOpen: boolean; open: string; close: string };
export function acceptsOrders(
  vendor: Pick<Vendor, "operatingStatus" | "operatingHours">,
  now = new Date(),
): boolean {
  if (vendor.operatingStatus !== VendorStatus.OPEN) return false;
  const hours = vendor.operatingHours as ShopHours | undefined;
  if (!hours || hours.alwaysOpen) return true;
  if (!/^\d{2}:\d{2}$/.test(hours.open) || !/^\d{2}:\d{2}$/.test(hours.close))
    return false;
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  // Overnight windows such as 20:00–03:00 include the next morning.
  return hours.open < hours.close
    ? local >= hours.open && local < hours.close
    : hours.open > hours.close
      ? local >= hours.open || local < hours.close
      : false;
}
