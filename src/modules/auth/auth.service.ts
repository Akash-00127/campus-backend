import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  Campus,
  RecordStatus,
  University,
  User,
  UserRole,
  Vendor,
} from "../../platform/entities";
import {
  LoginDto,
  AdminPasswordResetDto,
  AdminVendorCreateDto,
  PasswordDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  ProfileDto,
  RegistrationOtpRequestDto,
  RegisterDto,
  VendorRegisterDto,
} from "../shared/dtos";
import { DeviceToken } from "../shared/entities";
import { audit } from "../catalog/catalog.service";

export function publicUser(user: User) {
  const { passwordHash, refreshTokenHash, tokenVersion, ...safe } = user;
  return safe;
}
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
  ) {}
  private response(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, version: user.tokenVersion }),
      user: publicUser(user),
    };
  }
  private otpHash(otp: string) {
    return createHash("sha256").update(otp).digest("hex");
  }
  async requestRegistrationOtp(dto: RegistrationOtpRequestDto) {
    const phone = dto.phone.trim();
    if (await this.db.getRepository(User).existsBy({ phone }))
      throw new ConflictException("An account with this phone number already exists. Please sign in instead.");
    const localDemoOtp = process.env.LOCAL_DEMO_OTP === "true";
    if (process.env.NODE_ENV === "production" && !localDemoOtp)
      throw new ForbiddenException("Registration OTP delivery is not configured.");
    const otp = process.env.DEMO_REGISTRATION_OTP || String(randomInt(100000, 1000000));
    const challenge = this.jwt.sign(
      { purpose: "REGISTRATION_OTP", phone, role: dto.role, otpHash: this.otpHash(otp) },
      { expiresIn: "10m", secret: process.env.REGISTRATION_OTP_SECRET || process.env.JWT_SECRET },
    );
    // Replace the development return value with the configured SMS provider.
    // The signed short-lived challenge keeps the code bound to this phone.
    return {
      message: "Verification code generated.",
      challenge,
      expiresInSeconds: 600,
      ...(process.env.NODE_ENV !== "production" || localDemoOtp ? { demoOtp: otp } : {}),
    };
  }
  private verifyRegistrationOtp(dto: RegisterDto | VendorRegisterDto, vendor: boolean) {
    try {
      const claim = this.jwt.verify<{ purpose?: string; phone?: string; role?: string; otpHash?: string }>(dto.otpChallenge, {
        secret: process.env.REGISTRATION_OTP_SECRET || process.env.JWT_SECRET,
      });
      if (
        claim.purpose !== "REGISTRATION_OTP" ||
        claim.phone !== dto.phone.trim() ||
        claim.role !== (vendor ? "VENDOR" : "STUDENT") ||
        claim.otpHash !== this.otpHash(dto.otp)
      )
        throw new ForbiddenException("The verification code is incorrect or expired.");
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException("The verification code is incorrect or expired.");
    }
  }
  async register(
    dto: RegisterDto | VendorRegisterDto,
    vendor = false,
    actorId?: string,
  ) {
    if (!actorId) this.verifyRegistrationOtp(dto, vendor);
    const email = dto.email.trim().toLowerCase();
    const campus = await this.db.getRepository(Campus).findOneBy({
      id: dto.campusId,
      universityId: dto.universityId,
      status: RecordStatus.ACTIVE,
    });
    const university = await this.db
      .getRepository(University)
      .findOneBy({ id: dto.universityId, status: RecordStatus.ACTIVE });
    if (!campus || !university)
      throw new ForbiddenException(
        "Select an active university and matching campus.",
      );
    const hash = await bcrypt.hash(dto.password, 8);
    try {
      const user = await this.db.transaction(async (manager) => {
        if (await manager.existsBy(User, { phone: dto.phone.trim() }))
          throw new ConflictException("An account with this phone number already exists. Please sign in instead.");
        const saved = await manager.save(
          User,
          manager.create(User, {
            email,
            passwordHash: hash,
            name: dto.name.trim(),
            phone: dto.phone,
            universityId: dto.universityId,
            campusId: dto.campusId,
            role: vendor ? UserRole.VENDOR : UserRole.STUDENT,
            // Students select a campus at registration and can order immediately.
            // Vendor approval remains a separate operational control.
            verified: !vendor,
          }),
        );
        if (vendor) {
          const application = dto as VendorRegisterDto;
          await manager.save(
            Vendor,
            manager.create(Vendor, {
              ownerId: saved.id,
              name: application.shopName.trim(),
              slug: `shop-${randomUUID()}`,
              universityId: dto.universityId,
              campusId: dto.campusId,
              address: application.address,
              phone: dto.phone,
              description: application.description,
              approvalStatus: "PENDING",
              commissionRateBps: 0,
            }),
          );
        }
        if (actorId) {
          await audit(
            manager,
            actorId,
            "VENDOR_ACCOUNT_CREATED",
            "User",
            saved.id,
            {
              universityId: saved.universityId,
              campusId: saved.campusId,
            },
          );
        }
        return saved;
      });
      return this.response(user);
    } catch (error: any) {
      if (error.code === "23505")
        throw new ConflictException(
          "An account with this email already exists.",
        );
      throw error;
    }
  }
  async createVendorForAdmin(dto: AdminVendorCreateDto, actorId: string) {
    // Admins create an owner record but never choose or receive that owner's
    // password. The vendor completes access through Forgot Password instead.
    const registration: VendorRegisterDto = {
      ...dto,
      password: `${randomUUID()}-${randomUUID()}`,
      otp: "000000",
      otpChallenge: "admin-created-vendor-account",
    };
    return this.register(registration, true, actorId);
  }

  async login(dto: LoginDto) {
    const user = await this.db
      .getRepository(User)
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where("u.email = :email", { email: dto.email.trim().toLowerCase() })
      .getOne();
    if (
      !user ||
      user.status !== RecordStatus.ACTIVE ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException("Invalid email or password.");
    return this.response(user);
  }
  async me(user: User) {
    const [university, campus, vendor] = await Promise.all([
      user.universityId
        ? this.db.getRepository(University).findOneBy({ id: user.universityId })
        : null,
      user.campusId
        ? this.db.getRepository(Campus).findOneBy({ id: user.campusId })
        : null,
      user.role === UserRole.VENDOR
        ? this.db.getRepository(Vendor).findOneBy({ ownerId: user.id })
        : null,
    ]);
    return { ...publicUser(user), university, campus, vendor };
  }
  async profile(user: User, dto: ProfileDto) {
    await this.db.getRepository(User).update(user.id, dto);
    return this.me(
      await this.db.getRepository(User).findOneByOrFail({ id: user.id }),
    );
  }
  async password(user: User, dto: PasswordDto) {
    const stored = await this.db
      .getRepository(User)
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where("u.id = :id", { id: user.id })
      .getOneOrFail();
    if (!(await bcrypt.compare(dto.currentPassword, stored.passwordHash)))
      throw new ForbiddenException("Current password is incorrect.");
    const hash = await bcrypt.hash(dto.newPassword, 8);
    await this.db.transaction(async (manager) => {
      await manager.update(User, user.id, { passwordHash: hash });
      await manager.increment(User, { id: user.id }, "tokenVersion", 1);
      await manager.delete(DeviceToken, { userId: user.id });
    });
    return { message: "Password changed. Please sign in again." };
  }
  async requestPasswordReset(dto: PasswordResetRequestDto) {
    // A real deployment must replace this development bridge with an SMS or
    // email delivery provider. Never return OTPs in production responses.
    const user = await this.passwordResetUser(dto);
    if (process.env.NODE_ENV === "production")
      return { message: "If this account exists, reset instructions have been sent." };
    if (!user) throw new ForbiddenException("No active account was found for this email or mobile number.");
    return {
      message: "Demo verification code generated.",
      demoOtp: process.env.DEMO_PASSWORD_RESET_OTP || "123456",
    };
  }
  async confirmPasswordReset(dto: PasswordResetConfirmDto) {
    if (process.env.NODE_ENV === "production")
      throw new ForbiddenException("Password reset delivery is not configured.");
    if (dto.otp !== (process.env.DEMO_PASSWORD_RESET_OTP || "123456"))
      throw new ForbiddenException("The verification code is incorrect.");
    const user = await this.passwordResetUser(dto);
    if (!user) throw new ForbiddenException("No active account was found for this email or mobile number.");
    await this.setPassword(user.id, dto.newPassword);
    return { message: "Password reset. Please sign in with your new password." };
  }
  private passwordResetUser(dto: PasswordResetRequestDto) {
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();
    if (!email && !phone)
      throw new ForbiddenException("Enter the email address or mobile number used for your account.");
    const where = [
      ...(email ? [{ email, status: RecordStatus.ACTIVE }] : []),
      ...(phone ? [{ phone, status: RecordStatus.ACTIVE }] : []),
    ];
    return this.db.getRepository(User).findOne({ where });
  }
  async adminResetPassword(actor: User, id: string, dto: AdminPasswordResetDto) {
    const target = await this.db.getRepository(User).findOneBy({ id });
    if (!target) throw new ForbiddenException("User not found.");
    if (target.role === UserRole.SUPER_ADMIN)
      throw new ForbiddenException("A super administrator must reset their own password.");
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      ![UserRole.STUDENT, UserRole.VENDOR].includes(target.role)
    )
      throw new ForbiddenException("Only a super administrator can reset administrator passwords.");
    await this.setPassword(target.id, dto.newPassword);
    await this.db.transaction(async (manager) => {
      await audit(manager, actor.id, "ADMIN_PASSWORD_RESET", "User", target.id, {
        targetRole: target.role,
      });
    });
    return { id: target.id, message: "Password reset successfully." };
  }
  private async setPassword(userId: string, password: string) {
    const hash = await bcrypt.hash(password, 8);
    await this.db.transaction(async (manager) => {
      await manager.update(User, userId, { passwordHash: hash });
      await manager.increment(User, { id: userId }, "tokenVersion", 1);
      await manager.delete(DeviceToken, { userId });
    });
  }
  async logout(user: User) {
    await this.db.transaction(async (manager) => {
      await manager.increment(User, { id: user.id }, "tokenVersion", 1);
      await manager.delete(DeviceToken, { userId: user.id });
    });
    return { message: "Signed out on all devices." };
  }
}
