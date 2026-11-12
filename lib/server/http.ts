import { NextResponse } from "next/server";
import { HttpError } from "./access";

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  console.error("[api]", e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
