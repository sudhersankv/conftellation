import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

export const useMocks = () => process.env.USE_MOCKS === "true";

export function json<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function error(message: string, status = 400) {
  return NextResponse.json<ApiError>({ error: message }, { status });
}

/** Wrap a handler so thrown errors become `{error}` JSON instead of an HTML 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  };
}

const USER_ID = /^[a-z0-9-]{1,40}$/i;

/**
 * The acting demo user: `x-user-id` header, then `userId` in the JSON body, then `?userId=`, then the `ptc_user` cookie
 * (middleware sets it from `?as=`). Null when none is present or the id is malformed. Demo identity, not authentication.
 */
export function callerId(req: Request, body?: unknown): string | null {
  const fromBody = body && typeof body === "object" ? (body as { userId?: unknown }).userId : undefined;
  const cookie = /(?:^|;\s*)ptc_user=([^;]*)/.exec(req.headers.get("cookie") ?? "")?.[1];
  const id = [
    req.headers.get("x-user-id"), typeof fromBody === "string" ? fromBody : null,
    new URL(req.url).searchParams.get("userId"), cookie ? decodeURIComponent(cookie) : null,
  ].find((c) => c != null && c !== "");
  return id && USER_ID.test(id) ? id : null;
}
