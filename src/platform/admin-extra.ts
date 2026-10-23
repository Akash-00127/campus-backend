import {
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IsBoolean, IsEnum } from "class-validator";
import {
  AuditLog,
  Campus,
  Category,
  Order,
  Product,
  University,
  User,
  Vendor,
  VendorStatus,
} from "./entities";
import { CurrentSession, JwtGuard, RequireRoles, RoleGuard } from "./platform";
import { UserRole } from "./entities";

class VendorStatusDto {
  @IsEnum(VendorStatus) operatingStatus!: VendorStatus;
}
class ProductAvailabilityDto {
  @IsBoolean() active!: boolean;
}

@Injectable()
export class AdminReadService {
  constructor(
    @InjectRepository(University) private universities: Repository<University>,
    @InjectRepository(Campus) private campuses: Repository<Campus>,
    @InjectRepository(Vendor) private vendors: Repository<Vendor>,
    @InjectRepository(Category) private categories: Repository<Category>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(AuditLog) private audits: Repository<AuditLog>,
  ) {}
  universitiesList() {
    return this.universities.find({ order: { createdAt: "DESC" } });
  }
  campusesList() {
    return this.campuses.find({
      relations: { university: true },
      order: { createdAt: "DESC" },
    });
  }
  vendorsList() {
    return this.vendors.find({
      relations: { university: true, campus: true, owner: true },
      order: { createdAt: "DESC" },
    });
  }
  categoriesList() {
    return this.categories.find({ order: { name: "ASC" } });
  }
  productsList() {
    return this.products.find({
      relations: { vendor: true, category: true },
      order: { createdAt: "DESC" },
    });
  }
  usersList() {
    return this.users.find({
      relations: { university: true, campus: true },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        universityId: true,
        campusId: true,
        status: true,
        verified: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: "DESC" },
    });
  }
  ordersList() {
    return this.orders.find({
      relations: { student: true, vendor: true, items: true },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }
  auditList() {
    return this.audits.find({ order: { createdAt: "DESC" }, take: 100 });
  }
  async setVendorStatus(
    id: string,
    operatingStatus: VendorStatus,
    actorId: string,
  ) {
    const vendor = await this.vendors.findOneBy({ id });
    if (!vendor) throw new NotFoundException("Vendor not found.");
    vendor.operatingStatus = operatingStatus;
    const saved = await this.vendors.save(vendor);
    await this.audits.save(
      this.audits.create({
        actorId,
        action: "UPDATE_VENDOR_STATUS",
        entity: "Vendor",
        entityId: id,
        after: { operatingStatus },
      }),
    );
    return saved;
  }
  async setProductActive(id: string, active: boolean, actorId: string) {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException("Product not found.");
    product.active = active;
    const saved = await this.products.save(product);
    await this.audits.save(
      this.audits.create({
        actorId,
        action: "UPDATE_PRODUCT_AVAILABILITY",
        entity: "Product",
        entityId: id,
        after: { active },
      }),
    );
    return saved;
  }
}

@Controller("v1/admin")
@UseGuards(JwtGuard, RoleGuard)
@RequireRoles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminReadController {
  constructor(private readonly service: AdminReadService) {}
  @Get("universities") universities() {
    return this.service.universitiesList();
  }
  @Get("campuses") campuses() {
    return this.service.campusesList();
  }
  @Get("vendors") vendors() {
    return this.service.vendorsList();
  }
  @Get("categories") categories() {
    return this.service.categoriesList();
  }
  @Get("products") products() {
    return this.service.productsList();
  }
  @Get("users") users() {
    return this.service.usersList();
  }
  @Get("orders") orders() {
    return this.service.ordersList();
  }
  @Get("audit-logs") audits() {
    return this.service.auditList();
  }
  @Patch("vendors/:id/status") vendorStatus(
    @CurrentSession() user: { id: string },
    @Param("id") id: string,
    @Body() dto: VendorStatusDto,
  ) {
    return this.service.setVendorStatus(id, dto.operatingStatus, user.id);
  }
  @Patch("products/:id/availability") productAvailability(
    @CurrentSession() user: { id: string },
    @Param("id") id: string,
    @Body() dto: ProductAvailabilityDto,
  ) {
    return this.service.setProductActive(id, dto.active, user.id);
  }
}
