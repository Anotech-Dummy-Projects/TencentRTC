import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // This initial secret is hashed before persistence; upsert never overwrites an existing password.
  const hashedPassword = await bcrypt.hash("Admin@12345", 10);

  await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      name: "System Administrator",
      isActive: true,
    },
  });

  console.log("✅ Default admin ensured: username=admin");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
