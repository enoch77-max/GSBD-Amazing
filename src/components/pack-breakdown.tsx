"use client";

import Link from "next/link";
import { Battery, Check, ChevronDown, ExternalLink, Settings2, ShieldCheck, Wrench } from "lucide-react";
import type { CartLine } from "@/lib/cart";
import { calculatePack, type PackComponent, type PackConfiguration } from "@/lib/pack-builder";
import { readAllProducts } from "@/lib/queries";
import { formatBDT } from "@/lib/format";

export function packBuilderUrl(config: PackConfiguration, editSlug?: string): string {
  const params = new URLSearchParams({
    cell: config.cellId,
    s: String(config.series),
    p: String(config.parallel),
    load: String(config.loadCurrentA ?? 10),
  });
  if (config.extras?.length) params.set("extras", config.extras.join(","));
  if (editSlug) params.set("edit", editSlug);
  return `/pack-builder?${params.toString()}`;
}

function componentIcon(component: PackComponent) {
  if (component.kind === "cells") return Battery;
  if (component.kind === "bms") return ShieldCheck;
  if (component.kind === "testing") return Check;
  return Wrench;
}

/** Uses the cart line's snapshot, never a separate localStorage read. */
export function PackBreakdown({ line, onNavigate, editable = true }: { line: CartLine; onNavigate?: () => void; editable?: boolean }) {
  if (!line.customPack) return null;
  let components = Array.isArray(line.packComponents)
    ? line.packComponents.filter((component) => component && typeof component.name === "string" && typeof component.total === "number")
    : [];
  let estimated = false;
  if (!components.length && editable) {
    try {
      components = calculatePack(line.customPack, { products: readAllProducts() }).components;
      estimated = true;
    } catch {
      components = [];
    }
  }
  return (
    <details className="cart-pack-details" open>
      <summary>
        <span>Inside this build <small>{components.length} items</small></span>
        <ChevronDown size={15} />
      </summary>
      {components.length > 0 ? <ul>
        {components.map((component) => {
          const Icon = componentIcon(component);
          const label = component.slug ? (
            <Link href={`/product/${component.slug}`} onClick={onNavigate} className="cart-pack-component-link">
              {component.name} <ExternalLink size={11} />
            </Link>
          ) : <span>{component.name}</span>;
          return (
            <li key={component.key}>
              <span className="cart-pack-icon"><Icon size={14} /></span>
              <span className="cart-pack-name">{label}<small>{component.qty > 1 ? `${component.qty} × ${formatBDT(component.unitPrice)}` : "1 unit"}{!component.required ? " · optional" : ""}</small></span>
              <strong>{formatBDT(component.total)}</strong>
            </li>
          );
        })}
      </ul> : <p className="cart-pack-empty">The itemised component snapshot is unavailable for this older order. Contact the workshop for details.</p>}
      <div className="cart-pack-footer">
        <span>{estimated ? "Current estimate, confirm before ordering" : "Prices shown per pack"}</span>
        {editable && <Link href={packBuilderUrl(line.customPack, line.slug)} onClick={onNavigate}>
          <Settings2 size={13} /> Edit build
        </Link>}
      </div>
    </details>
  );
}