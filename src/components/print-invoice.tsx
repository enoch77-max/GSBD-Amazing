"use client";

import { Printer } from "lucide-react";
import type { Order, OrderItem } from "@/db/schema";
import { PAYMENT_METHODS, STORE } from "@/lib/commerce";
import { formatBDT, formatDate } from "@/lib/format";

export function PrintInvoice({ order, items, paid }: { order: Order; items: OrderItem[]; paid: boolean }) {
  const payment = PAYMENT_METHODS.find((method) => method.id === order.paymentMethod);
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm no-print mt-3 w-full" onClick={() => window.print()}>
        <Printer size={14} /> Print invoice
      </button>
      <section className="invoice-print" aria-label={`Invoice ${order.orderNumber}`}>
        <header className="invoice-head">
          <div>
            <p className="invoice-brand">GLOWING SPACE BD</p>
            <p>{STORE.address}</p>
            <p>{STORE.phone} · {STORE.email}</p>
          </div>
          <div className="invoice-meta">
            <h1>INVOICE / RECEIPT</h1>
            <p><strong>{order.orderNumber}</strong></p>
            <p>Issued {formatDate(order.createdAt)}</p>
            <p className="invoice-paid">{paid ? "PAID" : order.paymentMethod === "cod" ? "CASH ON DELIVERY" : "PAYMENT PENDING"}</p>
          </div>
        </header>
        <div className="invoice-addresses">
          <div><h2>Billed to</h2><p>{order.customerName}</p><p>{order.address}, {order.district}</p><p>{order.phone}</p>{order.email && <p>{order.email}</p>}</div>
          <div><h2>Delivery</h2><p>{order.deliveryMethod === "express" ? "Express same-day" : "Standard courier"}</p><p>Status: {order.status}</p><p>Payment: {payment?.name ?? order.paymentMethod}</p></div>
        </div>
        <table className="invoice-table">
          <thead><tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Amount</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}<small>{item.slug}</small>{item.packSpec?.components?.map((component) => <small key={component.key}>{component.qty} × {component.name} · {formatBDT(component.total)} per pack</small>)}</td><td>{formatBDT(item.unitPrice)}</td><td>{item.qty}</td><td>{formatBDT(item.unitPrice * item.qty)}</td></tr>)}</tbody>
        </table>
        <dl className="invoice-totals">
          <div><dt>Subtotal</dt><dd>{formatBDT(order.subtotal)}</dd></div>
          <div><dt>Delivery</dt><dd>{order.shipping === 0 ? "Free" : formatBDT(order.shipping)}</dd></div>
          {order.discount > 0 && <div><dt>Discount {order.promoCode && `(${order.promoCode})`}</dt><dd>−{formatBDT(order.discount)}</dd></div>}
          <div className="invoice-grand"><dt>Total {paid ? "paid" : "due"}</dt><dd>{formatBDT(order.total)}</dd></div>
        </dl>
        {order.notes && <p className="invoice-notes"><strong>Order note:</strong> {order.notes}</p>}
        <footer className="invoice-foot">
          <p>Keep this invoice for warranty and returns. Contact us with the order number before sending any battery back.</p>
          <p>Prices are in Bangladeshi Taka (BDT). Generated from the order record; no signature is required for an electronic copy.</p>
        </footer>
      </section>
    </>
  );
}
