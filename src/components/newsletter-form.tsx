"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/format";
import { api, ApiError, isLive } from "@/lib/live";

export function NewsletterForm({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That email does not look right.");
      return;
    }
    setError(null);
    setState("loading");
    if (isLive()) {
      try {
        await api("/api/newsletter", { method: "POST", body: { email } });
        setState("done");
      } catch (error) {
        setError(error instanceof ApiError ? error.message : "Could not join the list. Try again.");
        setState("idle");
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    setState("done");
  }

  if (state === "done") {
    return (
      <div
        className={cn(
          "animate-scale-in flex items-center gap-3 rounded-2xl border p-4",
          variant === "dark" ? "border-volt/30 bg-volt/10" : "border-line bg-cream",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-volt text-ink">
          <Check size={16} />
        </span>
        <div>
          <p className="text-[0.88rem] font-semibold">You are on the bench list.</p>
          <p className={cn("text-[0.78rem]", variant === "dark" ? "text-cream/60" : "text-muted")}>
            Build notes, restocks and one honest discount — no spam.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border p-1.5 pl-4 transition-colors",
          variant === "dark"
            ? "border-cream/20 bg-cream/5 focus-within:border-volt/60"
            : "border-line bg-white focus-within:border-ink",
        )}
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@workshop.com"
          aria-label="Email address"
          className={cn(
            "h-9 min-w-0 flex-1 bg-transparent text-[0.85rem] outline-none",
            variant === "dark" ? "text-cream placeholder:text-cream/35" : "text-ink",
          )}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className={cn(
            "btn btn-sm shrink-0 rounded-full",
            variant === "dark" ? "btn-volt" : "btn-primary",
          )}
        >
          {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : <>Join <ArrowRight size={14} /></>}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[0.72rem] text-ember">{error}</p>
      ) : (
        <p className={cn("mt-2 text-[0.7rem]", variant === "dark" ? "text-cream/40" : "text-muted")}>
          Two emails a month. Restock alerts, build guides, no noise.
        </p>
      )}
    </form>
  );
}
