"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ShopDTO } from "@/lib/types";

type Draft = {
  name: string;
  minimumOrder: string;
  rushFee: string;
  estimateTolerancePct: string;
  printers: Array<{ id?: string; name: string; bedXmm: string; bedYmm: string; bedZmm: string; isDefault: boolean }>;
  materials: Array<{
    id?: string;
    name: string;
    pricePerGram: string;
    pricePerMachineHour: string;
    densityGPerCm3: string;
    colors: string;
  }>;
};

function fromShop(shop: ShopDTO): Draft {
  return {
    name: shop.name,
    minimumOrder: String(shop.minimumOrder),
    rushFee: String(shop.rushFee),
    estimateTolerancePct: String(shop.estimateTolerancePct),
    printers: shop.printers.map((printer) => ({
      id: printer.id,
      name: printer.name,
      bedXmm: String(printer.bedXmm),
      bedYmm: String(printer.bedYmm),
      bedZmm: String(printer.bedZmm),
      isDefault: printer.isDefault,
    })),
    materials: shop.materials.map((material) => ({
      id: material.id,
      name: material.name,
      pricePerGram: String(material.pricePerGram),
      pricePerMachineHour: String(material.pricePerMachineHour),
      densityGPerCm3: String(material.densityGPerCm3),
      colors: material.colors.join(", "),
    })),
  };
}

export function ShopSettings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then(async (response) => {
        const payload = (await response.json()) as ShopDTO & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Could not load the shop.");
        if (!cancelled) setDraft(fromShop(payload));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the shop.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const body = {
      name: draft.name,
      minimumOrder: Number(draft.minimumOrder),
      rushFee: Number(draft.rushFee),
      estimateTolerancePct: Number(draft.estimateTolerancePct),
      printers: draft.printers.map((printer) => ({
        id: printer.id,
        name: printer.name,
        bedXmm: Number(printer.bedXmm),
        bedYmm: Number(printer.bedYmm),
        bedZmm: Number(printer.bedZmm),
        isDefault: printer.isDefault,
      })),
      materials: draft.materials.map((material) => ({
        id: material.id,
        name: material.name,
        pricePerGram: Number(material.pricePerGram),
        pricePerMachineHour: Number(material.pricePerMachineHour),
        densityGPerCm3: Number(material.densityGPerCm3),
        colors: material.colors
          .split(",")
          .map((color) => color.trim())
          .filter(Boolean),
      })),
    };
    try {
      const response = await fetch("/api/shop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        window.location.assign("/login?next=/dashboard/settings");
        return;
      }
      const payload = (await response.json()) as ShopDTO & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not save.");
      setDraft(fromShop(payload));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft && !error) return <p className="text-sm text-muted-foreground">Loading shop setup…</p>;
  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-heading text-2xl">Shop setup is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Shop setup</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          These rates are the only numbers that become a price. The reviewer can suggest a material. It cannot
          change what a gram or an hour costs.
        </p>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="Shop name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Field
          label="Minimum order (USD)"
          value={draft.minimumOrder}
          onChange={(minimumOrder) => setDraft({ ...draft, minimumOrder })}
        />
        <Field label="Rush fee (USD)" value={draft.rushFee} onChange={(rushFee) => setDraft({ ...draft, rushFee })} />
        <Field
          label="Estimate tolerance (%)"
          value={draft.estimateTolerancePct}
          onChange={(estimateTolerancePct) => setDraft({ ...draft, estimateTolerancePct })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl">Printers</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                ...draft,
                printers: [
                  ...draft.printers,
                  { name: "Bench", bedXmm: "256", bedYmm: "256", bedZmm: "256", isDefault: false },
                ],
              })
            }
          >
            Add printer
          </Button>
        </div>
        {draft.printers.map((printer, index) => (
          <div key={printer.id ?? `printer-${index}`} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
            <Field
              label="Name"
              value={printer.name}
              onChange={(name) => updatePrinter(index, { name })}
            />
            <Field label="Bed X mm" value={printer.bedXmm} onChange={(bedXmm) => updatePrinter(index, { bedXmm })} />
            <Field label="Bed Y mm" value={printer.bedYmm} onChange={(bedYmm) => updatePrinter(index, { bedYmm })} />
            <Field label="Bed Z mm" value={printer.bedZmm} onChange={(bedZmm) => updatePrinter(index, { bedZmm })} />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="radio"
                name="default-printer"
                checked={printer.isDefault}
                onChange={() =>
                  setDraft({
                    ...draft,
                    printers: draft.printers.map((item, itemIndex) => ({
                      ...item,
                      isDefault: itemIndex === index,
                    })),
                  })
                }
              />
              Default printer
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, printers: draft.printers.filter((_, itemIndex) => itemIndex !== index) })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl">Materials</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                ...draft,
                materials: [
                  ...draft.materials,
                  {
                    name: "New filament",
                    pricePerGram: "0.030",
                    pricePerMachineHour: "7",
                    densityGPerCm3: "1.25",
                    colors: "Black",
                  },
                ],
              })
            }
          >
            Add material
          </Button>
        </div>
        {draft.materials.map((material, index) => (
          <div key={material.id ?? `material-${index}`} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
            <Field label="Name" value={material.name} onChange={(name) => updateMaterial(index, { name })} />
            <Field
              label="Dollars per gram"
              value={material.pricePerGram}
              onChange={(pricePerGram) => updateMaterial(index, { pricePerGram })}
            />
            <Field
              label="Dollars per machine-hour"
              value={material.pricePerMachineHour}
              onChange={(pricePerMachineHour) => updateMaterial(index, { pricePerMachineHour })}
            />
            <Field
              label="Density g/cm³"
              value={material.densityGPerCm3}
              onChange={(densityGPerCm3) => updateMaterial(index, { densityGPerCm3 })}
            />
            <div className="sm:col-span-2">
              <Field
                label="Colors, comma separated"
                value={material.colors}
                onChange={(colors) => updateMaterial(index, { colors })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, materials: draft.materials.filter((_, itemIndex) => itemIndex !== index) })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Saved. New quotes use these rates.</p> : null}
      <Button type="submit" size="lg" className="h-11" disabled={saving}>
        {saving ? "Saving…" : "Save shop"}
      </Button>
    </form>
  );

  function updatePrinter(index: number, patch: Partial<Draft["printers"][number]>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            printers: current.printers.map((printer, itemIndex) =>
              itemIndex === index ? { ...printer, ...patch } : printer,
            ),
          }
        : current,
    );
  }

  function updateMaterial(index: number, patch: Partial<Draft["materials"][number]>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            materials: current.materials.map((material, itemIndex) =>
              itemIndex === index ? { ...material, ...patch } : material,
            ),
          }
        : current,
    );
  }
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
