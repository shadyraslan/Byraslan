import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createReqId, startReq, mark, endMark, endReq } from "@/lib/perf";

export async function middleware(request: NextRequest) {
  const reqId = createReqId();
  const ctx = startReq(reqId, request.nextUrl.pathname);
  try {
    mark(ctx, "middleware:updateSession");
    const response = await updateSession(request);
    endMark(ctx, "middleware:updateSession");

    // Security Headers — حماية إضافية ضد هجمات XSS و Clickjacking
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // HSTS — HTTPS فقط (في الإنتاج)
    if (process.env.NODE_ENV === "production") {
      response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    return response;
  } finally {
    endReq(ctx);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
