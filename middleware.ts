import { NextResponse, type NextRequest } from "next/server";

// ?as=<userId> → persist the demo user in a cookie, then drop the param.
export function middleware(req: NextRequest) {
  const as = req.nextUrl.searchParams.get("as");
  if (!as || !/^[a-z0-9-]{1,40}$/i.test(as)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.searchParams.delete("as");
  const res = NextResponse.redirect(url);
  res.cookies.set("ptc_user", as.toLowerCase(), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
export const config = { matcher: ["/((?!api|_next|uploads|favicon.ico).*)"] };
