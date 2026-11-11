"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Copy, Download, Mail, Megaphone, MessageSquare, RefreshCw,
  Send, ShoppingCart, Tag, Trash2, TrendingUp,
} from "lucide-react";
import { api, ApiError } from "@/lib/live";
import { formatBDT } from "@/lib/format";
import { Badge, BarList, Button, CHART_HUES, Empty, Panel, Stat } from "@/components/admin/admin-ui";

const SUBTABS = [
  { id: "attribution", label: "Attribution & spend", icon: TrendingUp },
  { id: "promos", label: "Promos", icon: Tag },
  { id: "carts", label: "Abandoned carts", icon: ShoppingCart },
  { id: "outbox", label: "Message outbox", icon: Send },
  { id: "events", label: "Event log", icon: Activity },
] as const;

export function OwnerGrowth({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState<(typeof SUBTABS)[number]["id"]>("attribution");
  return (
    <>
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight">Growth</h1>
        <p className="text-[0.78rem] text-[#6e6e73]">Ad spend, attribution, recovery and measurement in one place.</p>
      </div>
      <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
        {SUBTABS.map((entry) => (
          <button key={entry.id} type="button" className="adm-chip inline-flex items-center gap-1.5" data-active={tab === entry.id} onClick={() => setTab(entry.id)}>
            <entry.icon size={12} /> {entry.label}
          </button>
        ))}
      </div>
      {tab === "attribution" && <Attribution toast={toast} />}
      {tab === "promos" && <Promos toast={toast} />}
      {tab === "carts" && <Carts toast={toast} />}
      {tab === "outbox" && <Outbox toast={toast} />}
      {tab === "events" && <Events />}
    </>
  );
}

/* ------------------------------------------------------------------ */

type Channel = { channel: string; orders: number; revenue: number; spend: number; roas: number; aov: number };

function Attribution({ toast }: { toast: (message: string) => void }) {
  const [days, setDays] = useState(14);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [spend, setSpend] = useState<Array<{ date: string; channel: string; amount: number }>>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState("meta");
  const [amount, setAmount] = useState("");
  const [campaign, setCampaign] = useState("eid-cells-sale");
  const [content, setContent] = useState("video-hook-01");

  const load = useCallback(async () => {
    const [overview, spendRows] = await Promise.all([
      api<{ channels: Channel[] }>(`/api/admin/overview?days=${days}`),
      api<{ spend: Array<{ date: string; channel: string; amount: number }> }>(`/api/admin/spend?days=${days}`),
    ]);
    setChannels(overview.channels);
    setSpend(spendRows.spend);
  }, [days]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const totals = channels.reduce(
    (acc, row) => ({ revenue: acc.revenue + row.revenue, spend: acc.spend + row.spend, orders: acc.orders + row.orders }),
    { revenue: 0, spend: 0, orders: 0 },
  );
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const link = `/shop?utm_source=facebook&utm_medium=paid_social&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${encodeURIComponent(content)}`;

  const recent = (() => {
    const map = new Map<string, Record<string, number>>();
    spend.forEach((row) => {
      const entry = map.get(row.date) ?? {};
      entry[row.channel] = row.amount;
      map.set(row.date, entry);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  })();

  return (
    <>
      <div className="adm-kpis">
        <Stat label="Attributed revenue" value={formatBDT(totals.revenue)} hint={`${totals.orders} orders`} icon={<TrendingUp size={16} />} />
        <Stat label="Ad spend" value={formatBDT(totals.spend)} hint={`last ${days} days`} tone="amber" icon={<Megaphone size={16} />} />
        <Stat label="Blended ROAS" value={roas ? `${roas.toFixed(2)}×` : "—"} tone={roas >= 2 ? "emerald" : "rose"} hint={roas >= 3 ? "Scale budget" : roas >= 1.6 ? "Hold and optimise" : "Below breakeven"} />
        <Stat label="Cost per order" value={totals.orders ? formatBDT(Math.round(totals.spend / totals.orders)) : "—"} tone="sky" />
      </div>

      <div className="adm-grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel
          title="Channel return"
          subtitle="Revenue is first-touch attributed from the ad click"
          action={
            <div className="flex gap-1.5">
              {[7, 14, 30].map((value) => (
                <button key={value} type="button" className="adm-chip" data-active={days === value} onClick={() => setDays(value)}>{value}d</button>
              ))}
            </div>
          }
        >
          {channels.length === 0 ? (
            <Empty title="No attributed orders in this window" />
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead><tr><th>Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">Spend</th><th className="text-right">ROAS</th></tr></thead>
                  <tbody>
                    {channels.map((row, index) => (
                      <tr key={row.channel}>
                        <td><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: CHART_HUES[index % CHART_HUES.length] }} /><span className="capitalize">{row.channel}</span></span></td>
                        <td className="adm-num text-right">{row.orders}</td>
                        <td className="adm-num text-right">{formatBDT(row.revenue)}</td>
                        <td className="adm-num text-right text-[#6e6e73]">{row.spend ? formatBDT(row.spend) : "—"}</td>
                        <td className="adm-num text-right">{row.roas ? <Badge tone={row.roas >= 2 ? "emerald" : row.roas >= 1 ? "amber" : "rose"}>{row.roas.toFixed(2)}×</Badge> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <BarList rows={channels.map((row) => ({ label: row.channel, value: row.revenue, caption: `${row.orders} orders · ${formatBDT(row.spend)} spent` }))} format={formatBDT} />
              </div>
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-3.5">
          <Panel title="Log ad spend" subtitle="Feeds ROAS and contribution profit">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="adm-field"><span className="adm-field-label">Date</span>
                <input type="date" className="adm-input" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="adm-field"><span className="adm-field-label">Channel</span>
                <select className="adm-select" value={channel} onChange={(event) => setChannel(event.target.value)}>
                  <option value="meta">Meta (Facebook / Instagram)</option>
                  <option value="google">Google Ads</option>
                  <option value="tiktok">TikTok</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label className="adm-field mt-2.5"><span className="adm-field-label">Amount ৳</span>
              <input className="adm-input adm-num" inputMode="numeric" placeholder="1200" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <Button
              variant="primary" className="mt-2.5 w-full" disabled={!amount || Number(amount) < 0}
              onClick={() => {
                void api("/api/admin/spend", { method: "POST", body: { date, channel, amount: Number(amount) } })
                  .then(() => { setAmount(""); toast("Spend saved"); return load(); })
                  .catch((error: unknown) => toast(error instanceof ApiError ? error.message : "Could not save."));
              }}
            >
              Save spend
            </Button>
            <p className="adm-field-hint mt-1.5">Saving ৳0 for a day removes that row.</p>
            <div className="adm-table-wrap mt-3">
              <table className="adm-table">
                <thead><tr><th>Date</th><th className="text-right">Meta</th><th className="text-right">Google</th><th className="text-right">TikTok</th></tr></thead>
                <tbody>
                  {recent.map(([day, values]) => (
                    <tr key={day}>
                      <td className="adm-num text-[0.72rem]">{day.slice(5)}</td>
                      <td className="adm-num text-right">{values.meta ? formatBDT(values.meta) : "—"}</td>
                      <td className="adm-num text-right">{values.google ? formatBDT(values.google) : "—"}</td>
                      <td className="adm-num text-right">{values.tiktok ? formatBDT(values.tiktok) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Campaign link builder" subtitle="Tagged links make attribution exact">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="adm-field"><span className="adm-field-label">Campaign</span>
                <input className="adm-input" value={campaign} onChange={(event) => setCampaign(event.target.value)} />
              </label>
              <label className="adm-field"><span className="adm-field-label">Ad content</span>
                <input className="adm-input" value={content} onChange={(event) => setContent(event.target.value)} />
              </label>
            </div>
            <p className="adm-mono mt-2.5 break-all rounded-lg border border-[#e3e3e8] bg-[#f5f5f7] p-2.5 text-[0.68rem] leading-relaxed text-[#0369a1]">{link}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${link}`); toast("Campaign link copied"); }}><Copy size={12} /> Copy link</Button>
              <Button size="sm" variant="ghost" onClick={() => { window.location.assign("/api/admin/export/catalogue.csv"); toast("Product feed downloading"); }}><Download size={12} /> Product feed</Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

type Promo = {
  code: string; label: string; type: string; value: number; minSubtotal: number;
  maxDiscount: number | null; active: boolean; startsAt: string | null; endsAt: string | null; perPhoneLimit: number;
};

function Promos({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Promo[]>([]);
  const [form, setForm] = useState({ code: "", label: "", type: "percent", value: "10", minSubtotal: "1000", maxDiscount: "", active: true, perPhoneLimit: "1" });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const payload = await api<{ promos: Promo[] }>("/api/admin/promos");
    setRows(payload.promos);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const fail = (error: unknown) => toast(error instanceof ApiError ? error.message : "That did not work. Try again.");
  const reset = () => {
    setForm({ code: "", label: "", type: "percent", value: "10", minSubtotal: "1000", maxDiscount: "", active: true, perPhoneLimit: "1" });
    setEditing(null);
  };

  const save = async () => {
    if (!form.code.trim() || !form.label.trim()) {
      toast("Code and label are required.");
      return;
    }
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        label: form.label.trim(),
        type: form.type,
        value: Math.max(0, Math.round(Number(form.value) || 0)),
        minSubtotal: Math.max(0, Math.round(Number(form.minSubtotal) || 0)),
        maxDiscount: form.maxDiscount === "" ? null : Math.max(0, Math.round(Number(form.maxDiscount) || 0)),
        active: form.active,
        perPhoneLimit: Math.max(1, Math.round(Number(form.perPhoneLimit) || 1)),
      };
      if (editing) {
        await api(`/api/admin/promos/${encodeURIComponent(editing)}`, { method: "PATCH", body: payload });
        toast("Promo saved");
      } else {
        await api("/api/admin/promos", { method: "POST", body: payload });
        toast("Promo created");
      }
      reset();
      await load();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="adm-grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={editing ? `Edit ${editing}` : "New promo"} subtitle="Validated server-side at checkout">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="adm-field"><span className="adm-field-label">Code</span>
            <input className="adm-input adm-mono" value={form.code} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-field-label">Label</span>
            <input className="adm-input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-field-label">Type</span>
            <select className="adm-select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="percent">Percent off</option>
              <option value="flat">Flat ৳ off</option>
              <option value="shipping">Free shipping</option>
            </select>
          </label>
          <label className="adm-field"><span className="adm-field-label">{form.type === "percent" ? "Percent" : "Amount ৳"}</span>
            <input className="adm-input adm-num" inputMode="numeric" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-field-label">Min subtotal ৳</span>
            <input className="adm-input adm-num" inputMode="numeric" value={form.minSubtotal} onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-field-label">Max discount ৳ (optional)</span>
            <input className="adm-input adm-num" inputMode="numeric" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-field-label">Uses per phone</span>
            <input className="adm-input adm-num" inputMode="numeric" value={form.perPhoneLimit} onChange={(event) => setForm({ ...form, perPhoneLimit: event.target.value })} />
          </label>
          <label className="inline-flex items-center gap-2 self-end pb-2 text-[0.8rem]">
            <input type="checkbox" className="adm-checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => void save()}>{editing ? "Save" : "Create"}</Button>
          {editing && <Button variant="ghost" onClick={reset}>Cancel</Button>}
        </div>
      </Panel>

      <Panel title="Promos" subtitle={`${rows.length} total`}>
        <ul className="flex flex-col gap-2">
          {rows.map((promo) => (
            <li key={promo.code} className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="adm-mono text-[0.82rem] font-bold text-[#4d7c0f]">{promo.code}</span>
                <Badge tone={promo.active ? "emerald" : "rose"}>{promo.active ? "active" : "off"}</Badge>
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditing(promo.code);
                    setForm({
                      code: promo.code, label: promo.label, type: promo.type, value: String(promo.value),
                      minSubtotal: String(promo.minSubtotal), maxDiscount: promo.maxDiscount == null ? "" : String(promo.maxDiscount),
                      active: promo.active, perPhoneLimit: String(promo.perPhoneLimit),
                    });
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    void api(`/api/admin/promos/${encodeURIComponent(promo.code)}`, { method: "DELETE" })
                      .then(() => { toast("Promo deleted"); return load(); })
                      .catch(fail);
                  }} aria-label={`Delete ${promo.code}`}><Trash2 size={12} /></Button>
                </span>
              </div>
              <p className="mt-1 text-[0.72rem] text-[#6e6e73]">
                {promo.label} · {promo.type === "percent" ? `${promo.value}%` : promo.type === "flat" ? formatBDT(promo.value) : "free shipping"}
                {promo.minSubtotal > 0 && ` · min ${formatBDT(promo.minSubtotal)}`}
              </p>
            </li>
          ))}
          {rows.length === 0 && <Empty title="No promos yet" />}
        </ul>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Cart = {
  id: string; phone: string; customerName: string | null;
  items: Array<{ slug: string; name: string; qty: number; price: number }>;
  value: number; source: string | null; recovered: boolean; remindedAt: string | null; updatedAt: string;
};

function Carts({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Cart[]>([]);
  const [showRecovered, setShowRecovered] = useState(false);

  const load = useCallback(async () => {
    const params = showRecovered ? "" : "?recovered=false";
    const payload = await api<{ carts: Cart[] }>(`/api/admin/carts${params}`);
    setRows(payload.carts);
  }, [showRecovered]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const open = rows.filter((cart) => !cart.recovered);
  const recoverable = open.reduce((sum, cart) => sum + cart.value, 0);

  const act = async (id: string, action: "remind" | "recovered" | "delete", message: string) => {
    try {
      if (action === "delete") await api(`/api/admin/carts/${encodeURIComponent(id)}`, { method: "DELETE" });
      else await api(`/api/admin/carts/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      toast(message);
      await load();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "That did not work. Try again.");
    }
  };

  return (
    <>
      <div className="adm-kpis">
        <Stat label="Open carts" value={String(open.length)} icon={<ShoppingCart size={16} />} />
        <Stat label="Recoverable value" value={formatBDT(recoverable)} tone="amber" />
        <Stat label="Reminded" value={String(rows.filter((cart) => cart.remindedAt).length)} tone="sky" />
      </div>
      <Panel
        title="Abandoned checkouts"
        subtitle="Bags left after contact details were entered"
        action={<button type="button" className="adm-chip" data-active={showRecovered} onClick={() => setShowRecovered((value) => !value)}>Include recovered</button>}
      >
        {rows.length === 0 ? (
          <Empty icon={<ShoppingCart size={22} />} title="No abandoned carts" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Shopper</th><th>Bag</th><th className="text-right">Value</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((cart) => (
                  <tr key={cart.id}>
                    <td><p className="font-medium">{cart.customerName || "Unnamed"}</p><p className="adm-num text-[0.68rem] text-[#6e6e73]">{cart.phone}</p></td>
                    <td className="text-[0.73rem] text-[#3a3a3c]">{cart.items.map((item) => `${item.qty}× ${item.name}`).join(", ").slice(0, 60)}</td>
                    <td className="adm-num text-right">{formatBDT(cart.value)}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        {cart.recovered ? <Badge tone="emerald">Recovered</Badge> : (
                          <Button size="sm" variant={cart.remindedAt ? "default" : "primary"} onClick={() => void act(cart.id, "remind", "Reminder sent")}>
                            <Send size={12} /> {cart.remindedAt ? "Remind again" : "Send reminder"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void act(cart.id, "delete", "Cart dismissed")} aria-label="Dismiss cart"><Trash2 size={12} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */

type OutboxRow = {
  id: number; channel: string; recipient: string; template: string; subject: string | null;
  body: string; orderNumber: string | null; status: string; error: string | null; createdAt: string;
};

function Outbox({ toast }: { toast: (message: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = filter === "all" ? "" : `?status=${filter}`;
    const payload = await api<{ messages: OutboxRow[] }>(`/api/admin/outbox${params}`);
    setRows(payload.messages);
  }, [filter]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  return (
    <Panel
      title="Customer messages"
      subtitle="Every confirmation, status update and recovery message the store generates"
      action={
        <div className="flex flex-wrap gap-1.5">
          {(["all", "queued", "sent", "failed", "skipped"] as const).map((option) => (
            <button key={option} type="button" className="adm-chip capitalize" data-active={filter === option} onClick={() => setFilter(option)}>{option}</button>
          ))}
          <Button size="sm" variant="primary" disabled={busy} onClick={() => {
            setBusy(true);
            void api<{ sent: number; failed: number; skipped: number }>("/api/admin/outbox/flush", { method: "POST" })
              .then((result) => { toast(`Delivered ${result.sent} · ${result.failed} failed · ${result.skipped} held`); return load(); })
              .catch((error: unknown) => toast(error instanceof ApiError ? error.message : "Flush failed."))
              .finally(() => setBusy(false));
          }}>
            <RefreshCw size={12} /> Deliver queue
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty icon={<MessageSquare size={22} />} title="Nothing in the outbox" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((message) => (
            <li key={message.id} className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {message.channel === "email" ? <Mail size={13} className="text-[#0a84ff]" /> : <MessageSquare size={13} className="text-[#4d7c0f]" />}
                <span className="text-[0.79rem] font-semibold">{message.subject}</span>
                <Badge tone={message.status === "sent" ? "emerald" : message.status === "queued" ? "sky" : "amber"}>{message.status}</Badge>
                <span className="adm-num ml-auto text-[0.68rem] text-[#6e6e73]">{message.recipient}</span>
              </div>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[#3a3a3c]">{message.body}</p>
              <p className="mt-1 text-[0.66rem] text-[#8e8e93]">
                {new Date(message.createdAt).toLocaleString("en-GB")} · {message.template}
                {message.error ? ` · ${message.error}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Events() {
  const [rows, setRows] = useState<Array<{ id: number; name: string; params: Record<string, unknown>; destinations: string[]; createdAt: string }>>([]);
  const [name, setName] = useState("all");

  const load = useCallback(async () => {
    const params = name === "all" ? "" : `?name=${name}`;
    const payload = await api<{ events: Array<{ id: number; name: string; params: Record<string, unknown>; destinations: string[]; createdAt: string }> }>(`/api/admin/events${params}`);
    setRows(payload.events);
  }, [name]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const names = ["all", "PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "Contact"];

  return (
    <Panel
      title="Event log"
      subtitle="Server-side record of every tracked event — compare with Meta Events Manager"
      action={
        <div className="flex flex-wrap gap-1.5">
          <select className="adm-select w-auto" value={name} onChange={(event) => setName(event.target.value)} aria-label="Filter events">
            {names.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All events" : entry}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw size={12} /> Refresh</Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty icon={<Activity size={22} />} title="No events yet" body="Browse the storefront to generate tracking events." />
      ) : (
        <ul className="adm-scroll flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
          {rows.map((event) => (
            <li key={event.id} className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.79rem] font-semibold text-[#4d7c0f]">{event.name}</span>
                {event.destinations.map((destination) => <Badge key={destination} tone="sky">{destination}</Badge>)}
                <span className="adm-num ml-auto text-[0.66rem] text-[#8e8e93]">{new Date(event.createdAt).toLocaleString("en-GB")}</span>
              </div>
              <p className="adm-mono mt-1 break-all text-[0.66rem] leading-relaxed text-[#6e6e73]">
                {Object.entries(event.params ?? {}).slice(0, 6).map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("  ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
