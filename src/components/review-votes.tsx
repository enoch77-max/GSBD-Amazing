"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

function voterKey(): string {
  const key = "gsbd-voter-key";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 20) return existing;
    const value = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, value);
    return value;
  } catch {
    return "anonymous-browser";
  }
}

export function ReviewVotes({ reviewId, initialCount = 0 }: { reviewId: number; initialCount?: number }) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function vote() {
    if (voted || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voterKey: voterKey() }),
      });
      const data = (await response.json()) as { helpfulCount?: number; voted?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save your vote.");
      setCount(data.helpfulCount ?? count + 1);
      setVoted(true);
    } catch {
      /* Voting is optional and must never interrupt reading reviews. */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="review-helpful"
      onClick={() => void vote()}
      disabled={busy || voted}
      aria-pressed={voted}
      aria-label={voted ? `Marked helpful, ${count} votes` : `Mark review helpful, ${count} votes`}
    >
      <ThumbsUp size={12} fill={voted ? "currentColor" : "none"} />
      Helpful <span className="font-mono">{count}</span>
    </button>
  );
}
