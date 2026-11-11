"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { api } from "@/lib/live";
import { formatBDT, formatDate } from "@/lib/format";
import { Badge, Empty, Panel } from "@/components/admin/admin-ui";

type Customer = { phone: string; name: string; orders: number; spend: number; lastOrder: string };

export function OwnerCustomers() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const payload = await api<{ customers: Customer[]; total: number }>(`/api/admin/customers?q=${encodeURIComponent(query)}&limit=50`);
    setRows(payload.customers);
    setTotal(payload.total);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => {}), query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  return (
    <>
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight">Customers</h1>
        <p className="text-[0.78rem] text-[#6e6e73]">{total} customers · phone number is the identity key.</p>
      </div>

      <Panel>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
          <input className="adm-input pl-8" placeholder="Search name or phone…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search customers" />
        </div>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <Empty icon={<Users size={22} />} title="No customers match" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Customer</th><th className="text-right">Orders</th><th className="text-right">Spend</th><th className="text-right">Last order</th><th /></tr></thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.phone}>
                    <td>
                      <p className="font-medium">{customer.name}</p>
                      <p className="adm-num text-[0.68rem] text-[#6e6e73]">{customer.phone}</p>
                    </td>
                    <td className="adm-num text-right">{customer.orders} {customer.orders > 1 && <Badge tone="emerald" className="ml-1">repeat</Badge>}</td>
                    <td className="adm-num text-right font-semibold">{formatBDT(customer.spend)}</td>
                    <td className="text-right text-[0.72rem] text-[#6e6e73]">{formatDate(customer.lastOrder)}</td>
                    <td className="text-right">
                      <a className="adm-btn" data-size="sm" href={`https://wa.me/88${customer.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
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
