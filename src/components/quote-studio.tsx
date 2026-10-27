"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const ModelPreview = dynamic(
  () => import("@/components/model-preview").then((mod) => mod.ModelPreview),
  { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">Loading preview…</p> },
);
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_UPLOAD_BYTES, PURPOSES, SAMPLES, colorHex } from "@/lib/constants";
import type { PurposeId } from "@/lib/constants";
import type { ShopDTO } from "@/lib/types";

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function QuoteStudio() {
  const router = useRouter();
  const [shop, setShop] = useState<ShopDTO | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [color, setColor] = useState("");
  const [printerId, setPrinterId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState<PurposeId>("general");
  const [rush, setRush] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then(async (response) => {
        const payload = (await response.json()) as ShopDTO & { message?: string };
        if (!response.ok) throw new Error(payload.message || "The shop could not be loaded.");
        if (cancelled) return;
        setShop(payload);
        const material = payload.materials[0];
        const printer = payload.printers.find((item) => item.isDefault) ?? payload.printers[0];
        if (material) {
          setMaterialId(material.id);
          setColor(material.colors[0] ?? "");
        }
        if (printer) setPrinterId(printer.id);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setShopError(reason instanceof Error ? reason.message : "The shop could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoadingShop(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const material = shop?.materials.find((item) => item.id === materialId) ?? shop?.materials[0];
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(next: File | null) {
    setError(null);
    if (!next) return;
    const lower = next.name.toLowerCase();
    if (!lower.endsWith(".stl") && !lower.endsWith(".3mf")) {
      setError("Use an .stl or .3mf file.");
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setError("That file is over the 25 MB cap.");
      return;
    }
    setFile(next);
  }

  async function loadSample(name: string) {
    setError(null);
    const response = await fetch(`/samples/${name}`);
    if (!response.ok) {
      setError("The sample file is missing from this build.");
      return;
    }
    const blob = await response.blob();
    chooseFile(new File([blob], name));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !material) return;
    setSubmitting(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("materialId", material.id);
    body.set("printerId", printerId);
    body.set("color", color);
    body.set("quantity", String(quantity));
    body.set("purpose", purpose);
    body.set("rush", rush ? "true" : "false");
    try {
      const response = await fetch("/api/quotes", { method: "POST", body });
      const payload = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.message || "The quote did not finish.");
      }
      router.push(`/q/${payload.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The quote did not finish.");
      setSubmitting(false);
    }
  }

  if (loadingShop) {
    return <p className="text-sm text-muted-foreground">Loading the shop…</p>;
  }
  if (shopError || !shop || !material) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-card p-6">
        <h1 className="font-heading text-2xl">The shop is not ready</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {shopError || "Seed the database, then reload this page."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{shop.name}</p>
          <h1 className="font-heading text-4xl tracking-tight text-balance">
            A price from the slicer, not a guess.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Drop an STL or 3MF. PlateQuote slices it for grams and time, then applies {shop.name}&apos;s
            rates. The written review explains the print. It never sets the price.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div
            className={`border-b border-border p-4 ${dragOver ? "bg-accent" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              chooseFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{file ? file.name : "Drop a mesh here"}</p>
                <p className="text-xs text-muted-foreground">
                  STL or 3MF, up to 25 MB.
                  {file ? ` ${(file.size / 1024).toFixed(0)} KB.` : ""}
                </p>
              </div>
              <Label className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm">
                Browse
                <input
                  type="file"
                  accept=".stl,.3mf,model/stl,model/3mf"
                  className="sr-only"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                />
              </Label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.file}
                  type="button"
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                  onClick={() => loadSample(sample.file)}
                >
                  Try {sample.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-80">
            <ModelPreview url={previewUrl} filename={file?.name ?? ""} color={colorHex(color)} />
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-heading text-2xl">Job options</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Minimum order ${shop.minimumOrder.toFixed(2)}. Rush adds ${shop.rushFee.toFixed(2)} after
            that minimum. Bed{" "}
            {shop.printers.find((printer) => printer.id === printerId)?.bedXmm ?? "—"} ×{" "}
            {shop.printers.find((printer) => printer.id === printerId)?.bedYmm ?? "—"} ×{" "}
            {shop.printers.find((printer) => printer.id === printerId)?.bedZmm ?? "—"} mm.
          </p>
        </div>

        {shop.printers.length > 1 ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Printer</span>
            <select className={fieldClass} value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
              {shop.printers.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {printer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">Material</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {shop.materials.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMaterialId(item.id);
                  setColor(item.colors[0] ?? "");
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${
                  item.id === material.id ? "border-primary bg-accent" : "border-border"
                }`}
              >
                <span className="font-medium">{item.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  ${item.pricePerGram.toFixed(3)}/g · ${item.pricePerMachineHour.toFixed(0)}/machine-hour
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Color</p>
          <div className="flex flex-wrap gap-2">
            {material.colors.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setColor(name)}
                className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
                  color === name ? "border-primary" : "border-border"
                }`}
              >
                <span className="size-3 rounded-full border border-border" style={{ background: colorHex(name) }} />
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Quantity</span>
            <input
              className={fieldClass}
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">What is it for?</span>
            <select
              className={fieldClass}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as PurposeId)}
            >
              {PURPOSES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={rush} onChange={(event) => setRush(event.target.checked)} className="mt-1" />
          <span>
            Rush this job
            <span className="block text-xs text-muted-foreground">
              A flat fee, added after the minimum order. It does not change the slice.
            </span>
          </span>
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" size="lg" className="h-11 w-full" disabled={!file || submitting}>
          {submitting ? "Slicing on the server…" : "Slice and price"}
        </Button>
        {submitting ? (
          <p className="text-xs text-muted-foreground">
            A small part usually finishes within a minute. The price waits for the slicer.
          </p>
        ) : null}
      </form>
    </div>
  );
}
