import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const materials = [
  {
    name: "PLA",
    slug: "pla",
    pricePerGram: "0.0250",
    pricePerMachineHour: "6.00",
    densityGPerCm3: 1.24,
    colors: ["Black", "White", "Gray", "Red", "Blue"],
    sortOrder: 0,
  },
  {
    name: "PETG",
    slug: "petg",
    pricePerGram: "0.0300",
    pricePerMachineHour: "7.00",
    densityGPerCm3: 1.27,
    colors: ["Black", "White", "Orange"],
    sortOrder: 1,
  },
  {
    name: "ASA",
    slug: "asa",
    pricePerGram: "0.0350",
    pricePerMachineHour: "8.00",
    densityGPerCm3: 1.07,
    colors: ["Black", "White"],
    sortOrder: 2,
  },
  {
    name: "TPU",
    slug: "tpu",
    pricePerGram: "0.0400",
    pricePerMachineHour: "8.00",
    densityGPerCm3: 1.21,
    colors: ["Black", "Red"],
    sortOrder: 3,
  },
];

async function main() {
  const existing = await prisma.shop.findUnique({ where: { slug: "northline" } });
  if (existing) {
    console.log("Demo shop already present:", existing.name);
    return;
  }

  await prisma.shop.create({
    data: {
      name: "Northline Print",
      slug: "northline",
      minimumOrder: "8.00",
      rushFee: "5.00",
      currency: "USD",
      estimateTolerancePct: 15,
      printers: {
        create: {
          name: "Bench One",
          bedXmm: 256,
          bedYmm: 256,
          bedZmm: 256,
          isDefault: true,
        },
      },
      materials: { create: materials },
    },
  });
  console.log("Seeded Northline Print");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
