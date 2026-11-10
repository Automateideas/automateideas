"use client";

import { useCallback, useEffect, useState } from "react";

/** An error from our API, shaped `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    /** Per-field messages from a form API, e.g. `{ gstin: "Enter a valid GSTIN." }`. */
    readonly fields?: Record<string, string>,
    /** Extra data, e.g. the records a duplicate check matched. */
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const NETWORK_ERROR = "Can't reach the server. Check your connection and try again.";

/** Calls one of our /api routes and returns the JSON body, or throws ApiError. */
export async function api<T = unknown>(
  path: string,
  init?: Omit<RequestInit, "body"> & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: json === undefined ? rest.headers : { "Content-Type": "application/json", ...rest.headers },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", NETWORK_ERROR, 0);
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? String(res.status),
      body?.error?.message ?? "Something went wrong. Try again.",
      res.status,
      body?.error?.fields,
      body?.error?.details,
    );
  }
  return body as T;
}

type QueryState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "error"; data?: T; error: ApiError }
  | { status: "success"; data: T; error?: undefined };

/** Loads a GET route on mount. `reload()` refetches and keeps showing the old data meanwhile. */
export function useApiQuery<T>(path: string) {
  const [state, setState] = useState<QueryState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<T>(path).then(
      (data) => !cancelled && setState({ status: "success", data }),
      (error: unknown) =>
        !cancelled &&
        setState((prev) => ({
          status: "error",
          data: prev.data,
          error: error instanceof ApiError ? error : new ApiError("UNKNOWN", String(error), 0),
        })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
