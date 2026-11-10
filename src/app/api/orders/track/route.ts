import { NextResponse } from "next/server";
import { getOrderByNumber } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get("number")?.trim();
  const phone = searchParams.get("phone")?.replace(/[\s-]/g, "");

  if (!number) {
    return NextResponse.json({ error: "Enter your order number." }, { status: 400 });
  }
  if (!phone || !/^01[3-9]\d{8}$/.test(phone)) {
    return NextResponse.json(
      { error: "Enter the 11-digit mobile number used for the order." },
      { status: 400 },
    );
  }

  try {
    const result = await getOrderByNumber(number);
    if (!result) {
      return NextResponse.json({ error: "No order found with that number." }, { status: 404 });
    }
    if (result.order.phone.replace(/[\s-]/g, "") !== phone) {
      return NextResponse.json(
        { error: "That order number and mobile number do not match." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      order: result.order,
      items: result.items,
    });
  } catch (error) {
    console.error("[api/orders/track]", error);
    return NextResponse.json({ error: "Could not look that up right now." }, { status: 500 });
  }
}
