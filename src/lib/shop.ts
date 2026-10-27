import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { MaterialDTO, PrinterDTO, ShopDTO } from "@/lib/types";

const shopInclude = {
  printers: { orderBy: { name: "asc" as const } },
  materials: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ShopInclude;

type ShopRecord = Prisma.ShopGetPayload<{ include: typeof shopInclude }>;

function asColors(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function toMaterialDTO(material: ShopRecord["materials"][number]): MaterialDTO {
  return {
    id: material.id,
    name: material.name,
    slug: material.slug,
    pricePerGram: Number(material.pricePerGram),
    pricePerMachineHour: Number(material.pricePerMachineHour),
    densityGPerCm3: material.densityGPerCm3,
    colors: asColors(material.colors),
  };
}

export function toPrinterDTO(printer: ShopRecord["printers"][number]): PrinterDTO {
  return {
    id: printer.id,
    name: printer.name,
    bedXmm: printer.bedXmm,
    bedYmm: printer.bedYmm,
    bedZmm: printer.bedZmm,
    isDefault: printer.isDefault,
  };
}

export function toShopDTO(shop: ShopRecord): ShopDTO {
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    minimumOrder: Number(shop.minimumOrder),
    rushFee: Number(shop.rushFee),
    currency: "USD",
    estimateTolerancePct: shop.estimateTolerancePct,
    printers: shop.printers.map(toPrinterDTO),
    materials: shop.materials.map(toMaterialDTO),
  };
}

export async function getShopRecord() {
  const shop = await prisma.shop.findFirst({
    include: shopInclude,
    orderBy: { createdAt: "asc" },
  });
  if (!shop) {
    throw new Error("The demo shop is not seeded.");
  }
  return shop;
}

export async function getShop(): Promise<ShopDTO> {
  return toShopDTO(await getShopRecord());
}

export function defaultPrinter(shop: ShopDTO): PrinterDTO {
  return shop.printers.find((printer) => printer.isDefault) ?? shop.printers[0];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 40) || "material";
}

export type ShopUpdateInput = {
  name: string;
  minimumOrder: number;
  rushFee: number;
  estimateTolerancePct: number;
  printers: Array<{
    id?: string;
    name: string;
    bedXmm: number;
    bedYmm: number;
    bedZmm: number;
    isDefault: boolean;
  }>;
  materials: Array<{
    id?: string;
    name: string;
    pricePerGram: number;
    pricePerMachineHour: number;
    densityGPerCm3: number;
    colors: string[];
  }>;
};

export async function updateShop(input: ShopUpdateInput): Promise<ShopDTO> {
  const shop = await getShopRecord();
  const defaultIndex = Math.max(
    0,
    input.printers.findIndex((printer) => printer.isDefault),
  );

  await prisma.$transaction(async (tx) => {
    await tx.shop.update({
      where: { id: shop.id },
      data: {
        name: input.name,
        minimumOrder: input.minimumOrder,
        rushFee: input.rushFee,
        estimateTolerancePct: input.estimateTolerancePct,
      },
    });

    const existingPrinters = await tx.printer.findMany({ where: { shopId: shop.id } });
    const keptPrinters = new Set(
      input.printers.map((printer) => printer.id).filter((id): id is string => Boolean(id)),
    );
    for (const printer of existingPrinters) {
      if (keptPrinters.has(printer.id)) continue;
      const used = await tx.quote.count({ where: { printerId: printer.id } });
      if (used > 0) {
        throw new Error(`${printer.name} already has quotes, so it stays on the shop.`);
      }
      await tx.printer.delete({ where: { id: printer.id } });
    }
    for (const [index, printer] of input.printers.entries()) {
      const data = {
        name: printer.name,
        bedXmm: printer.bedXmm,
        bedYmm: printer.bedYmm,
        bedZmm: printer.bedZmm,
        isDefault: index === defaultIndex,
      };
      const known = printer.id && existingPrinters.some((item) => item.id === printer.id);
      if (known && printer.id) {
        await tx.printer.update({ where: { id: printer.id }, data });
      } else {
        await tx.printer.create({ data: { ...data, shopId: shop.id } });
      }
    }

    const existingMaterials = await tx.material.findMany({ where: { shopId: shop.id } });
    const keptMaterials = new Set(
      input.materials.map((material) => material.id).filter((id): id is string => Boolean(id)),
    );
    for (const material of existingMaterials) {
      if (keptMaterials.has(material.id)) continue;
      const used = await tx.quote.count({ where: { materialId: material.id } });
      if (used > 0) {
        throw new Error(`${material.name} already has quotes, so it stays on the shop.`);
      }
      await tx.material.delete({ where: { id: material.id } });
    }

    const usedSlugs = new Set(existingMaterials.map((material) => material.slug));
    for (const [index, material] of input.materials.entries()) {
      const known = material.id && existingMaterials.some((item) => item.id === material.id);
      const data = {
        name: material.name,
        pricePerGram: material.pricePerGram,
        pricePerMachineHour: material.pricePerMachineHour,
        densityGPerCm3: material.densityGPerCm3,
        colors: material.colors,
        sortOrder: index,
      };
      if (known && material.id) {
        await tx.material.update({ where: { id: material.id }, data });
      } else {
        let slug = slugify(material.name);
        let suffix = 2;
        while (usedSlugs.has(slug)) {
          slug = `${slugify(material.name)}-${suffix}`;
          suffix += 1;
        }
        usedSlugs.add(slug);
        await tx.material.create({ data: { ...data, slug, shopId: shop.id } });
      }
    }
  });

  return getShop();
}
