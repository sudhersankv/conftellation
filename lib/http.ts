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
