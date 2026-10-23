import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, In } from "typeorm";
import * as bcrypt from "bcrypt";
import { randomUUID } from 'node:crypto';
import { Review } from "../commerce/commerce";
import { Coupon } from "../../platform/entities";
import {
  AuditLog,
  Campus,
  Category,
  Order,
  OrderStatus,
  Product,
  RecordStatus,
  University,
  User,
  UserRole,
  Vendor,
  VendorStatus,
} from "../../platform/entities";
import { Address, AppSetting, DeviceToken, Notification, SupportTicket } from "../shared/entities";
import {
  AdminAccountDto,
  AdminAccountUpdateDto,
  AdminCategoryDto,
  AdminCreateProductDto,
  CampusDto,
  CampusPolicyDto,
  CategoryDto,
  AdminProductDto,
  PageDto,
  SettingDto,
  TicketReplyDto,
  UniversityDto,
  UserReviewDto,
  VendorReviewDto,
} from "../shared/dtos";
import { audit } from "../catalog/catalog.service";

@Injectable()
export class AdminService {
  constructor(private readonly db: DataSource) {}
  async overview() {
    const [
      universities,
      campuses,
      vendors,
      students,
      products,
      pendingVendors,
      pendingStudents,
      totals,
    ] = await Promise.all([
      this.db.getRepository(University).count(),
      this.db.getRepository(Campus).count(),
      this.db.getRepository(Vendor).count(),
      this.db.getRepository(User).countBy({ role: UserRole.STUDENT }),
      this.db.getRepository(Product).count(),
      this.db.getRepository(Vendor).countBy({ approvalStatus: "PENDING" }),
      this.db
        .getRepository(User)
        .countBy({ role: UserRole.STUDENT, verified: false }),
      this.db
        .getRepository(Order)
        .createQueryBuilder("o")
        .select("COUNT(*)", "orders")
        .addSelect(
          'COALESCE(SUM(CASE WHEN o.status = :delivered THEN o."totalPaise" ELSE 0 END),0)',
          "deliveredGmvPaise",
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN o."cashCollectedAt" IS NOT NULL THEN o."cashCollectedPaise" ELSE 0 END),0)',
          "vendorCashCollectedPaise",
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN o.status = :delivered THEN o."commissionPaise" ELSE 0 END),0)',
          "commissionAccruedPaise",
        )
        .setParameter("delivered", OrderStatus.DELIVERED)
        .getRawOne(),
    ]);
    return {
      universities,
      campuses,
      vendors,
      students,
      products,
      pendingVendors,
      pendingStudents,
      ...Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, Number(v)]),
      ),
    };
  }
  async list(resource: string, q: PageDto) {
    const entity = {
      administrators: User,
      universities: University,
      coupons: Coupon,
      reviews: Review,
      campuses: Campus,
      vendors: Vendor,
      products: Product,
      categories: Category,
      users: User,
      orders: Order,
      payments: Order,
      "audit-logs": AuditLog,
      support: SupportTicket,
    }[resource];
    if (!entity) throw new NotFoundException();
    const qb = this.db
      .getRepository(entity as typeof University)
      .createQueryBuilder("r");
    if (resource === "administrators")
      qb.andWhere("r.role IN (:...administratorRoles)", {
        administratorRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      });
    if (resource === "users") {
      qb.andWhere("r.role NOT IN (:...administratorRoles)", {
        administratorRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      });
      qb.leftJoinAndSelect("r.university", "university");
      qb.leftJoinAndSelect("r.campus", "campus");
    }
    if (resource === "products") {
      qb.leftJoinAndSelect("r.vendor", "vendor");
      qb.leftJoinAndSelect("r.category", "category");
    }
    if (["orders", "payments"].includes(resource)) {
      qb.leftJoinAndSelect("r.student", "student");
      qb.leftJoinAndSelect("r.vendor", "vendor");
    }
    if (
      q.universityId &&
      [
        "campuses",
        "vendors",
        "products",
        "users",
        "orders",
        "payments",
        "categories",
      ].includes(resource)
    )
      qb.andWhere("r.universityId = :u", { u: q.universityId });
    if (
      q.campusId &&
      ["vendors", "products", "users", "orders", "payments"].includes(resource)
    )
      qb.andWhere("r.campusId = :c", { c: q.campusId });
    if (q.vendorId && ["products", "orders", "payments"].includes(resource))
      qb.andWhere("r.vendorId = :v", { v: q.vendorId });
    if (q.q && ["users", "administrators"].includes(resource))
      qb.andWhere(
        "(r.name ILIKE :q OR r.email ILIKE :q OR COALESCE(r.phone, '') ILIKE :q)",
        { q: `%${q.q}%` },
      );
    else if (
      q.q &&
      ["universities", "campuses", "vendors", "products", "categories"].includes(resource)
    )
      qb.andWhere("r.name ILIKE :q", { q: `%${q.q}%` });
    const [items, total] = await qb
      .orderBy("r.createdAt", "DESC")
      .addOrderBy("r.id", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return { items, total, page: q.page, limit: q.limit };
  }
  async createUniversity(user: User, dto: UniversityDto) {
    return this.db.transaction(async (m) => {
      const row = await m.save(University, m.create(University, {
        ...dto, state: dto.state ?? '', city: dto.city ?? '', type: dto.type ?? 'OTHER',
        slug: `university-${randomUUID()}`,
      }));
      await audit(m, user.id, "CREATE_UNIVERSITY", "University", row.id, dto);
      return row;
    });
  }
  async updateUniversity(user: User, id: string, dto: UniversityDto) {
    return this.db.transaction(async (m) => {
      const row = await m.findOneBy(University, { id });
      if (!row) throw new NotFoundException("University not found.");
      row.name = dto.name.trim();
      row.state = dto.state?.trim() || "";
      row.city = dto.city?.trim() || "";
      row.type = dto.type || "OTHER";
      await m.save(row);
      await audit(m, user.id, "UPDATE_UNIVERSITY", "University", row.id, {
        name: row.name,
        state: row.state,
        city: row.city,
        type: row.type,
      });
      return row;
    });
  }
  async deleteUniversity(user: User, id: string) {
    return this.db.transaction(async (m) => {
      const row = await m.findOneBy(University, { id });
      if (!row) throw new NotFoundException("University not found.");
      const orders = await m.countBy(Order, { universityId: id });
      if (orders)
        throw new ConflictException(
          "This university has order history and cannot be permanently deleted. Deactivate it instead so financial records remain intact.",
        );

      // A university without orders can be removed safely. Delete operational
      // shop data in dependency order, retain user accounts for auditability,
      // and revoke their access so no orphaned campus membership survives.
      const campuses = await m.findBy(Campus, { universityId: id });
      const users = await m.findBy(User, { universityId: id });
      const campusIds = campuses.map((campus) => campus.id);
      const userIds = users.map((account) => account.id);
      const vendors = await m.countBy(Vendor, { universityId: id });
      const products = await m.countBy(Product, { universityId: id });

      if (campusIds.length)
        await m.delete(Address, { campusId: In(campusIds) });
      if (userIds.length)
        await m.delete(DeviceToken, { userId: In(userIds) });
      await m.delete(Coupon, { universityId: id });
      await m.delete(Product, { universityId: id });
      await m.delete(Vendor, { universityId: id });
      await m.delete(Category, { universityId: id });
      await m
        .createQueryBuilder()
        .update(User)
        .set({
          universityId: () => "NULL",
          campusId: () => "NULL",
          status: RecordStatus.SUSPENDED,
          tokenVersion: () => '"tokenVersion" + 1',
        })
        .where('"universityId" = :id', { id })
        .execute();
      await m.delete(Campus, { universityId: id });
      await m.remove(row);
      await audit(m, user.id, "DELETE_UNIVERSITY", "University", id, {
        name: row.name,
        removedCampuses: campuses.length,
        removedVendors: vendors,
        removedProducts: products,
        suspendedUsers: users.length,
      });
      return {
        id,
        deleted: true,
        removed: { campuses: campuses.length, vendors, products },
      };
    });
  }
  async createAdministrator(actor: User, dto: AdminAccountDto) {
    const email = dto.email.trim().toLowerCase();
    try {
      return await this.db.transaction(async (m) => {
        const row = await m.save(
          User,
          m.create(User, {
            name: dto.name.trim(),
            email,
            phone: dto.phone,
            passwordHash: await bcrypt.hash(dto.password, 12),
            role: dto.role ?? UserRole.ADMIN,
            status: RecordStatus.ACTIVE,
            verified: true,
          }),
        );
        await audit(m, actor.id, row.role === UserRole.SUPER_ADMIN ? "CREATE_SUPER_ADMIN" : "CREATE_ADMINISTRATOR", "User", row.id, {
          name: row.name,
          email: row.email,
          phone: row.phone,
          role: row.role,
        });
        return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role };
      });
    } catch (error: any) {
      if (error.code === "23505")
        throw new ConflictException("An account with this email already exists.");
      throw error;
    }
  }
  async removeAdministrator(actor: User, id: string) {
    if (actor.id === id)
      throw new ForbiddenException("You cannot remove your own administrator account.");
    return this.db.transaction(async (m) => {
      const row = await m.findOneBy(User, { id });
      if (!row || ![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(row.role))
        throw new NotFoundException("Administrator not found.");
      if (row.role === UserRole.SUPER_ADMIN) {
        const activeSuperAdmins = await m.countBy(User, {
          role: UserRole.SUPER_ADMIN,
          status: RecordStatus.ACTIVE,
        });
        if (activeSuperAdmins <= 1)
          throw new ConflictException("You cannot disable the last active Super Admin.");
      }
      row.status = RecordStatus.SUSPENDED;
      row.tokenVersion += 1;
      await m.save(row);
      await m.delete(DeviceToken, { userId: row.id });
      await audit(m, actor.id, "DISABLE_ADMINISTRATOR", "User", row.id, {
        email: row.email,
        status: row.status,
      });
      return { id: row.id, deleted: true };
    });
  }
  async updateAdministrator(actor: User, id: string, dto: AdminAccountUpdateDto) {
    if (actor.id === id && dto.role && dto.role !== UserRole.SUPER_ADMIN)
      throw new ForbiddenException("You cannot remove your own Super Admin role.");
    return this.db.transaction(async (m) => {
      const row = await m.findOneBy(User, { id });
      if (!row || ![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(row.role))
        throw new NotFoundException("Administrator not found.");
      if (row.role === UserRole.SUPER_ADMIN && dto.role && dto.role !== UserRole.SUPER_ADMIN) {
        const activeSuperAdmins = await m.countBy(User, { role: UserRole.SUPER_ADMIN, status: RecordStatus.ACTIVE });
        if (activeSuperAdmins <= 1)
          throw new ConflictException("You cannot remove the last active Super Admin role.");
      }
      const { newPassword, ...profile } = dto;
      const details = { ...profile, ...(profile.email ? { email: profile.email.trim().toLowerCase() } : {}) };
      try {
        Object.assign(row, details);
        if (newPassword) {
          row.passwordHash = await bcrypt.hash(newPassword, 12);
          row.tokenVersion += 1;
          await m.delete(DeviceToken, { userId: row.id });
        }
        await m.save(row);
      } catch (error: any) {
        if (error.code === "23505") throw new ConflictException("An account with this email already exists.");
        throw error;
      }
      await audit(m, actor.id, "UPDATE_ADMINISTRATOR", "User", row.id, { ...details, ...(newPassword ? { passwordChanged: true } : {}) });
      return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role, status: row.status };
    });
  }
  async createCampus(user: User, dto: CampusDto) {
    return this.db.transaction(async (m) => {
      if (
        !(await m.existsBy(University, {
          id: dto.universityId,
          status: RecordStatus.ACTIVE,
        }))
      )
        throw new NotFoundException("University not found.");
      const row = await m.save(Campus, m.create(Campus, {...dto, slug: `campus-${randomUUID()}`}));
      await audit(m, user.id, "CREATE_CAMPUS", "Campus", row.id, dto);
      return row;
    });
  }
  async campusPolicy(user: User, id: string, dto: CampusPolicyDto) {
    return this.db.transaction(async (m) => {
      const row = await m.findOneByOrFail(Campus, { id });
      Object.assign(row, dto);
      await m.save(row);
      await audit(m, user.id, "CAMPUS_POLICY", "Campus", id, dto);
      return row;
    });
  }
  async reviewUser(actor: User, id: string, dto: UserReviewDto) {
    return this.db.transaction(async (m) => {
      const user = await m.findOneBy(User, { id });
      if (!user) throw new NotFoundException();
      if (![UserRole.STUDENT, UserRole.VENDOR].includes(user.role))
        throw new ForbiddenException(
          "This endpoint cannot modify administrators.",
        );
      if (
        dto.verified &&
        (!user.campusId ||
          !(await m.existsBy(Campus, {
            id: user.campusId,
            universityId: user.universityId,
            status: RecordStatus.ACTIVE,
          })))
      )
        throw new ForbiddenException("Invalid campus membership.");
      Object.assign(user, dto);
      await m.save(user);
      await audit(m, actor.id, "REVIEW_USER", "User", id, dto);
      return { id, verified: user.verified, status: user.status };
    });
  }
  async updateUser(actor: User, id: string, dto: import("../shared/dtos").UserAccountUpdateDto) {
    return this.db.transaction(async (m) => {
      const user = await m.findOneBy(User, { id });
      if (!user) throw new NotFoundException("User not found.");
      if (![UserRole.STUDENT, UserRole.VENDOR].includes(user.role))
        throw new ForbiddenException("This endpoint cannot modify administrators.");
      if (
        dto.verified &&
        (!user.campusId || !(await m.existsBy(Campus, { id: user.campusId, universityId: user.universityId, status: RecordStatus.ACTIVE })))
      ) throw new ForbiddenException("Invalid campus membership.");
      const before = { name: user.name, email: user.email, phone: user.phone, verified: user.verified, status: user.status };
      user.name = dto.name.trim();
      user.email = dto.email.trim().toLowerCase();
      user.phone = dto.phone.trim();
      user.verified = dto.verified;
      user.status = dto.status;
      try { await m.save(user); }
      catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ConflictException("This email or mobile number is already in use.");
        throw error;
      }
      await audit(m, actor.id, "UPDATE_USER", "User", id, { before, after: { name: user.name, email: user.email, phone: user.phone, verified: user.verified, status: user.status } });
      return { id: user.id, name: user.name, email: user.email, phone: user.phone, verified: user.verified, status: user.status };
    });
  }
  async reviewVendor(actor: User, id: string, dto: VendorReviewDto) {
    return this.db.transaction(async (m) => {
      const vendor = await m.findOneBy(Vendor, { id });
      if (!vendor) throw new NotFoundException();
      const campus = await m.findOneBy(Campus, {
        id: vendor.campusId,
        universityId: vendor.universityId,
        status: RecordStatus.ACTIVE,
      });
      if (!campus) throw new ForbiddenException("Vendor campus is invalid.");
      Object.assign(vendor, dto, {
        verified: dto.approvalStatus === "APPROVED",
      });
      if (!vendor.verified || dto.status !== RecordStatus.ACTIVE)
        vendor.operatingStatus = VendorStatus.CLOSED;
      await m.save(vendor);
      await audit(m, actor.id, "REVIEW_VENDOR", "Vendor", id, dto);
      await m.save(
        Notification,
        m.create(Notification, {
          userId: vendor.ownerId,
          title: "Shop application updated",
          body: `Your application is ${dto.approvalStatus.toLowerCase().replaceAll("_", " ")}. ${dto.reviewReason || ""}`,
        }),
      );
      return vendor;
    });
  }
  async category(user: User, dto: CategoryDto) {
    return this.db.transaction(async (m) => {
      if (!(await m.existsBy(University, { id: dto.universityId })))
        throw new NotFoundException();
      const row = await m.save(Category, m.create(Category, dto));
      await audit(m, user.id, "CREATE_CATEGORY", "Category", row.id, dto);
      return row;
    });
  }
  async active(user: User, id: string, active: boolean) {
    return this.db.transaction(async (m) => {
      const p = await m.findOneBy(Product, { id });
      if (!p) throw new NotFoundException();
      p.active = active;
      await m.save(p);
      await audit(m, user.id, "PRODUCT_VISIBILITY", "Product", id, { active });
      return p;
    });
  }
  async updateProduct(user: User, id: string, dto: AdminProductDto) {
    return this.db.transaction(async (m) => {
      const product = await m.findOneBy(Product, { id });
      if (!product) throw new NotFoundException("Product not found.");
      Object.assign(product, dto);
      await m.save(product);
      await audit(m, user.id, "UPDATE_PRODUCT", "Product", id, dto);
      return product;
    });
  }
  async createProduct(user: User, dto: AdminCreateProductDto) {
    return this.db.transaction(async (m) => {
      const vendor = await m.findOneBy(Vendor, { id: dto.vendorId });
      if (!vendor) throw new NotFoundException("Vendor not found.");
      if (vendor.status !== RecordStatus.ACTIVE || vendor.approvalStatus !== "APPROVED")
        throw new ForbiddenException("Choose an approved, active vendor.");
      if (
        dto.categoryId &&
        !(await m.existsBy(Category, {
          id: dto.categoryId,
          universityId: vendor.universityId,
          active: true,
        }))
      )
        throw new ForbiddenException("Category must belong to the vendor's university.");
      const { vendorId, ...details } = dto;
      const product = await m.save(
        Product,
        m.create(Product, {
          ...details,
          vendorId,
          universityId: vendor.universityId,
          campusId: vendor.campusId,
          stock: dto.stock ?? null,
          active: dto.active ?? true,
          available: dto.available ?? true,
        }),
      );
      await audit(m, user.id, "CREATE_PRODUCT", "Product", product.id, {
        vendorId,
        name: product.name,
        pricePaise: product.pricePaise,
        categoryId: product.categoryId,
      });
      return product;
    });
  }
  async updateCategory(user: User, id: string, dto: AdminCategoryDto) {
    return this.db.transaction(async (m) => {
      const category = await m.findOneBy(Category, { id });
      if (!category) throw new NotFoundException("Category not found.");
      const before = { name: category.name, image: category.image, active: category.active };
      Object.assign(category, dto);
      try {
        await m.save(category);
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new ConflictException("A category with this name already exists for the university.");
        throw error;
      }
      await audit(m, user.id, "UPDATE_CATEGORY", "Category", id, { before, ...dto });
      return category;
    });
  }
  async removeCategory(user: User, id: string) {
    return this.db.transaction(async (m) => {
      const category = await m.findOneBy(Category, { id });
      if (!category) throw new NotFoundException("Category not found.");
      category.active = false;
      await m.save(category);
      await audit(m, user.id, "DELETE_CATEGORY", "Category", id, { active: false });
      return { id, deleted: true };
    });
  }
  async removeProduct(user: User, id: string) {
    return this.db.transaction(async (m) => {
      const product = await m.findOneBy(Product, { id });
      if (!product) throw new NotFoundException("Product not found.");
      product.active = false;
      product.available = false;
      await m.save(product);
      await audit(m, user.id, "DELETE_PRODUCT", "Product", id, {
        active: false,
        available: false,
      });
      return { id, deleted: true };
    });
  }
  async recordStatus(
    user: User,
    resource: string,
    id: string,
    status: RecordStatus,
  ) {
    const entity =
      resource === "universities"
        ? University
        : resource === "campuses"
          ? Campus
          : null;
    if (!entity) throw new NotFoundException();
    return this.db.transaction(async (m) => {
      await m.getRepository(entity as typeof University).update(id, { status });
      await audit(m, user.id, "RECORD_STATUS", resource, id, { status });
      return { id, status };
    });
  }
  settings() {
    return this.db.getRepository(AppSetting).find({ order: { key: "ASC" } });
  }
  async setting(user: User, dto: SettingDto) {
    if (dto.key === "carouselImages") {
      let images: unknown;
      try { images = JSON.parse(dto.value); } catch { throw new BadRequestException("Carousel images must be valid JSON."); }
      if (!Array.isArray(images) || images.length > 10 || images.some((image) => typeof image !== "string" || image.length > 500 || !(/^(https?:\/\/|\/uploads\/)/).test(image)))
        throw new BadRequestException("Use up to 10 valid carousel image URLs.");
      dto.value = JSON.stringify([...new Set(images)]);
    }
    return this.db.transaction(async (m) => {
      await m.upsert(AppSetting, dto, ["key"]);
      await audit(m, user.id, "APP_CONTENT", "AppSetting", dto.key, dto);
      return dto;
    });
  }
  async reply(user: User, id: string, dto: TicketReplyDto) {
    return this.db.transaction(async (m) => {
      const ticket = await m.findOneBy(SupportTicket, { id });
      if (!ticket) throw new NotFoundException();
      Object.assign(ticket, dto);
      await m.save(ticket);
      await audit(m, user.id, "SUPPORT_REPLY", "SupportTicket", id, dto);
      return ticket;
    });
  }
}
