"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/format";

export function CopyOrderButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={cn(
        "inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 font-mono text-[0.7rem] font-medium text-ink transition-colors hover:border-ink",
        className,
      )}
      aria-label={`Copy ${value}`}
    >
      {copied ? (
        <>
          <Check size={12} className="text-[#3d7a2f]" strokeWidth={3} /> Copied
        </>
      ) : (
        <>
          <Copy size={12} /> Copy ID
        </>
      )}
    </button>
  );
}
