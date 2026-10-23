import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Role } from '../src/types';

const prisma = new PrismaClient();

const products = [
  ['burger', 'Classic veg burger', 99, 'https://images.unsplash.com/photo-1593759608142-e9b18c0dbe86?auto=format&fit=crop&w=640&q=80', 'Fast food', 'canteen'],
  ['pizza', 'Cheesy veg pizza', 149, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=640&q=80', 'Fast food', 'canteen'],
  ['fries', 'Salted fries', 79, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=640&q=80', 'Fast food', 'canteen'],
  ['cola', 'Chilled cola · 300 ml', 40, 'https://images.unsplash.com/photo-1652983066424-fd72ae2c589c?auto=format&fit=crop&w=640&q=80', 'Cold drinks', 'canteen'],
  ['cold-coffee', 'Iced cold coffee', 90, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=640&q=80', 'Cold drinks', 'canteen'],
  ['samosa', 'Samosa · 2', 40, 'https://images.unsplash.com/photo-1683112687032-76f09503a54a?auto=format&fit=crop&w=640&q=80', 'Snacks', 'canteen'],
];

async function main() {
  const shops = await Promise.all([
    ['Canteen Corner', 'canteen', 'Bites · chai', '12 min'],
    ['Stationery Hub', 'stationery', 'Blocks 2–6', '9 min'],
    ['MediPost', 'medi', '24×7 duty', '15 min'],
    ['BookNook 24', 'books', 'Late rush', '18 min'],
  ].map(([name, code, kind, eta]) => prisma.shop.upsert({ where: { code }, update: { name, kind, eta }, create: { id: code, name, code, kind, eta } })));
  const byCode = Object.fromEntries(shops.map((shop) => [shop.code, shop.id]));
  for (const [id, name, price, image, category, code] of products) {
    await prisma.product.upsert({
      where: { id: String(id) },
      update: { name: String(name), price: Number(price), image: String(image), category: String(category), shopId: byCode[String(code)] },
      create: { id: String(id), name: String(name), price: Number(price), image: String(image), category: String(category), shopId: byCode[String(code)] },
    });
  }
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusdrop.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisLocalAdminPassword!2026';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: { email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), name: 'Campus Administrator', place: 'Campus', role: Role.ADMIN },
  });
  for (const [key, value] of Object.entries({ heroTitle: 'Everything you need, delivered around campus.', heroSubtitle: 'Fresh food, cold drinks and daily essentials in a few taps.', deliveryPromise: 'Free delivery above ₹199' })) {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  console.log(`Seeded. Admin login: ${adminEmail}`);
}
main().finally(() => prisma.$disconnect());
