import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createSign } from "node:crypto";
import { DataSource, LessThanOrEqual, IsNull } from "typeorm";
import { DeviceToken, Notification, SupportTicket } from "../shared/entities";
import { User } from "../../platform/entities";
import { DeviceDto, TicketDto } from "../shared/dtos";

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private access?: { token: string; expires: number };
  private readonly logger = new Logger("Notifications");
  constructor(private readonly db: DataSource) {}
  onModuleInit() {
    if (
      process.env.FCM_PROJECT_ID &&
      process.env.FCM_CLIENT_EMAIL &&
      process.env.FCM_PRIVATE_KEY
    )
      this.timer = setInterval(() => void this.deliver(), 10000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  inbox(user: User) {
    return this.db
      .getRepository(Notification)
      .find({
        where: { userId: user.id },
        order: { createdAt: "DESC" },
        take: 100,
        select: {
          id: true,
          title: true,
          body: true,
          orderId: true,
          read: true,
          createdAt: true,
        },
      });
  }
  async read(user: User, id: string) {
    await this.db
      .getRepository(Notification)
      .update({ id, userId: user.id }, { read: true });
    return { ok: true };
  }
  async register(user: User, dto: DeviceDto) {
    await this.db
      .getRepository(DeviceToken)
      .upsert({ ...dto, userId: user.id }, ["token"]);
    return { ok: true };
  }
  tickets(user: User) {
    return this.db
      .getRepository(SupportTicket)
      .find({
        where: { userId: user.id },
        order: { createdAt: "DESC" },
        take: 100,
      });
  }
  ticket(user: User, dto: TicketDto) {
    return this.db
      .getRepository(SupportTicket)
      .save({ ...dto, userId: user.id });
  }
  private async token() {
    if (this.access && this.access.expires > Date.now() + 60000)
      return this.access.token;
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: process.env.FCM_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(process.env.FCM_PRIVATE_KEY!.replace(/\\n/g, "\n"), "base64url")}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("FCM authentication failed");
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.access = {
      token: body.access_token,
      expires: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }
  async deliver() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.transaction(async (manager) => {
        const item = await manager
          .getRepository(Notification)
          .createQueryBuilder("n")
          .where("n.pushStatus = :s", { s: "PENDING" })
          .andWhere("(n.nextAttemptAt IS NULL OR n.nextAttemptAt <= :now)", {
            now: new Date(),
          })
          .orderBy("n.createdAt", "ASC")
          .setLock("pessimistic_write")
          .setOnLocked("skip_locked")
          .getOne();
        if (!item) return;
        const tokens = await manager.findBy(DeviceToken, {
          userId: item.userId,
        });
        if (!tokens.length) {
          item.pushStatus = "INBOX_ONLY";
          await manager.save(item);
          return;
        }
        try {
          const token = await this.token();
          for (const device of tokens) {
            const response = await fetch(
              `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(process.env.FCM_PROJECT_ID!)}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: device.token,
                    notification: { title: item.title, body: item.body },
                    data: {
                      notificationId: item.id,
                      ...(item.orderId ? { orderId: item.orderId } : {}),
                    },
                  },
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            if (!response.ok) {
              const body = (await response.json()) as {
                error?: { details?: { errorCode?: string }[] };
              };
              if (
                body.error?.details?.some((d) => d.errorCode === "UNREGISTERED")
              )
                await manager.delete(DeviceToken, { id: device.id });
              else throw new Error("FCM send failed");
            }
          }
          item.pushStatus = "SENT";
        } catch {
          item.attempts += 1;
          item.pushStatus = item.attempts >= 5 ? "FAILED" : "PENDING";
          item.nextAttemptAt = new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** item.attempts),
          );
        }
        await manager.save(item);
      });
    } catch {
      this.logger.warn("Notification worker failed; will retry.");
    } finally {
      this.busy = false;
    }
  }
}
