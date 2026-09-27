"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * A date in the viewer's own time zone. The server doesn't know it, so the text
 * appears right after hydration (no mismatch between server and client HTML).
 */
export function LocalTime({
  iso,
  options = { dateStyle: "medium", timeStyle: "short" },
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso}>{hydrated ? new Date(iso).toLocaleString("id-ID", options) : "…"}</time>
  );
}
