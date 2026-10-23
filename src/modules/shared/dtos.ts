import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
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
  ValidateNested,
} from "class-validator";
import {
  OrderStatus,
  RecordStatus,
  UserRole,
  VendorStatus,
} from "../../platform/entities";

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
export class RegisterDto extends LoginDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsUUID() universityId!: string;
  @IsUUID() campusId!: string;
  @IsString() @Matches(/^\d{10}$/) phone!: string;
  @IsString() @Matches(/^\d{6}$/) otp!: string;
  @IsString() @MinLength(20) @MaxLength(2000) otpChallenge!: string;
}
export class RegistrationOtpRequestDto {
  @IsString() @Matches(/^\d{10}$/) phone!: string;
  @IsIn(["STUDENT", "VENDOR"])
  role!: "STUDENT" | "VENDOR";
}
export class VendorRegisterDto extends RegisterDto {
  @IsString() @MinLength(2) @MaxLength(120) shopName!: string;
  @IsString() @MinLength(5) @MaxLength(500) address!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
// Administrators create a vendor record; they do not complete the public OTP flow
// and never choose an owner's password. The owner sets a password through recovery.
export class AdminVendorCreateDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\d{10}$/) phone!: string;
  @IsUUID() universityId!: string;
  @IsUUID() campusId!: string;
  @IsString() @MinLength(2) @MaxLength(120) shopName!: string;
  @IsString() @MinLength(5) @MaxLength(500) address!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class ProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) photo?: string;
}
export class PasswordDto {
  @IsString() @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}
export class PasswordResetRequestDto {
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/) phone?: string;
}
export class PasswordResetConfirmDto extends PasswordResetRequestDto {
  @IsString() @Matches(/^\d{6}$/) otp!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}
export class AdminPasswordResetDto {
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}
export class PageDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional()
  @IsIn(["NAME", "PRICE_ASC", "PRICE_DESC", "NEWEST", "TOP_RATED"])
  sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000000)
  maxPricePaise?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean()
  vegetarian?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean()
  openOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() universityId?: string;
  @IsOptional() @IsUUID() campusId?: string;
}
export class AddressDto {
  @IsString() @MinLength(1) @MaxLength(60) label!: string;
  @IsString() @MinLength(2) @MaxLength(100) building!: string;
  @IsString() @MinLength(3) @MaxLength(300) details!: string;
  @IsString() @Matches(/^\d{10}$/) phone!: string;
}
export class ProductDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsInt() @Min(1) @Max(10000000) pricePaise!: number;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) image?: string;
  @IsOptional() @IsBoolean() vegetarian?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) stock?: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class OperatingHoursDto {
  @IsBoolean() alwaysOpen!: boolean;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) open!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) close!: string;
}
export class VendorProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) logo?: string;
  @IsOptional() @IsString() @MaxLength(500) coverImage?: string;
  @IsOptional() @IsEnum(VendorStatus) operatingStatus?: VendorStatus;
  @IsOptional() @IsInt() @Min(1) @Max(180) preparationMinutes?: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => OperatingHoursDto)
  operatingHours?: OperatingHoursDto;
}
export class OrderLineDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(50) quantity!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class OrderDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]{3,30}$/) couponCode?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000000) expectedTotalPaise?: number;
  @IsUUID() vendorId!: string;
  @IsUUID() addressId!: string;
  @IsIn(["COD"]) paymentMethod!: "COD";
  @IsUUID() idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}
export class StatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) pin?: string;
}
export class CashDto {
  @IsInt() @Min(1) @Max(100000000) amountPaise!: number;
}
export class UniversityDto {
  @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) city?: string;
  @IsOptional() @IsIn(["CENTRAL", "STATE", "PRIVATE", "DEEMED", "OTHER"]) type?: string;
}
export class CampusDto {
  @IsUUID() universityId!: string;
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class CampusPolicyDto {
  @IsBoolean() serviceEnabled!: boolean;
  @IsBoolean() codEnabled!: boolean;
  @IsInt() @Min(0) @Max(100000) deliveryFeePaise!: number;
  @IsInt() @Min(0) @Max(100000) platformFeePaise!: number;
  @IsInt() @Min(1) @Max(10000000) codLimitPaise!: number;
}
export class UserReviewDto {
  @IsBoolean() verified!: boolean;
  @IsEnum(RecordStatus) status!: RecordStatus;
}
export class UserAccountUpdateDto extends UserReviewDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\d{10}$/) phone!: string;
}
export class VendorReviewDto {
  @IsIn(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]) approvalStatus!: string;
  @IsEnum(RecordStatus) status!: RecordStatus;
  @IsInt() @Min(0) @Max(10000) commissionRateBps!: number;
  @IsBoolean() codEnabled!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reviewReason?: string;
}
export class CategoryDto {
  @IsUUID() universityId!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
}
export class AdminCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) image?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class ActiveDto {
  @IsBoolean() active!: boolean;
}
export class AdminAccountDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\d{10}$/) phone!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsIn([UserRole.ADMIN, UserRole.SUPER_ADMIN]) role?: UserRole;
}
export class AdminAccountUpdateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/) phone?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) newPassword?: string;
  @IsOptional() @IsIn([UserRole.ADMIN, UserRole.SUPER_ADMIN]) role?: UserRole;
}
export class AdminProductDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) image?: string;
  @IsOptional() @IsBoolean() vegetarian?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(10000000) pricePaise?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) stock?: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class AdminCreateProductDto extends ProductDto {
  @IsUUID() vendorId!: string;
}
export class RecordStatusDto {
  @IsEnum(RecordStatus) status!: RecordStatus;
}
export class SettingDto {
  @IsIn(["announcement", "supportEmail", "carouselImages"])
  key!: string;
  @IsString() @MinLength(1) @MaxLength(6000) value!: string;
}
export class DeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @IsIn(["ANDROID", "IOS"]) platform!: string;
}
export class TicketDto {
  @IsString() @MinLength(3) @MaxLength(150) subject!: string;
  @IsString() @MinLength(10) @MaxLength(3000) message!: string;
}
export class TicketReplyDto {
  @IsIn(["OPEN", "RESOLVED"]) status!: string;
  @IsString() @MinLength(1) @MaxLength(3000) reply!: string;
}
