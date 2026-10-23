import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { User, UserRole as R } from "../platform/entities";
import { CurrentUser, JwtGuard, Roles, RolesGuard } from "./auth/access";
import { AuthService } from "./auth/auth.service";
import { CatalogService } from "./catalog/catalog.service";
import { OrdersService } from "./orders/orders.service";
import { AdminService } from "./admin/admin.service";
import { NotificationsService } from "./notifications/notifications.service";
import {
  ActiveDto,
  AdminAccountDto,
  AdminAccountUpdateDto,
  AdminPasswordResetDto,
  AdminCreateProductDto,
  AdminCategoryDto,
  AdminProductDto,
  AddressDto,
  CampusDto,
  CampusPolicyDto,
  CashDto,
  CategoryDto,
  DeviceDto,
  LoginDto,
  OrderDto,
  PageDto,
  PasswordDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  ProductDto,
  ProfileDto,
  RecordStatusDto,
  RegisterDto,
  RegistrationOtpRequestDto,
  SettingDto,
  StatusDto,
  TicketDto,
  TicketReplyDto,
  UniversityDto,
  UserReviewDto,
  UserAccountUpdateDto,
  AdminVendorCreateDto,
  VendorProfileDto,
  VendorRegisterDto,
  VendorReviewDto,
} from "./shared/dtos";
import { MediaService } from "./media/media.service";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly service: AuthService) {}
  @Post("login") @Throttle({ default: { limit: 10, ttl: 60000 } }) login(
    @Body() dto: LoginDto,
  ) {
    return this.service.login(dto);
  }
  @Post("register") @Throttle({ default: { limit: 5, ttl: 60000 } }) register(
    @Body() dto: RegisterDto,
  ) {
    return this.service.register(dto);
  }
  @Post("registration-otp/request")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  registrationOtp(@Body() dto: RegistrationOtpRequestDto) {
    return this.service.requestRegistrationOtp(dto);
  }
  @Post("vendor-register")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  vendor(@Body() dto: VendorRegisterDto) {
    return this.service.register(dto, true);
  }
  @Get("me") @UseGuards(JwtGuard) me(@CurrentUser() user: User) {
    return this.service.me(user);
  }
  @Patch("profile") @UseGuards(JwtGuard) profile(
    @CurrentUser() user: User,
    @Body() dto: ProfileDto,
  ) {
    return this.service.profile(user, dto);
  }
  @Post("password") @UseGuards(JwtGuard) password(
    @CurrentUser() user: User,
    @Body() dto: PasswordDto,
  ) {
    return this.service.password(user, dto);
  }
  @Post("password-reset/request")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  passwordResetRequest(@Body() dto: PasswordResetRequestDto) {
    return this.service.requestPasswordReset(dto);
  }
  @Post("password-reset/confirm")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  passwordResetConfirm(@Body() dto: PasswordResetConfirmDto) {
    return this.service.confirmPasswordReset(dto);
  }
  @Post("logout") @UseGuards(JwtGuard) logout(@CurrentUser() user: User) {
    return this.service.logout(user);
  }
}
@Controller("v1")
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  @Get("health") health() {
    return { status: "ok" };
  }
  @Get("universities") universities() {
    return this.service.universities();
  }
  @Get("universities/:id/campuses") campuses(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.campuses(id);
  }
  @Get("catalog") @UseGuards(JwtGuard, RolesGuard) @Roles(R.STUDENT) catalog(
    @CurrentUser() user: User,
    @Query() query: PageDto,
  ) {
    return this.service.catalog(user, query);
  }
  @Get("products/:id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(R.STUDENT)
  product(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.product(user, id);
  }
  @Get("addresses")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(R.STUDENT)
  addresses(@CurrentUser() user: User) {
    return this.service.addresses(user);
  }
  @Post("addresses") @UseGuards(JwtGuard, RolesGuard) @Roles(R.STUDENT) address(
    @CurrentUser() user: User,
    @Body() dto: AddressDto,
  ) {
    return this.service.addAddress(user, dto);
  }
}
@Controller("v1/orders")
@UseGuards(JwtGuard, RolesGuard)
@Roles(R.STUDENT, R.VENDOR)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}
  @Post() @Roles(R.STUDENT) create(
    @CurrentUser() user: User,
    @Body() dto: OrderDto,
  ) {
    return this.service.create(user, dto);
  }
  @Get() list(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.list(user, q);
  }
  @Get(":id") @Roles(R.STUDENT, R.VENDOR, R.ADMIN, R.SUPER_ADMIN) detail(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(user, id);
  }
  @Patch(":id/status")
  @Roles(R.STUDENT, R.VENDOR, R.ADMIN, R.SUPER_ADMIN)
  change(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.change(user, id, dto);
  }
  @Post(":id/cash") @Roles(R.VENDOR) cash(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CashDto,
  ) {
    return this.service.collect(user, id, dto);
  }
}
@Controller("v1/vendor")
@UseGuards(JwtGuard, RolesGuard)
@Roles(R.VENDOR)
export class VendorController {
  constructor(private readonly service: CatalogService) {}
  @Get("profile") profile(@CurrentUser() user: User) {
    return this.service.vendor(user);
  }
  @Patch("profile") update(
    @CurrentUser() user: User,
    @Body() dto: VendorProfileDto,
  ) {
    return this.service.vendorProfile(user, dto);
  }
  @Get("products") products(@CurrentUser() user: User) {
    return this.service.products(user);
  }
  @Post("products") create(@CurrentUser() user: User, @Body() dto: ProductDto) {
    return this.service.saveProduct(user, dto);
  }
  @Patch("products/:id") edit(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ProductDto,
  ) {
    return this.service.saveProduct(user, dto, id);
  }
}
@Controller("v1/admin")
@UseGuards(JwtGuard, RolesGuard)
@Roles(R.ADMIN, R.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly auth: AuthService,
    private readonly media: MediaService,
    private readonly orders: OrdersService,
  ) {}
  @Get("overview") overview() {
    return this.service.overview();
  }
  @Patch("orders/:id/status")
  updateOrderStatus(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: StatusDto,
  ) {
    return this.orders.change(u, id, d);
  }
  @Get("settings") settings() {
    return this.service.settings();
  }
  @Get("administrators")
  @Roles(R.SUPER_ADMIN)
  administrators(@Query() q: PageDto) {
    return this.service.list("administrators", q);
  }
  @Post("administrators")
  @Roles(R.SUPER_ADMIN)
  createAdministrator(
    @CurrentUser() u: User,
    @Body() d: AdminAccountDto,
  ) {
    return this.service.createAdministrator(u, d);
  }
  @Patch("administrators/:id")
  @Roles(R.SUPER_ADMIN)
  updateAdministrator(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AdminAccountUpdateDto,
  ) {
    return this.service.updateAdministrator(u, id, d);
  }
  @Delete("administrators/:id")
  @Roles(R.SUPER_ADMIN)
  removeAdministrator(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.removeAdministrator(u, id);
  }
  @Post("settings") setting(@CurrentUser() u: User, @Body() d: SettingDto) {
    return this.service.setting(u, d);
  }
  @Post("media")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 6_000_000 } }),
  )
  mediaUpload(
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.media.image(file);
  }
  @Get(":resource") list(
    @Param("resource") resource: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(resource, q);
  }
  @Post("universities") university(
    @CurrentUser() u: User,
    @Body() d: UniversityDto,
  ) {
    return this.service.createUniversity(u, d);
  }
  @Patch("universities/:id")
  updateUniversity(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UniversityDto,
  ) {
    return this.service.updateUniversity(u, id, d);
  }
  @Delete("universities/:id")
  deleteUniversity(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteUniversity(u, id);
  }
  @Post("vendors") createVendor(
    @CurrentUser() u: User,
    @Body() d: AdminVendorCreateDto,
  ) {
    return this.auth.createVendorForAdmin(d, u.id).then((result) => ({
      user: result.user,
      message: "Vendor created pending review. The owner can set their first password with Forgot Password.",
    }));
  }
  @Post("campuses") campus(@CurrentUser() u: User, @Body() d: CampusDto) {
    return this.service.createCampus(u, d);
  }
  @Patch("campuses/:id/policy") policy(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: CampusPolicyDto,
  ) {
    return this.service.campusPolicy(u, id, d);
  }
  @Patch("users/:id/review") user(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UserReviewDto,
  ) {
    return this.service.reviewUser(u, id, d);
  }
  @Patch("users/:id")
  updateUser(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UserAccountUpdateDto,
  ) {
    return this.service.updateUser(u, id, d);
  }
  @Post("users/:id/password")
  resetUserPassword(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AdminPasswordResetDto,
  ) {
    return this.auth.adminResetPassword(u, id, d);
  }
  @Patch("vendors/:id/review") vendor(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: VendorReviewDto,
  ) {
    return this.service.reviewVendor(u, id, d);
  }
  @Post("categories") category(@CurrentUser() u: User, @Body() d: CategoryDto) {
    return this.service.category(u, d);
  }
  @Patch("categories/:id") updateCategory(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AdminCategoryDto,
  ) {
    return this.service.updateCategory(u, id, d);
  }
  @Delete("categories/:id") removeCategory(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.removeCategory(u, id);
  }
  @Patch("products/:id/availability") product(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: ActiveDto,
  ) {
    return this.service.active(u, id, d.active);
  }
  @Patch("products/:id") updateProduct(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AdminProductDto,
  ) {
    return this.service.updateProduct(u, id, d);
  }
  @Post("products")
  createProduct(
    @CurrentUser() u: User,
    @Body() d: AdminCreateProductDto,
  ) {
    return this.service.createProduct(u, d);
  }
  @Delete("products/:id") removeProduct(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.removeProduct(u, id);
  }
  @Patch(":resource/:id/status") status(
    @CurrentUser() u: User,
    @Param("resource") resource: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: RecordStatusDto,
  ) {
    return this.service.recordStatus(u, resource, id, d.status);
  }
  @Patch("support/:id/reply") reply(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: TicketReplyDto,
  ) {
    return this.service.reply(u, id, d);
  }
}
@Controller("v1")
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get("notifications") inbox(@CurrentUser() u: User) {
    return this.service.inbox(u);
  }
  @Patch("notifications/:id/read") read(
    @CurrentUser() u: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.read(u, id);
  }
  @Post("notifications/devices") device(
    @CurrentUser() u: User,
    @Body() d: DeviceDto,
  ) {
    return this.service.register(u, d);
  }
  @Get("support") tickets(@CurrentUser() u: User) {
    return this.service.tickets(u);
  }
  @Post("support") ticket(@CurrentUser() u: User, @Body() d: TicketDto) {
    return this.service.ticket(u, d);
  }
}
