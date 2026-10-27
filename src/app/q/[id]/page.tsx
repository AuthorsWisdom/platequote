import { QuoteResult } from "@/components/quote-result";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuoteResult id={id} />;
}
