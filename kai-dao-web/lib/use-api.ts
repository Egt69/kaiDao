"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import { apiGet, type ApiFailure } from "./api-client";

/**
 * Polls one of this app's read endpoints. Keeps the previous answer on screen
 * while refreshing, stops when the tab is hidden, and never runs two requests
 * at once, so a slow node cannot pile up work in the browser.
 */
export function useApi<T>(
  path: string,
  schema: ZodType<T>,
  options: { intervalMs?: number; enabled?: boolean } = {},
) {
  const { intervalMs = 6_000, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const result = await apiGet(path, schemaRef.current, controller.signal);
    if (!mounted.current || controller.signal.aborted) return;

    if (result.ok) {
      setData(result.data);
      setFailure(null);
      setFetchedAt(Date.now());
    } else if (result.failure.kind !== "aborted") {
      setFailure(result.failure);
    }

    setLoading(false);
  }, [path, enabled]);

  useEffect(() => {
    mounted.current = true;
    void load();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);

    return () => {
      mounted.current = false;
      clearInterval(timer);
      inFlight.current?.abort();
    };
  }, [load, intervalMs]);

  return { data, failure, loading, fetchedAt, refresh: load };
}
