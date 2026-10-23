import "dotenv/config";
import { dataSource } from "./data-source";
import {
  Campus,
  Category,
  Product,
  RecordStatus,
  User,
  UserRole,
  Vendor,
  VendorStatus,
} from "../platform/entities";
import { AppSetting } from "../modules/shared/entities";
import * as bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";

const products = [
  ["Masala Maggi", "Hot campus-style Maggi with vegetables and masala.", 5900, "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=80", "Maggi & Rolls", true],
  ["Chicken Maggi", "Spiced Maggi with tender chicken pieces and fresh herbs.", 8900, "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=80", "Maggi & Rolls", false],
  ["Paneer Kathi Roll", "Soft roll filled with spicy paneer, onions and mint chutney.", 9900, "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80", "Maggi & Rolls", true],
  ["Chicken Kathi Roll", "Chargrilled chicken, onions and mint chutney in a warm roll.", 12900, "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80", "Maggi & Rolls", false],
  ["Cold Coffee", "Chilled creamy coffee prepared fresh for campus delivery.", 7900, "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80", "Chai & Coffee", true],
  ["Iced Lemon Tea", "Fresh lemon tea served chilled.", 4900, "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80", "Cold Drinks", true],
  ["Masala Chai", "Strong hot chai with aromatic Indian spices.", 2500, "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=900&q=80", "Chai & Coffee", true],
  ["Veg Biryani Bowl", "Fragrant rice, vegetables and raita in a filling bowl.", 14900, "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=80", "Biryani & Bowls", true],
  ["Chicken Biryani Bowl", "Fragrant basmati rice, chicken and raita.", 18900, "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=80", "Biryani & Bowls", false],
  ["Cheese Burger", "Grilled vegetable patty, cheese and signature campus sauce.", 11900, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80", "Burgers & Snacks", true],
  ["Crispy Chicken Burger", "Crispy chicken, lettuce and house sauce.", 15900, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80", "Burgers & Snacks", false],
  ["French Fries", "Crisp golden fries with seasoning.", 6900, "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80", "Burgers & Snacks", true],
  ["Chocolate Shake", "Thick chocolate shake served chilled.", 10900, "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80", "Shakes & Desserts", true],
  ["Brownie Sundae", "Warm brownie with vanilla ice cream and chocolate sauce.", 13900, "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80", "Shakes & Desserts", true],
  ["Veg Hakka Noodles", "Wok-tossed noodles with vegetables and chilli sauce.", 11900, "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=80", "Chinese", true],
  ["Chicken Hakka Noodles", "Wok-tossed noodles with chicken and vegetables.", 14900, "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=80", "Chinese", false],
  ["Paneer Tikka Wrap", "Smoky paneer tikka, onions and chutney in a toasted wrap.", 12900, "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80", "Hot Food", true],
  ["Mineral Water", "Chilled 1 litre sealed bottled water.", 2000, "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=80", "Essentials", true],
] as const;

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo catalog seeding is disabled in production.");
  await dataSource.initialize();
  try {
    const campus = await dataSource.getRepository(Campus).findOne({
      where: { status: RecordStatus.ACTIVE },
      order: { serviceEnabled: "DESC", createdAt: "ASC" },
    });
    if (!campus) throw new Error("Create an active campus before adding demo catalog data.");
    let vendor = await dataSource.getRepository(Vendor).findOne({
      where: {
        universityId: campus.universityId,
        campusId: campus.id,
        status: RecordStatus.ACTIVE,
        approvalStatus: "APPROVED",
      },
      order: { createdAt: "ASC" },
    });
    if (!vendor) {
      const userRepository = dataSource.getRepository(User);
      const demoEmail = `demo-vendor-${campus.id}@campusdrop.local`;
      let owner = await userRepository.findOneBy({ email: demoEmail });
      if (!owner)
        owner = await userRepository.save({
          name: "Campus Drop Demo Vendor",
          email: demoEmail,
          phone: "9999999999",
          passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
          role: UserRole.VENDOR,
          universityId: campus.universityId,
          campusId: campus.id,
          status: RecordStatus.ACTIVE,
          verified: true,
        });
      vendor = await dataSource.getRepository(Vendor).save({
        name: "Campus Night Canteen",
        slug: `demo-canteen-${randomUUID()}`,
        ownerId: owner.id,
        universityId: campus.universityId,
        campusId: campus.id,
        description: "Fresh campus favourites, snacks and late-night essentials.",
        address: campus.address || campus.name,
        operatingStatus: VendorStatus.OPEN,
        status: RecordStatus.ACTIVE,
        verified: true,
        approvalStatus: "APPROVED",
        commissionRateBps: 1500,
        preparationMinutes: 12,
        codEnabled: true,
        operatingHours: { alwaysOpen: true, open: "00:00", close: "23:59" },
      });
    }

    vendor.coverImage ||= "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1400&q=85";
    vendor.logo ||= "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=500&q=80";
    vendor.description ||= "Fresh campus favourites, snacks and late-night essentials.";
    await dataSource.getRepository(Vendor).save(vendor);

    const categoryRepository = dataSource.getRepository(Category);
    const productRepository = dataSource.getRepository(Product);
    const categories = new Map<string, Category>();
    for (const [, , , image, name] of products) {
      if (categories.has(name)) continue;
      let category = await categoryRepository.findOneBy({
        universityId: campus.universityId,
        name,
      });
      if (!category)
        category = await categoryRepository.save({
          universityId: campus.universityId,
          name,
          image,
          active: true,
        });
      else if (!category.image) {
        category.image = image;
        category = await categoryRepository.save(category);
      }
      categories.set(name, category);
    }
    for (const [name, description, pricePaise, image, categoryName, vegetarian] of products) {
      const existing = await productRepository.findOneBy({ vendorId: vendor.id, name });
      if (existing) {
        existing.vegetarian = vegetarian;
        await productRepository.save(existing);
        continue;
      }
      await productRepository.save({
        vendorId: vendor.id,
        universityId: campus.universityId,
        campusId: campus.id,
        categoryId: categories.get(categoryName)!.id,
        name,
        description,
        pricePaise,
        compareAtPricePaise: pricePaise + 2000,
        image,
        vegetarian,
        stock: 50,
        available: true,
        active: true,
      });
    }
    await dataSource.getRepository(AppSetting).upsert(
      [
        { key: "announcement", value: "Fresh campus picks are live. Pay safely with cash on delivery." },
      ],
      ["key"],
    );
    console.log(
      `Demo catalog ready for ${campus.name}: ${products.length} products and ${categories.size} categories.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});
