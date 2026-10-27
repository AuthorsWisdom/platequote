-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "minimumOrder" DECIMAL(10,2) NOT NULL,
    "rushFee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "estimateTolerancePct" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bedXmm" DOUBLE PRECISION NOT NULL,
    "bedYmm" DOUBLE PRECISION NOT NULL,
    "bedZmm" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pricePerGram" DECIMAL(10,4) NOT NULL,
    "pricePerMachineHour" DECIMAL(10,2) NOT NULL,
    "densityGPerCm3" DOUBLE PRECISION NOT NULL,
    "colors" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "printerId" TEXT,
    "status" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rush" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "filamentGrams" DOUBLE PRECISION,
    "filamentCm3" DOUBLE PRECISION,
    "slicedDensity" DOUBLE PRECISION,
    "printTimeSeconds" INTEGER,
    "supports" BOOLEAN,
    "meshFacts" JSONB,
    "slicerResult" JSONB,
    "aiReview" JSONB,
    "priceCents" INTEGER,
    "priceBreakdown" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "payerEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "printingAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Material_shopId_slug_key" ON "Material"("shopId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paypalOrderId_key" ON "Order"("paypalOrderId");

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

