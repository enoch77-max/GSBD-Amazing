import type { Metadata } from "next";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = {
  title: "Track order",
  description: "Check your order using its order number and the mobile number entered at checkout.",
};

type PageProps = { searchParams: Promise<{ order?: string }> };

export default async function TrackPage({ searchParams }: PageProps) {
  const { order } = await searchParams;
  return (
    <div className="shell py-4 sm:py-6">
      <h1 className="text-[1.45rem] sm:text-[1.85rem]">Track order</h1>
      <p className="mt-1 text-[0.8rem] text-muted">Use your order ID and checkout mobile number.</p>
      <TrackView initialOrder={order ?? ""} />
    </div>
  );
}
