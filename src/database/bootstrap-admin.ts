import { dataSource } from "./data-source";
import { User, UserRole } from "../platform/entities";
import * as bcrypt from "bcrypt";
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 14)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 14 characters).",
    );
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    if (await repo.existsBy({ email }))
      throw new Error(
        "Account already exists; refusing to change its role or password.",
      );
    await repo.save(
      repo.create({
        email,
        passwordHash: await bcrypt.hash(password, 12),
        name: "Campus Drop administrator",
        role: UserRole.SUPER_ADMIN,
        verified: true,
      }),
    );
    console.log(
      "Administrator created. No university or product data was seeded.",
    );
  } finally {
    await dataSource.destroy();
  }
}
main().catch(() => {
  console.error(
    "Admin bootstrap failed. Check configuration and whether the account already exists.",
  );
  process.exitCode = 1;
});
