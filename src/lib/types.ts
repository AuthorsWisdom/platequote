export type MaterialDTO = {
  id: string;
  name: string;
  slug: string;
  pricePerGram: number;
  pricePerMachineHour: number;
  densityGPerCm3: number;
  colors: string[];
};

export type PrinterDTO = {
  id: string;
  name: string;
  bedXmm: number;
  bedYmm: number;
  bedZmm: number;
  isDefault: boolean;
};

export type ShopDTO = {
  id: string;
  name: string;
  slug: string;
  minimumOrder: number;
  rushFee: number;
  currency: "USD";
  estimateTolerancePct: number;
  printers: PrinterDTO[];
  materials: MaterialDTO[];
};

export type MeshFactsDTO = {
  watertight: boolean;
  volumeCm3: number | null;
  surfaceAreaCm2: number;
  overhangFaceShare: number;
  overhangThresholdDeg: number;
  thinWall: boolean;
  characteristicThicknessMm: number | null;
  fitsBed: boolean;
  fitsIfRotated: boolean;
  partCount: number;
  triangleCount: number;
  boundingBoxMm: { x: number; y: number; z: number };
};

export type PriceBreakdownDTO = {
  filamentGrams: number;
  printTimeSeconds: number;
  quantity: number;
  pricePerGram: number;
  pricePerMachineHour: number;
  materialCents: number;
  machineCents: number;
  beforeMinimumCents: number;
  minimumOrderCents: number;
  minimumApplied: boolean;
  rushFeeCents: number;
  rush: boolean;
  totalCents: number;
  currency: "USD";
  gramsSource: "slicer" | "density_adjusted";
};

export type ReviewWarning = {
  severity: "info" | "warning" | "blocker";
  title: string;
  detail: string;
  fix: string;
};

export type MaterialAdvice = {
  material: string;
  fit: "good" | "ok" | "poor";
  reason: string;
};

export type AiReviewDTO = {
  provider: "mock" | "openai" | "anthropic";
  mocked: boolean;
  mockReason: string | null;
  summary: string;
  printable: boolean;
  warnings: ReviewWarning[];
  orientationNote: string;
  materialAdvice: MaterialAdvice[];
};

export type MaterialQuoteDTO = MaterialAdvice & {
  materialId: string | null;
  defaultColor: string | null;
  priceCents: number | null;
  priceSource: "pricing_engine" | null;
  unavailable: boolean;
};

export type StoredReview = {
  review: AiReviewDTO;
  materialQuotes: MaterialQuoteDTO[];
};

export type OrderStatus = "quoted" | "paid" | "printing" | "shipped";

export type QuoteDTO = {
  id: string;
  status: "slicing" | "quoted" | "failed";
  shopName: string;
  estimateTolerancePct: number;
  originalFilename: string;
  color: string;
  quantity: number;
  rush: boolean;
  purpose: string;
  material: MaterialDTO;
  printer: PrinterDTO | null;
  filamentGrams: number | null;
  filamentCm3: number | null;
  slicedDensity: number | null;
  printTimeSeconds: number | null;
  supports: boolean | null;
  profileName: string | null;
  engine: string | null;
  mesh: MeshFactsDTO | null;
  priceCents: number | null;
  priceBreakdown: PriceBreakdownDTO | null;
  review: StoredReview | null;
  errorMessage: string | null;
  createdAt: string;
  order: {
    id: string;
    status: OrderStatus;
    amountCents: number;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    payerEmail: string | null;
    paidAt: string | null;
  } | null;
};

export type OrderDTO = {
  id: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  quote: {
    id: string;
    originalFilename: string;
    quantity: number;
    color: string;
    materialName: string;
    printTimeSeconds: number | null;
    filamentGrams: number | null;
  };
};
