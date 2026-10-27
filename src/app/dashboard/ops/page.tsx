export const dynamic = "force-dynamic";

const planned = [
  {
    ask: "Invoice Dana for the 3 brackets.",
    tool: "PayPal Agent Toolkit create_invoice and send_invoice",
    todo: "TODO: wire a shop ops chat that calls the toolkit. Do not send an invoice from this page.",
  },
  {
    ask: "Mark order 1042 shipped with this tracking number.",
    tool: "create_shipment_tracking on the PayPal capture",
    todo: "TODO: the orders table can mark a job shipped locally. It does not push tracking to PayPal.",
  },
  {
    ask: "Refund the failed print.",
    tool: "create_refund",
    todo: "TODO: refunds stay a manual PayPal action until the ops chat exists.",
  },
  {
    ask: "What did I sell this week?",
    tool: "get_merchant_insights and list_transaction",
    todo: "TODO: no sales summary is computed here yet. The orders table is the record for this build.",
  },
];

export default function OpsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Ops chat</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          This screen is a stub. The shop owner&apos;s assistant, built on PayPal&apos;s Agent Toolkit, is not
          implemented. Nothing on this page sends email, moves money, or talks to PayPal.
        </p>
      </div>
      <ol className="space-y-3">
        {planned.map((item) => (
          <li key={item.ask} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-medium">{item.ask}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.tool}</p>
            <p className="mt-2 text-sm">{item.todo}</p>
          </li>
        ))}
      </ol>
      <form className="rounded-2xl border border-dashed border-border bg-card p-4">
        <label className="block text-sm font-medium" htmlFor="ops-ask">
          Ask the shop assistant
        </label>
        <textarea
          id="ops-ask"
          disabled
          placeholder="Not available in this build."
          className="mt-2 min-h-24 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm"
        />
        <p className="mt-2 text-xs text-muted-foreground">The input stays disabled on purpose.</p>
      </form>
    </div>
  );
}
