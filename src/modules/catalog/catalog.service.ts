import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import {
  AuditLog,
  Campus,
  Category,
  Product,
  RecordStatus,
  University,
  User,
  UserRole,
  Vendor,
} from "../../platform/entities";
import { Address, AppSetting } from "../shared/entities";
import {
  AddressDto,
  PageDto,
  ProductDto,
  VendorProfileDto,
} from "../shared/dtos";
import { acceptsOrders } from "./availability";

export async function campusAccess(
  manager: EntityManager,
  user: User,
  ordering = false,
) {
  if (!user.universityId || !user.campusId)
    throw new ForbiddenException(
      "Select an active university and campus to continue.",
    );
  const university = await manager.findOneBy(University, {
    id: user.universityId,
    status: RecordStatus.ACTIVE,
  });
  const campus = await manager.findOneBy(Campus, {
    id: user.campusId,
    universityId: user.universityId,
    status: RecordStatus.ACTIVE,
  });
  if (!university || !campus)
    throw new ForbiddenException("Your campus is not active.");
  if (ordering && !campus.serviceEnabled)
    throw new ForbiddenException(
      "Delivery has not launched on your campus yet.",
    );
  return campus;
}
export async function ownedVendor(
  manager: EntityManager,
  user: User,
  approved = true,
) {
  const vendor = await manager.findOneBy(Vendor, { ownerId: user.id });
  if (!vendor || user.role !== UserRole.VENDOR)
    throw new ForbiddenException("Vendor account required.");
  if (
    approved &&
    (vendor.approvalStatus !== "APPROVED" ||
      vendor.status !== RecordStatus.ACTIVE)
  )
    throw new ForbiddenException("Your shop is not approved and active.");
  return vendor;
}
export async function audit(
  manager: EntityManager,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  after: unknown,
) {
  await manager.save(
    AuditLog,
    manager.create(AuditLog, { actorId, action, entity, entityId, after }),
  );
}
export function vendorPublic(
  v: Vendor,
  rating?: { rating: number; reviewCount: number },
) {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    logo: v.logo,
    coverImage: v.coverImage,
    operatingStatus: v.operatingStatus,
    preparationMinutes: v.preparationMinutes,
    address: v.address,
    codEnabled: v.codEnabled,
    acceptingOrders: acceptsOrders(v),
    operatingHours: v.operatingHours,
    rating: rating?.rating ?? null,
    reviewCount: rating?.reviewCount ?? 0,
  };
}
@Injectable()
export class CatalogService {
  constructor(private readonly db: DataSource) {}
  universities() {
    return this.db.getRepository(University).find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: "ASC" },
      take: 2000,
    });
  }
  campuses(universityId: string) {
    return this.db.getRepository(Campus).find({
      where: { universityId, status: RecordStatus.ACTIVE },
      order: { name: "ASC" },
      take: 2000,
    });
  }
  async catalog(user: User, query: PageDto) {
    const campus = await campusAccess(this.db.manager, user);
    const vendors = await this.db.getRepository(Vendor).find({
      where: {
        universityId: user.universityId,
        campusId: user.campusId,
        status: RecordStatus.ACTIVE,
        approvalStatus: "APPROVED",
      },
      order: { name: "ASC" },
      take: 200,
    });
    const qb = this.db
      .getRepository(Product)
      .createQueryBuilder("p")
      .innerJoinAndSelect("p.vendor", "v")
      .leftJoinAndSelect("p.category", "c")
      .where("p.universityId = :u AND p.campusId = :campus", {
        u: user.universityId,
        campus: user.campusId,
      })
      .andWhere("v.universityId = :u AND v.campusId = :campus")
      .andWhere("p.active = true AND p.available = true")
      .andWhere("v.status = :active AND v.approvalStatus = :approved", {
        active: RecordStatus.ACTIVE,
        approved: "APPROVED",
      });
    if (query.q)
      qb.andWhere("(p.name ILIKE :q OR v.name ILIKE :q OR c.name ILIKE :q)", {
        q: `%${query.q}%`,
      });
    if (query.vendorId)
      qb.andWhere("p.vendorId = :vendor", { vendor: query.vendorId });
    if (query.categoryId)
      qb.andWhere("p.categoryId = :category", { category: query.categoryId });
    if (query.maxPricePaise)
      qb.andWhere("p.pricePaise <= :maxPrice", {
        maxPrice: query.maxPricePaise,
      });
    if (query.vegetarian) qb.andWhere("p.vegetarian = true");
    if (query.openOnly) {
      const openVendorIds = vendors.filter((vendor) => acceptsOrders(vendor)).map((v) => v.id);
      if (openVendorIds.length)
        qb.andWhere("p.vendorId IN (:...openVendorIds)", { openVendorIds });
      else qb.andWhere("1 = 0");
    }
    const ratingExpression =
      '(SELECT COALESCE(AVG(review.rating), 0) FROM reviews review WHERE review."vendorId" = v.id AND review.visible = true)';
    if (query.sort === "TOP_RATED") qb.addSelect(ratingExpression, "vendor_rating");
    const [products, total] = await qb
      .orderBy(
        query.sort === "TOP_RATED"
          ? "vendor_rating"
          : query.sort === "NEWEST"
          ? "p.createdAt"
          : query.sort?.startsWith("PRICE")
            ? "p.pricePaise"
            : "p.name",
        ["PRICE_DESC", "NEWEST", "TOP_RATED"].includes(query.sort || "")
          ? "DESC"
          : "ASC",
      )
      .addOrderBy("p.id", "ASC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const [categories, settings, ratingRows] = await Promise.all([
      this.db.getRepository(Category).find({
        where: { universityId: user.universityId, active: true },
        take: 200,
      }),
      this.db.getRepository(AppSetting).find(),
      vendors.length
        ? this.db
            .createQueryBuilder()
            .select('review."vendorId"', "vendorId")
            .addSelect("AVG(review.rating)", "rating")
            .addSelect("COUNT(*)", "reviewCount")
            .from("reviews", "review")
            .where("review.visible = true")
            .andWhere('review."vendorId" IN (:...vendorIds)', {
              vendorIds: vendors.map((v) => v.id),
            })
            .groupBy('review."vendorId"')
            .getRawMany<{ vendorId: string; rating: string; reviewCount: string }>()
        : Promise.resolve([]),
    ]);
    const ratings = new Map(
      ratingRows.map((row) => [
        row.vendorId,
        { rating: Number(row.rating), reviewCount: Number(row.reviewCount) },
      ]),
    );
    return {
      campus,
      vendors: vendors.map((v) => vendorPublic(v, ratings.get(v.id))),
      products: products.map((p) => ({
        ...p,
        vendor: vendorPublic(p.vendor, ratings.get(p.vendorId)),
      })),
      categories,
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async product(user: User, id: string) {
    await campusAccess(this.db.manager, user);
    const product = await this.db.getRepository(Product).findOne({
      where: {
        id,
        universityId: user.universityId,
        campusId: user.campusId,
        active: true,
      },
      relations: { vendor: true, category: true },
    });
    if (
      !product ||
      product.vendor.approvalStatus !== "APPROVED" ||
      product.vendor.status !== RecordStatus.ACTIVE ||
      product.vendor.campusId !== user.campusId
    )
      throw new NotFoundException("Product not found.");
    return { ...product, vendor: vendorPublic(product.vendor) };
  }
  addresses(user: User) {
    return this.db.getRepository(Address).find({
      where: { userId: user.id, campusId: user.campusId },
      order: { createdAt: "DESC" },
    });
  }
  async addAddress(user: User, dto: AddressDto) {
    await campusAccess(this.db.manager, user);
    return this.db
      .getRepository(Address)
      .save({ ...dto, userId: user.id, campusId: user.campusId });
  }
  async vendor(user: User) {
    return ownedVendor(this.db.manager, user, false);
  }
  async vendorProfile(user: User, dto: VendorProfileDto) {
    return this.db.transaction(async (manager) => {
      const vendor = await ownedVendor(manager, user, !!dto.operatingStatus);
      Object.assign(vendor, dto);
      await manager.save(vendor);
      await audit(manager, user.id, "UPDATE_SHOP", "Vendor", vendor.id, dto);
      return vendor;
    });
  }
  async products(user: User) {
    const vendor = await ownedVendor(this.db.manager, user, false);
    return this.db.getRepository(Product).find({
      where: { vendorId: vendor.id },
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
  async saveProduct(user: User, dto: ProductDto, id?: string) {
    return this.db.transaction(async (manager) => {
      const vendor = await ownedVendor(manager, user);
      if (
        dto.categoryId &&
        !(await manager.existsBy(Category, {
          id: dto.categoryId,
          universityId: vendor.universityId,
          active: true,
        }))
      )
        throw new ForbiddenException("Invalid category for this university.");
      let product = id
        ? await manager.findOne(Product, {
            where: { id, vendorId: vendor.id },
            lock: { mode: "pessimistic_write" },
          })
        : manager.create(Product, {
            vendorId: vendor.id,
            universityId: vendor.universityId,
            campusId: vendor.campusId,
            stock: null,
          });
      if (!product) throw new NotFoundException("Product not found.");
      Object.assign(product, dto);
      product = await manager.save(product);
      await audit(
        manager,
        user.id,
        id ? "UPDATE_PRODUCT" : "CREATE_PRODUCT",
        "Product",
        product.id,
        dto,
      );
      return product;
    });
  }
}
