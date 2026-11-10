"use client";

import { useMemo, useState } from "react";
import {
  Activity, BadgeCheck, Copy, Download, Link2, Mail, Megaphone, MessageSquare,
  RadioTower, RefreshCw, Send, ShoppingCart, Trash2, TrendingUp,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { formatBDT } from "@/lib/format";
import { allSpend, channelReport, exportCatalogue, flushOutbox, listOrders, queueAbandonedCart } from "@/lib/ops";
import { track } from "@/lib/analytics";
import { Badge, BarList, Button, CHART_HUES, Empty, Panel, Stat } from "./admin-ui";

const SUBTABS = [
  { id: "attribution", label: "Attribution & spend", icon: TrendingUp },
  { id: "carts", label: "Abandoned carts", icon: ShoppingCart },
  { id: "outbox", label: "Message outbox", icon: Send },
  { id: "events", label: "Pixel inspector", icon: Activity },
] as const;

export function AdminGrowth({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState<(typeof SUBTABS)[number]["id"]>("attribution");
  return (
    <>
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight">Growth</h1>
        <p className="text-[0.78rem] text-[#8aa697]">Ad spend, attribution, recovery and measurement in one place.</p>
      </div>
      <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
        {SUBTABS.map((entry) => (
          <button key={entry.id} type="button" className="adm-chip inline-flex items-center gap-1.5" data-active={tab === entry.id} onClick={() => setTab(entry.id)}>
            <entry.icon size={12} /> {entry.label}
          </button>
        ))}
      </div>
      {tab === "attribution" && <Attribution toast={toast} />}
      {tab === "carts" && <Carts toast={toast} />}
      {tab === "outbox" && <Outbox toast={toast} />}
      {tab === "events" && <Events toast={toast} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Attribution({ toast }: { toast: (message: string) => void }) {
  const [days, setDays] = useState(14);
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState("meta");
  const [amount, setAmount] = useState("");
  const [campaign, setCampaign] = useState("eid-cells-sale");
  const [content, setContent] = useState("video-hook-01");

  const orders = useMemo(() => { void revision; return listOrders(); }, [revision]);
  const rows = useMemo(() => channelReport(orders, days), [orders, days]);
  const totals = rows.reduce((acc, row) => ({ revenue: acc.revenue + row.revenue, spend: acc.spend + row.spend, orders: acc.orders + row.orders }), { revenue: 0, spend: 0, orders: 0 });
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const link = `https://${ops.state.settings.identity.domain}/shop?utm_source=facebook&utm_medium=paid_social&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${encodeURIComponent(content)}`;

  const recentSpend = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    allSpend().forEach((row) => {
      const entry = map.get(row.date) ?? {};
      entry[row.channel] = row.amount;
      map.set(row.date, entry);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  }, [revision]);

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
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">Spend</th><th className="text-right">CPA</th><th className="text-right">ROAS</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.channel}>
                    <td><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: CHART_HUES[index % CHART_HUES.length] }} /><span className="capitalize">{row.channel}</span></span></td>
                    <td className="adm-num text-right">{row.orders}</td>
                    <td className="adm-num text-right">{formatBDT(row.revenue)}</td>
                    <td className="adm-num text-right text-[#8aa697]">{row.spend ? formatBDT(row.spend) : "—"}</td>
                    <td className="adm-num text-right text-[#8aa697]">{row.orders && row.spend ? formatBDT(Math.round(row.spend / row.orders)) : "—"}</td>
                    <td className="adm-num text-right">{row.roas ? <Badge tone={row.roas >= 2 ? "emerald" : row.roas >= 1 ? "amber" : "rose"}>{row.roas.toFixed(2)}×</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <BarList rows={rows.map((row) => ({ label: row.channel, value: row.revenue, caption: `${row.orders} orders · ${formatBDT(row.spend)} spent` }))} format={formatBDT} />
          </div>
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
                </select>
              </label>
            </div>
            <label className="adm-field mt-2.5"><span className="adm-field-label">Amount ৳</span>
              <input className="adm-input adm-num" inputMode="numeric" placeholder="1200" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <Button
              variant="primary" className="mt-2.5 w-full" disabled={!amount || Number(amount) <= 0}
              onClick={() => { ops.setSpend(date, channel, Number(amount)); setAmount(""); setRevision((v) => v + 1); toast(`Spend logged for ${date}`); }}
            >
              Save spend
            </Button>
            <div className="adm-table-wrap mt-3">
              <table className="adm-table">
                <thead><tr><th>Date</th><th className="text-right">Meta</th><th className="text-right">Google</th><th className="text-right">TikTok</th></tr></thead>
                <tbody>
                  {recentSpend.map(([day, values]) => (
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
            <p className="adm-mono mt-2.5 break-all rounded-lg border border-[#1d3529] bg-[#0b1712] p-2.5 text-[0.68rem] leading-relaxed text-[#a5e0fb]">{link}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(link); toast("Campaign link copied"); }}><Copy size={12} /> Copy link</Button>
              <Button size="sm" variant="ghost" onClick={() => { exportCatalogue(); toast("Product feed exported for Meta & Google"); }}><Download size={12} /> Product feed</Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Carts({ toast }: { toast: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const carts = useMemo(() => { void revision; return ops.state.carts; }, [revision]);
  const recoverable = carts.filter((cart) => !cart.recovered).reduce((sum, cart) => sum + cart.value, 0);

  return (
    <>
      <div className="adm-kpis">
        <Stat label="Open carts" value={String(carts.filter((cart) => !cart.recovered).length)} icon={<ShoppingCart size={16} />} />
        <Stat label="Recoverable value" value={formatBDT(recoverable)} tone="amber" />
        <Stat label="Recovered" value={String(carts.filter((cart) => cart.recovered).length)} tone="emerald" />
        <Stat label="Reminders sent" value={String(carts.filter((cart) => cart.reminded).length)} tone="sky" />
      </div>
      <Panel title="Abandoned checkouts" subtitle={`Captured when a shopper enters contact details then leaves · auto-reminder after ${ops.state.settings.notifications.abandonedCartAfterMinutes} min`}>
        {carts.length === 0 ? (
          <Empty icon={<ShoppingCart size={22} />} title="No abandoned carts yet" body="As soon as a shopper types their phone number at checkout and leaves, the bag is saved here for recovery." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Shopper</th><th>Bag</th><th className="text-right">Value</th><th>Source</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {carts.map((cart) => (
                  <tr key={cart.id}>
                    <td>
                      <p className="font-medium">{cart.name || "Unnamed"}</p>
                      <p className="adm-num text-[0.68rem] text-[#8aa697]">{cart.phone}</p>
                    </td>
                    <td className="text-[0.73rem] text-[#b9cdbe]">{cart.items.map((item) => `${item.qty}× ${item.name}`).join(", ").slice(0, 60)}</td>
                    <td className="adm-num text-right">{formatBDT(cart.value)}</td>
                    <td className="text-[0.72rem] capitalize text-[#8aa697]">{cart.attribution?.source ?? "direct"}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        {cart.recovered ? <Badge tone="emerald">Recovered</Badge> : (
                          <Button size="sm" variant={cart.reminded ? "default" : "primary"} onClick={() => { queueAbandonedCart(cart.id); setRevision((v) => v + 1); toast("Recovery message queued"); }}>
                            <Send size={12} /> {cart.reminded ? "Remind again" : "Send reminder"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { ops.removeCart(cart.id); setRevision((v) => v + 1); toast("Cart dismissed"); }} aria-label="Dismiss cart"><Trash2 size={12} /></Button>
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

function Outbox({ toast }: { toast: (message: string) => void }) {
  const [filter, setFilter] = useState<"all" | "queued" | "sent" | "skipped">("all");
  const [revision, setRevision] = useState(0);
  const messages = useMemo(() => { void revision; return ops.state.outbox; }, [revision]);
  const rows = messages.filter((row) => filter === "all" || row.status === filter);
  const provider = ops.state.settings.notifications.smsProvider;

  return (
    <>
      <div className="adm-kpis">
        <Stat label="Queued" value={String(messages.filter((row) => row.status === "queued").length)} icon={<Send size={16} />} />
        <Stat label="Sent" value={String(messages.filter((row) => row.status === "sent").length)} tone="emerald" />
        <Stat label="Held" value={String(messages.filter((row) => row.status === "skipped").length)} tone="amber" hint="no provider" />
        <Stat label="SMS provider" value={provider === "none" ? "Not set" : provider} tone={provider === "none" ? "rose" : "emerald"} />
      </div>
      <Panel
        title="Customer messages"
        subtitle="Every confirmation, status update and recovery message the store generates"
        action={
          <div className="flex flex-wrap gap-1.5">
            {(["all", "queued", "sent", "skipped"] as const).map((option) => (
              <button key={option} type="button" className="adm-chip capitalize" data-active={filter === option} onClick={() => setFilter(option)}>{option}</button>
            ))}
            <Button size="sm" variant="primary" onClick={() => { flushOutbox(); setRevision((v) => v + 1); toast(provider === "none" ? "No SMS provider configured — messages held" : "Outbox delivered"); }}>
              <RefreshCw size={12} /> Deliver queue
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty icon={<MessageSquare size={22} />} title="Nothing in the outbox" body="Order confirmations and courier updates appear here the moment they are generated." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rows.map((message) => (
              <li key={message.id} className="rounded-xl border border-[#1d3529] bg-[#0b1712] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {message.channel === "email" ? <Mail size={13} className="text-[#38bdf8]" /> : <MessageSquare size={13} className="text-[#c9f16b]" />}
                  <span className="text-[0.79rem] font-semibold">{message.subject}</span>
                  <Badge tone={message.status === "sent" ? "emerald" : message.status === "queued" ? "sky" : "amber"}>{message.status}</Badge>
                  <span className="adm-num ml-auto text-[0.68rem] text-[#8aa697]">{message.to}</span>
                </div>
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[#b9cdbe]">{message.body}</p>
                <p className="mt-1 text-[0.66rem] text-[#6f8b7c]">
                  {new Date(message.at).toLocaleString("en-GB")} · {message.template}
                  {message.reason ? ` · ${message.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Events({ toast }: { toast: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const events = useMemo(() => { void revision; return ops.state.events; }, [revision]);
  const { marketing } = ops.state.settings;
  const consentRequired = marketing.consentRequired;
  const consent = ops.state.consent;
  const attribution = ops.state.attribution;

  const connections = [
    { id: "meta", label: "Meta Pixel", value: marketing.metaPixelId, hint: "Browser + Conversions API" },
    { id: "ga4", label: "Google Analytics 4", value: marketing.ga4MeasurementId, hint: "Sessions and funnels" },
    { id: "tiktok", label: "TikTok Pixel", value: marketing.tiktokPixelId, hint: "Short-video campaigns" },
  ];
  const purchases = events.filter((event) => event.name === "Purchase").length;

  return (
    <>
      <div className="adm-kpis">
        <Stat label="Events captured" value={String(events.length)} icon={<Activity size={16} />} />
        <Stat label="Purchase events" value={String(purchases)} tone="emerald" hint="must match paid orders" />
        <Stat label="Consent" value={!consentRequired ? "Not required" : consent === "granted" ? "Granted" : consent === "denied" ? "Denied" : "Awaiting"} tone={consent === "granted" || !consentRequired ? "emerald" : "amber"} />
        <Stat label="Server relay" value={marketing.conversionsApi ? "On" : "Off"} tone={marketing.conversionsApi ? "emerald" : "rose"} hint="dedupes with browser" />
      </div>

      <div className="adm-grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Panel title="Connections" subtitle="IDs are set in Settings → Marketing">
          <ul className="flex flex-col gap-2.5">
            {connections.map((connection) => (
              <li key={connection.id} className="flex items-center gap-3 rounded-xl border border-[#1d3529] bg-[#0b1712] p-3">
                <RadioTower size={15} className={connection.value ? "text-[#34d399]" : "text-[#5d7a6a]"} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8rem] font-medium">{connection.label}</p>
                  <p className="adm-num truncate text-[0.68rem] text-[#8aa697]">{connection.value || "Not connected"}</p>
                </div>
                <Badge tone={connection.value ? "emerald" : "rose"}>{connection.value ? "live" : "off"}</Badge>
              </li>
            ))}
          </ul>
          {attribution && (
            <dl className="adm-kv mt-3 border-t border-[#172b21] pt-3">
              <dt>This session</dt><dd className="capitalize">{attribution.source} / {attribution.medium}</dd>
              <dt>Campaign</dt><dd className="truncate">{attribution.campaign}</dd>
              <dt>Landing</dt><dd className="truncate">{attribution.landingPage}</dd>
              <dt>Click IDs</dt><dd>{[attribution.fbclid && "fbclid", attribution.gclid && "gclid", attribution.ttclid && "ttclid"].filter(Boolean).join(", ") || "none"}</dd>
            </dl>
          )}
          <Button
            className="mt-3 w-full" variant="primary"
            onClick={() => { track("Lead", { content_name: "Admin test event", value: 1 }); setRevision((v) => v + 1); toast("Test event dispatched"); }}
          >
            <BadgeCheck size={13} /> Send test event
          </Button>
        </Panel>

        <Panel
          title="Live event stream"
          subtitle="Newest first · shared event_id keeps browser and server hits deduplicated"
          action={<Button size="sm" variant="ghost" onClick={() => setRevision((v) => v + 1)}><RefreshCw size={12} /> Refresh</Button>}
        >
          {events.length === 0 ? (
            <Empty icon={<Activity size={22} />} title="No events yet" body="Browse the storefront or send a test event to see the payload that reaches Meta and GA4." />
          ) : (
            <ul className="adm-scroll flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
              {events.slice(0, 60).map((event) => (
                <li key={event.id} className="rounded-xl border border-[#1d3529] bg-[#0b1712] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.79rem] font-semibold text-[#c9f16b]">{event.name}</span>
                    {event.destinations.length ? event.destinations.map((destination) => (
                      <Badge key={destination} tone={destination === "capi" ? "violet" : "sky"}>{destination}</Badge>
                    )) : <Badge tone="amber">blocked · no consent</Badge>}
                    <span className="adm-num ml-auto text-[0.66rem] text-[#6f8b7c]">{new Date(event.at).toLocaleTimeString("en-GB")}</span>
                  </div>
                  <p className="adm-mono mt-1 break-all text-[0.66rem] leading-relaxed text-[#8aa697]">
                    {Object.entries(event.params)
                      .filter(([key]) => !["event_id"].includes(key))
                      .slice(0, 6)
                      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
                      .join("  ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="flex items-center gap-1.5 text-[0.72rem] text-[#8aa697]">
        <Link2 size={12} /> Verify the same events in Meta Events Manager → Test Events using your test code before scaling spend.
      </p>
    </>
  );
}
