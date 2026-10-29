-- Which PayPal environment an order's checkout ran in (sandbox or live).
ALTER TABLE "Order" ADD COLUMN "paypalEnv" TEXT;
