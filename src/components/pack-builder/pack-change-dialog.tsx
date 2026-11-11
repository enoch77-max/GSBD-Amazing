"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, X } from "lucide-react";
import type { PackResult } from "@/lib/pack-builder";
import type { CustomAlternative } from "@/lib/pack-availability";
import { formatBDT } from "@/lib/format";
import { formatRuntime } from "@/lib/pack-planning";

export function PackChangeDialog({ current, option, onClose, onApply }: {
  current: PackResult;
  option: CustomAlternative;
  onClose: () => void;
  onApply: (option: CustomAlternative) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const message = await onApply(option);
      if (message) setError(message);
      else onClose();
    } catch {
      setError("Could not recheck this build. Please try again; nothing has changed.");
    } finally {
      setBusy(false);
    }
  }
  const next = option.result;
  const rows = [
    ["Cells", current.cell.label, next.cell.label],
    ["Layout", `${current.config.series}S${current.config.parallel}P`, `${next.config.series}S${next.config.parallel}P`],
    ["Nominal / charge", `${current.nominalVoltage}V / ${current.chargeVoltage}V`, `${next.nominalVoltage}V / ${next.chargeVoltage}V`],
    ["Capacity", `${current.capacityAh}Ah`, `${next.capacityAh}Ah`],
    ["Dimensions", `${current.dimensionsMm.length} x ${current.dimensionsMm.width} x ${current.dimensionsMm.height} mm`, `${next.dimensionsMm.length} x ${next.dimensionsMm.width} x ${next.dimensionsMm.height} mm`],
    ["Build estimate", option.priceDelta === null ? "Incomplete" : formatBDT(current.price), formatBDT(next.price)],
  ];

  return createPortal(
    <dialog ref={dialog} className="pack-change-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <button type="button" disabled={busy} onClick={onClose} className="pack-change-close" aria-label="Close build comparison"><X size={19} /></button>
      <p className="builder-step">BEFORE YOU SWITCH</p>
      <h2 id={titleId}>Review your new build</h2>
      <p>Your load stays the same. Nothing is added to your bag yet.</p>
      <table className="pack-change-table">
        <thead><tr><th scope="col">Specification</th><th scope="col">Current</th><th scope="col">New build</th></tr></thead>
        <tbody>{rows.map(([label, before, after]) => <tr key={label}><th scope="row">{label}</th><td>{before}</td><td data-changed={before !== after}>{after}</td></tr>)}</tbody>
      </table>
      <p className="pack-change-runtime">Estimated runtime at your load: <strong>{formatRuntime(option.runtimeH)}</strong>. {option.meetsTarget ? "Meets the selected target." : "Below the selected runtime target."}</p>
      {option.warnings.length > 0 && <ul className="pack-change-warnings">{option.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {option.removedExtras.length > 0 && <label className="pack-change-acknowledge"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(e) => setAcknowledged(e.target.checked)} /> <span>I agree to leave out: <strong>{option.removedExtras.join(", ")}</strong>.</span></label>}
      {error && <p className="pack-match-error" role="alert">{error}</p>}
      <div className="pack-change-actions">
        <button type="button" className="btn btn-outline" autoFocus disabled={busy} onClick={onClose}>Keep my build</button>
        <button type="button" className="btn btn-buy" disabled={busy || (option.removedExtras.length > 0 && !acknowledged)} onClick={() => void apply()}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> Checking stock</> : <>Apply this build <ArrowRight size={15} /></>}
        </button>
      </div>
      <p className="pack-change-footnote">You can undo this change. Stock is rechecked now and again at checkout.</p>
    </dialog>, document.body,
  );
}