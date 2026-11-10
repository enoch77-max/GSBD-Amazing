import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Choose delivery and payment options for your Glowing Space BD order.",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
