"use client";

/**
 * Customers — a scannable, segment-aware list. Identity is the phone number
 * (that is how orders arrive). Email is whatever the customer last typed.
 */
import { useMemo, useState } from "react";
import { Mail, Phone, Search, Users } from "lucide-react";
import { formatBDT, formatDate, timeAgo } from "@/lib/format";
import { listOrders, setCustomerSegment, STATUS_META, type CustomerSegment, type MerchantOrder } from "@/lib/ops";
import { categoryOf, isBuilderOrder } from "@/lib/admin-metrics";
import { ops } from "@/db/ops-store";
import { ActionMenu } from "./action-menu";
import { Badge, Drawer, Empty, PageHead, Panel } from "./admin-ui";

export const SEGMENT_META: Record<CustomerSegment, { label: string; tone: string; blurb: string }> = {
  vip: { label: "VIP", tone: "amber", blurb: "High lifetime value — protect with priority support." },
  wholesale: { label: "Wholesale", tone: "violet", blurb: "Bulk volumes or large baskets — quote and ship on pallet terms." },
  builder: { label: "DIY builder", tone: "volt", blurb: "Buys cells, BMS boards and pack parts — recommend the Battery Builder." },
  regular: { label: "Regular", tone: "neutral", blurb: "Standard retail customer." },
};

const EARNING = new Set(["confirmed", "packing", "shipped", "delivered"]);

export type CustomerRecord = {
  phone: string;
  name: string;
  email: string | null;
  orders: number;
  lifetime: number;
  units: number;
  aov: number;
  first: Date;
  last: Date;
  builder: boolean;
  derived: CustomerSegment;
  segment: CustomerSegment;
  history: MerchantOrder[];
};

function deriveSegment(orders: MerchantOrder[], lifetime: number, units: number, builder: boolean): CustomerSegment {
  const avg = orders.length ? lifetime / orders.length : 0;
  if (avg >= 12000 || units >= 40) return "wholesale";
  if (lifetime >= 25000 || orders.length >= 4) return "vip";
  if (builder) return "builder";
  return "regular";
}

export function AdminCustomers({ toast, onOpenOrder }: { toast: (message: string) => void; onOpenOrder: (orderNumber: string) => void }) {
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<"all" | CustomerSegment>("all");
  const [openPhone, setOpenPhone] = useState<string | null>(null);

  const customers = useMemo(() => {
    void version;
    const overrides = ops.state.customerSegments;
    const map = new Map<string, MerchantOrder[]>();
    listOrders().forEach((order) => {
      const key = order.phone.replace(/\D/g, "");
      map.set(key, [...(map.get(key) ?? []), order]);
    });
    return [...map.entries()].map(([phone, history]): CustomerRecord => {
      const sorted = [...history].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const earning = history.filter((order) => EARNING.has(order.status));
      const lifetime = earning.reduce((sum, order) => sum + order.total, 0);
      const units = earning.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.qty, 0), 0);
      const builder = history.some(isBuilderOrder) || earning.some((order) => order.items.some((item) => ["Cells", "BMS"].includes(categoryOf(item.slug))));
      const latest = sorted[0];
      const derived = deriveSegment(earning, lifetime, units, builder);
      return {
        phone,
        name: latest.customerName,
        email: sorted.find((order) => order.email)?.email ?? null,
        orders: history.length,
        lifetime,
        units,
        aov: earning.length ? Math.round(lifetime / earning.length) : 0,
        first: sorted[sorted.length - 1].createdAt,
        last: latest.createdAt,
        builder,
        derived,
        segment: overrides[phone] ?? derived,
        history: sorted,
      };
    }).sort((a, b) => b.lifetime - a.lifetime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const counts = {
    all: customers.length,
    vip: customers.filter((customer) => customer.segment === "vip").length,
    wholesale: customers.filter((customer) => customer.segment === "wholesale").length,
    builder: customers.filter((customer) => customer.segment === "builder").length,
  };
  const lifetime = customers.reduce((sum, customer) => sum + customer.lifetime, 0);
  const term = query.trim().toLowerCase();
  const rows = customers.filter((customer) =>
    (segment === "all" || customer.segment === segment) &&
    (!term || `${customer.name} ${customer.email ?? ""} ${customer.phone}`.toLowerCase().includes(term)),
  );
  const active = openPhone ? customers.find((customer) => customer.phone === openPhone) ?? null : null;

  const changeSegment = (customer: CustomerRecord, next: CustomerSegment) => {
    setCustomerSegment(customer.phone, next);
    setVersion((value) => value + 1);
    toast(`${customer.name} tagged ${SEGMENT_META[next].label}`);
  };

  return (
    <>
      <PageHead
        title="Customers"
        subtitle={`${customers.length} customers · ${formatBDT(lifetime)} lifetime value · identity is the phone number`}
      />

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="ax-seg wrap" role="tablist" aria-label="Customer segments">
            {([["all", `All · ${counts.all}`], ["vip", `VIP · ${counts.vip}`], ["wholesale", `Wholesale · ${counts.wholesale}`], ["builder", `DIY builder · ${counts.builder}`]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={segment === id} data-active={segment === id} onClick={() => setSegment(id)}>{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--adm-faint)]" />
            <input className="adm-input pl-9" placeholder="Name, email or phone…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search customers" />
          </div>
        </div>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <Empty icon={<Users size={22} />} title="No customers match" body="Try another segment or clear the search." />
        ) : (
          <>
            <div className="hidden md:block adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Customer</th><th>Segment</th><th className="text-right">Orders</th><th className="text-right">Lifetime spend</th><th className="text-right">Last order</th><th className="w-12" /></tr></thead>
                <tbody>
                  {rows.map((customer) => (
                    <tr key={customer.phone}>
                      <td>
                        <button type="button" className="text-left" onClick={() => setOpenPhone(customer.phone)}>
                          <p className="ax-body font-medium hover:underline">{customer.name}</p>
                          <p className="ax-caption truncate">{customer.email ?? customer.phone}</p>
                        </button>
                      </td>
                      <td><Badge tone={SEGMENT_META[customer.segment].tone}>{SEGMENT_META[customer.segment].label}</Badge></td>
                      <td className="adm-num text-right">{customer.orders}</td>
                      <td className="adm-num text-right font-semibold">{formatBDT(customer.lifetime)}</td>
                      <td className="text-right ax-caption">{formatDate(customer.last)}</td>
                      <td className="text-right">
                        <ActionMenu label={`Actions for ${customer.name}`} items={[
                          { label: "Open profile", icon: <Users size={15} />, onClick: () => setOpenPhone(customer.phone) },
                          { label: "Call", icon: <Phone size={15} />, href: `tel:${customer.phone}` },
                          { label: "WhatsApp", icon: <Mail size={15} />, href: `https://wa.me/88${customer.phone.replace(/^0/, "")}` },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2.5 md:hidden">
              {rows.map((customer) => (
                <li key={customer.phone}>
                  <button type="button" className="ax-customer-card" onClick={() => setOpenPhone(customer.phone)}>
                    <span className="ax-customer-card-top">
                      <span className="min-w-0 flex-1">
                        <span className="ax-body block truncate font-semibold">{customer.name}</span>
                        <span className="ax-caption block truncate">{customer.email ?? customer.phone}</span>
                      </span>
                      <Badge tone={SEGMENT_META[customer.segment].tone}>{SEGMENT_META[customer.segment].label}</Badge>
                    </span>
                    <span className="ax-customer-stats">
                      <span><i>Orders</i><b className="adm-num">{customer.orders}</b></span>
                      <span><i>Lifetime</i><b className="adm-num">{formatBDT(customer.lifetime)}</b></span>
                      <span><i>Last seen</i><b>{timeAgo(customer.last)}</b></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {active && (
        <CustomerDrawer
          customer={active}
          onClose={() => setOpenPhone(null)}
          onChange={() => setVersion((value) => value + 1)}
          onSegment={(next) => changeSegment(active, next)}
          onOpenOrder={(orderNumber) => { setOpenPhone(null); onOpenOrder(orderNumber); }}
          toast={toast}
        />
      )}
    </>
  );
}

function CustomerDrawer({ customer, onClose, onChange, onSegment, onOpenOrder, toast }: {
  customer: CustomerRecord;
  onClose: () => void;
  onChange: () => void;
  onSegment: (segment: CustomerSegment) => void;
  onOpenOrder: (orderNumber: string) => void;
  toast: (message: string) => void;
}) {
  void onChange;
  const contact = (value: string, message: string) => { void navigator.clipboard?.writeText(value); toast(message); };

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={customer.name}
      subtitle={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""}`}
      footer={
        <>
          <a className="adm-btn" data-variant="primary" href={`https://wa.me/88${customer.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="adm-btn" href={`tel:${customer.phone}`}><Phone size={14} /> Call</a>
          {customer.email && <a className="adm-btn" href={`mailto:${customer.email}`}><Mail size={14} /> Email</a>}
        </>
      }
    >
      <div className="ax-drawer-stack">
        <div className="ax-status-strip">
          <Badge tone={SEGMENT_META[customer.segment].tone}>{SEGMENT_META[customer.segment].label}</Badge>
          {customer.builder && <Badge tone="volt">Battery Builder</Badge>}
          <span className="ax-caption">Customer since {formatDate(customer.first)}</span>
        </div>

        <div className="ax-customer-metrics">
          <div><i className="ax-caption">Lifetime spend</i><b className="adm-num">{formatBDT(customer.lifetime)}</b></div>
          <div><i className="ax-caption">Orders</i><b className="adm-num">{customer.orders}</b></div>
          <div><i className="ax-caption">Avg order</i><b className="adm-num">{formatBDT(customer.aov)}</b></div>
          <div><i className="ax-caption">Units bought</i><b className="adm-num">{customer.units}</b></div>
        </div>

        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head"><h3>Quick contact</h3></header>
          <div className="ax-contact-row">
            <a href={`tel:${customer.phone}`} aria-label={`Call ${customer.name}`}><Phone size={17} /><span>Call</span></a>
            <a href={`https://wa.me/88${customer.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${customer.name}`}><Mail size={17} /><span>WhatsApp</span></a>
            {customer.email
              ? <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.name}`}><Mail size={17} /><span>Email</span></a>
              : <button type="button" onClick={() => contact(customer.phone, "Phone number copied — no email on file")}><Mail size={17} /><span>No email</span></button>}
            <button type="button" onClick={() => contact(customer.phone, "Phone number copied")} aria-label="Copy phone number"><span className="ax-copy-glyph">⧉</span><span>Copy</span></button>
          </div>
        </section>

        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head"><h3>Segment</h3></header>
          <p className="ax-caption">{SEGMENT_META[customer.segment].blurb}{customer.segment !== customer.derived ? ` Suggested automatically: ${SEGMENT_META[customer.derived].label}.` : ""}</p>
          <div className="ax-seg wrap mt-2" role="group" aria-label="Customer segment">
            {(Object.keys(SEGMENT_META) as CustomerSegment[]).map((id) => (
              <button key={id} type="button" data-active={customer.segment === id} aria-pressed={customer.segment === id} onClick={() => onSegment(id)}>
                {SEGMENT_META[id].label}
              </button>
            ))}
          </div>
        </section>

        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head"><h3>Order history <span className="ax-caption">{customer.history.length}</span></h3></header>
          <ul className="ax-history">
            {customer.history.map((order) => (
              <li key={order.orderNumber}>
                <button type="button" onClick={() => onOpenOrder(order.orderNumber)}>
                  <span className="min-w-0 flex-1">
                    <span className="ax-body block font-medium adm-num">{order.orderNumber}</span>
                    <span className="ax-caption block">{formatDate(order.createdAt)} · {order.items.reduce((n, item) => n + item.qty, 0)} unit{order.items.reduce((n, item) => n + item.qty, 0) === 1 ? "" : "s"}</span>
                  </span>
                  <span className="text-right">
                    <span className="ax-body adm-num block font-semibold">{formatBDT(order.total)}</span>
                    <span className="ax-caption block">{STATUS_META[order.status].label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
