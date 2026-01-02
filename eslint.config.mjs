import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/trace" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, received: body });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
