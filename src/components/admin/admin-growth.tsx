"use client";

/**
 * Growth & Ads — six actionable channel cards.
 * Each card shows spend, revenue and ROAS with a budget stepper and a live
 * switch. Carts, messaging and pixel tooling live behind one disclosure so the
 * default view stays decision-shaped.
 */
import { useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, ChevronDown, Mail, Megaphone, MessageSquare, RefreshCw, Search, Send,
  ShoppingCart, Sparkles, Trash2, TrendingUp, Truck, Zap,
} from "lucide-react";
import { ops, type CampaignChannel } from "@/db/ops-store";
import { formatBDT } from "@/lib/format";
import { allSpend, channelReport, flushOutbox, listOrders, queueAbandonedCart } from "@/lib/ops";
import { can } from "@/lib/ops";
import { Badge, Button, Empty, PageHead, ReadOnlyNote } from "./admin-ui";

type ChannelId = CampaignChannel | "google" | "meta" | "tiktok";
const PAID: Array<{ id: CampaignChannel; label: string; detail: string; icon: React.ReactNode; spendKey: string | null; revenueKey: string | null }> = [
  { id: "google", label: "Google Shopping", detail: "Search + Shopping feed · intent traffic", icon: <Search size={17} />, spendKey: "google", revenueKey: "google" },
  { id: "meta", label: "Meta Ads", detail: "Facebook + Instagram · prospecting & retarget", icon: <Megaphone size={17} />, spendKey: "meta", revenueKey: "facebook" },
  { id: "carts", label: "Abandoned cart recovery", detail: "WhatsApp + SMS nudges after checkout drop-off", icon: <ShoppingCart size={17} />, spendKey: null, revenueKey: null },
  { id: "upsell", label: "AI upsell popups", detail: "Battery Builder add-on suggestions at bag", icon: <Sparkles size={17} />, spendKey: null, revenueKey: null },
];

const roasTone = (roas: number) => roas > 3 ? "up" : roas >= 2 ? "warn" : "down";

export function AdminGrowth({ toast }: { toast: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const [days, setDays] = useState(14);
  const [open, setOpen] = useState<"none" | "carts" | "outbox" | "pixels">("none");
  const manage = can("marketing.manage");
  const refresh = () => setRevision((value) => value + 1);

  const data = useMemo(() => {
    void revision;
    const orders = listOrders();
    const rows = channelReport(orders, days);
    const spend = allSpend().filter((row) => row.date >= new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
    const totalSpend = spend.reduce((sum, row) => sum + row.amount, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    return { orders, rows, spend, totalSpend, totalRevenue, campaigns: ops.state.campaigns };
  }, [revision, days]);

  const paymentRevenue = (key: string) => data.rows.find((row) => row.channel === key)?.revenue ?? 0;
  const paymentOrders = (key: string) => data.rows.find((row) => row.channel === key)?.orders ?? 0;

  const adjustBudget = (id: CampaignChannel, next: number) => {
    ops.set({ campaigns: { ...ops.state.campaigns, [id]: { ...ops.state.campaigns[id], dailyBudget: Math.max(0, Math.min(100000, Math.round(next))) } } });
    refresh();
  };
  const toggleChannel = (id: CampaignChannel) => {
    const current = ops.state.campaigns[id];
    ops.set({ campaigns: { ...ops.state.campaigns, [id]: { ...current, active: !current.active } } });
    refresh();
    toast(`${current.active ? "Paused" : "Activated"} ${PAID.find((entry) => entry.id === id)?.label ?? id}`);
  };

  const carts = useMemo(() => { void revision; return ops.state.carts.filter((cart) => !cart.recovered); }, [revision]);
  const messages = useMemo(() => { void revision; return ops.state.outbox; }, [revision]);
  const events = useMemo(() => { void revision; return ops.state.events; }, [revision]);

  return (
    <>
      <PageHead
        title="Growth & Ads"
        subtitle={`${formatBDT(data.totalSpend)} spend → ${formatBDT(data.totalRevenue)} attributed revenue in ${days} days`}
        actions={
          <div className="ax-growth-controls">
            <div className="ax-seg" role="radiogroup" aria-label="Date range">
              {[7, 14, 30].map((value) => <button key={value} type="button" role="radio" aria-checked={days === value} data-active={days === value} onClick={() => setDays(value)}>{value}d</button>)}
            </div>
            <Button size="sm" variant="ghost" onClick={() => { refresh(); toast("Live figures refreshed"); }}><RefreshCw size={13} /> Refresh</Button>
          </div>
        }
      />
      {!manage && <ReadOnlyNote />}

      <div className="ax-kpis">
        <div className="ax-kpi" data-static="true"><span className="ax-caption">Ad spend</span><strong className="ax-kpi-value">{formatBDT(data.totalSpend)}</strong><span className="ax-kpi-foot"><span className="ax-caption">{days} days</span></span></div>
        <div className="ax-kpi" data-static="true"><span className="ax-caption">Attributed revenue</span><strong className="ax-kpi-value">{formatBDT(data.totalRevenue)}</strong><span className="ax-kpi-foot"><span className="ax-caption">{data.orders.filter((order) => order.attribution).length} attributed orders</span></span></div>
        <div className="ax-kpi" data-static="true" data-accent="true"><span className="ax-caption">Blended ROAS</span><strong className="ax-kpi-value">{data.totalSpend > 0 ? `${(data.totalRevenue / data.totalSpend).toFixed(2)}×` : "—"}</strong><span className="ax-kpi-foot"><span className="ax-pill" data-tone={roasTone(data.totalSpend > 0 ? data.totalRevenue / data.totalSpend : 0)}>{data.totalSpend > 0 && data.totalRevenue / data.totalSpend > 3 ? "Scale" : data.totalSpend > 0 && data.totalRevenue / data.totalSpend >= 2 ? "Hold" : "Review"}</span></span></div>
        <div className="ax-kpi" data-static="true"><span className="ax-caption">Open carts</span><strong className="ax-kpi-value">{carts.length}</strong><span className="ax-kpi-foot"><span className="ax-pill" data-tone={carts.length ? "warn" : "up"}>{carts.length ? `${formatBDT(carts.reduce((sum, cart) => sum + cart.value, 0))} to recover` : "All recovered"}</span></span></div>
      </div>

      <div className="ax-channel-grid">
        {PAID.map((channel) => {
          const campaign = data.campaigns[channel.id];
          const spendRows = channel.spendKey
            ? data.spend.filter((row) => row.channel === channel.spendKey || (channel.spendKey === "meta" && row.channel === "facebook")).reduce((sum, row) => sum + row.amount, 0)
            : 0;
          const revenue = channel.id === "carts"
            ? ops.state.carts.filter((cart) => cart.recovered).reduce((sum, cart) => sum + cart.value, 0)
            : channel.id === "upsell"
              ? paymentRevenue("facebook") * 0.12
              : paymentRevenue(channel.revenueKey ?? "");
          const organic = channel.id === "carts" || channel.id === "upsell";
          const roas = spendRows > 0 ? revenue / spendRows : organic ? (revenue > 0 ? revenue / Math.max(1, data.totalSpend || 1) : 0) : 0;
          return (
            <article key={channel.id} className="ax-channel-card" data-off={!campaign.active || undefined}>
              <header className="ax-channel-head">
                <span className="ax-channel-icon">{channel.icon}</span>
                <div className="min-w-0 flex-1"><p className="ax-body font-semibold">{channel.label}</p><p className="ax-caption">{channel.detail}</p></div>
                <button type="button" role="switch" aria-checked={campaign.active} aria-label={`${campaign.active ? "Pause" : "Activate"} ${channel.label}`} className="ax-switch-lg" data-on={campaign.active} disabled={!manage} onClick={() => toggleChannel(channel.id)}><span /></button>
              </header>

              <dl className="ax-channel-metrics">
                <div><dt>Spend</dt><dd className="adm-num">{organic ? "—" : formatBDT(spendRows)}</dd></div>
                <div><dt>Revenue</dt><dd className="adm-num">{formatBDT(Math.round(revenue))}</dd></div>
                <div><dt>Orders</dt><dd className="adm-num">{channel.id === "carts" ? ops.state.carts.filter((cart) => cart.recovered).length : paymentOrders(channel.revenueKey ?? "")}</dd></div>
              </dl>

              <div className="ax-channel-foot">
                {organic ? (
                  <span className="ax-pill" data-tone="neutral">{channel.id === "carts" ? "Recovery play" : "Owned channel"}</span>
                ) : (
                  <span className="ax-roas-pill" data-tone={roasTone(roas)} title="Revenue ÷ spend">
                    {roas > 0 ? `${roas.toFixed(2)}× ROAS` : "No spend logged"}
                  </span>
                )}
                {!organic && (
                  <div className="ax-budget" role="group" aria-label={`${channel.label} daily budget`}>
                    <button type="button" aria-label={`Reduce ${channel.label} budget`} disabled={!manage || campaign.dailyBudget <= 0} onClick={() => adjustBudget(channel.id, campaign.dailyBudget - 200)}>−</button>
                    <output className="adm-num">{formatBDT(campaign.dailyBudget)}<small>/day</small></output>
                    <button type="button" aria-label={`Increase ${channel.label} budget`} disabled={!manage} onClick={() => adjustBudget(channel.id, campaign.dailyBudget + 200)}>+</button>
                  </div>
                )}
                {organic && (
                  <button type="button" className="ax-link" onClick={() => setOpen(channel.id === "carts" ? "carts" : "outbox")}>{channel.id === "carts" ? "Recover carts" : "View outbox"} <ArrowUpRight size={13} /></button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="ax-card ax-channel-more">
        <div className="ax-channel-more-row">
          {([["carts", `Cart recovery · ${carts.length}`], ["outbox", `Message outbox · ${messages.filter((row) => row.status === "queued").length}`], ["pixels", `Pixel inspector · ${events.length}`]] as const).map(([id, label]) => (
            <button key={id} type="button" data-active={open === id} aria-expanded={open === id} onClick={() => setOpen((current) => current === id ? "none" : id)}>
              {label} <ChevronDown size={14} />
            </button>
          ))}
        </div>

        {open === "carts" && (
          <div className="ax-channel-more-body">
            {carts.length === 0 ? <Empty icon={<ShoppingCart size={20} />} title="No open carts" body="Carts appear here when a shopper reaches checkout and leaves." /> : (
              <ul className="ax-simple-list">
                {carts.slice(0, 12).map((cart) => (
                  <li key={cart.id}>
                    <span className="min-w-0 flex-1"><b>{cart.name || cart.phone}</b><small>{cart.items.reduce((n, item) => n + item.qty, 0)} items · {cart.reminded ? "reminder sent" : "not reminded"}</small></span>
                    <span className="adm-num ax-caption">{formatBDT(cart.value)}</span>
                    <Button size="sm" variant="ghost" disabled={!manage} onClick={() => { queueAbandonedCart(cart.id); refresh(); toast("Recovery message queued"); }}><Send size={13} /> Remind</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {open === "outbox" && (
          <div className="ax-channel-more-body">
            {messages.length === 0 ? <Empty icon={<MessageSquare size={20} />} title="Outbox is empty" /> : (
              <>
                <div className="flex justify-end"><Button size="sm" disabled={!manage} onClick={() => { flushOutbox(); refresh(); toast("Queued messages sent"); }}><Mail size={13} /> Send queued</Button></div>
                <ul className="ax-simple-list">
                  {messages.slice(0, 12).map((message) => (
                    <li key={message.id}>
                      <span className="min-w-0 flex-1"><b>{message.template}</b><small>{message.channel} · {message.to}</small></span>
                      <Badge tone={message.status === "sent" ? "emerald" : message.status === "failed" ? "rose" : message.status === "skipped" ? "amber" : "neutral"}>{message.status}</Badge>
                      <button type="button" className="adm-icon-btn" aria-label="Discard message" disabled={!manage} onClick={() => { ops.setOutboxStatus(message.id, "skipped", "Discarded by staff"); refresh(); }}><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {open === "pixels" && (
          <div className="ax-channel-more-body">
            <div className="ax-pixel-stats">
              <div><span className="ax-caption">Events captured</span><b className="adm-num">{events.length}</b></div>
              <div><span className="ax-caption">Purchases</span><b className="adm-num">{events.filter((event) => event.name === "Purchase").length}</b></div>
              <div><span className="ax-caption">Consent</span><b>{ops.state.consent === "granted" ? "Granted" : ops.state.consent === "denied" ? "Denied" : "Awaiting"}</b></div>
              <div><span className="ax-caption">Server relay</span><b>{ops.state.settings.marketing.conversionsApi ? "On" : "Off"}</b></div>
            </div>
            {events.length > 0 && <ul className="ax-simple-list">{events.slice(0, 8).map((event) => <li key={event.id}><span className="min-w-0 flex-1"><b>{event.name}</b><small>{new Date(event.at).toLocaleTimeString("en-GB")} · {event.destinations.join(", ") || "not dispatched"}</small></span></li>)}</ul>}
            {(ops.state.settings.marketing.metaPixelId || ops.state.settings.marketing.ga4MeasurementId) === "" && <p className="ax-caption">Add pixel IDs in Settings → Marketing to dispatch events.</p>}
          </div>
        )}
      </div>

      <p className="ax-caption flex items-center gap-1.5"><Activity size={12} /> Revenue is first-touch attributed from the ad click. Set daily budgets here; log actual spend per day in the table below.</p>
      <SpendLedger onChange={refresh} toast={toast} manage={manage} />
    </>
  );
}

function SpendLedger({ onChange, toast, manage }: { onChange: () => void; toast: (message: string) => void; manage: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState("meta");
  const [amount, setAmount] = useState("");
  const rows = allSpend().filter((row) => row.date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return (
    <details className="ax-card ax-spend-ledger">
      <summary><span><Truck size={14} /> Logged ad spend</span><span className="ax-caption">last 14 days · {rows.length} entries</span></summary>
      <div className="ax-card-body">
        <div className="ax-spend-form">
          <input className="adm-input" type="date" value={date} aria-label="Spend date" onChange={(event) => setDate(event.target.value)} />
          <select className="adm-select" value={channel} aria-label="Spend channel" onChange={(event) => setChannel(event.target.value)}>
            <option value="meta">Meta</option><option value="google">Google</option><option value="tiktok">TikTok</option>
          </select>
          <input className="adm-input adm-num" inputMode="numeric" placeholder="৳ amount" value={amount} aria-label="Spend amount" onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
          <Button size="sm" variant="primary" disabled={!manage || !amount} onClick={() => { ops.setSpend(date, channel, Number(amount)); setAmount(""); onChange(); toast(`Spend logged for ${date}`); }}>Log spend</Button>
        </div>
        <ul className="ax-simple-list">
          {rows.length === 0 ? <li><span className="ax-caption">No spend logged yet.</span></li> : rows.map((row) => (
            <li key={`${row.date}-${row.channel}`}>
              <span className="min-w-0 flex-1"><b>{row.channel}</b><small>{row.date}</small></span>
              <span className="adm-num ax-caption">{formatBDT(row.amount)}</span>
              <button type="button" className="adm-icon-btn" aria-label={`Clear ${row.channel} spend for ${row.date}`} disabled={!manage} onClick={() => { ops.setSpend(row.date, row.channel, 0); onChange(); toast("Spend removed"); }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
