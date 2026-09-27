"use client";

import { useEffect, useRef, useState } from "react";

import { clockOffset, remainingMs } from "@/engine/exam/deadline";

/**
 * Milliseconds left until `deadline` on the server's clock (corrected by the offset
 * measured from `serverNow`), ticking every second; `onExpire` runs once at zero.
 * Null without a deadline.
 */
export function useCountdown(
  deadline: string | null,
  serverNow: string,
  onExpire?: () => void,
): number | null {
  const [offset] = useState(() => clockOffset(serverNow));
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!deadline) return;
    let fired = false;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (!fired && remainingMs(deadline, offset, at) === 0) {
        fired = true;
        expireRef.current?.();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline, offset]);

  return deadline ? remainingMs(deadline, offset, now) : null;
}
