"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_MS = 60_000;
/** Stop beating after this long with no keyboard, pointer or scroll input. */
const IDLE_MS = 5 * 60_000;

/**
 * Client half of the study-time system.
 *
 * It claims exactly one thing — "this student is still actively here" — and
 * has no say in how much time that is worth. The server timestamps everything,
 * caps each beat and caps the day (see record_heartbeat in migration 0006), so
 * the worst a tampered client can do is send beats it should not have; it
 * cannot inflate the value of one.
 *
 * Three conditions stop the beat, and all three matter:
 *   - the tab is hidden (backgrounded or another tab)
 *   - no real input for five minutes (the phone is in a pocket)
 *   - the page is unloading (session closed explicitly rather than left open)
 */
export function StudyHeartbeat() {
  const sessionId = useRef<string | null>(null);
  const lastActivity = useRef<number>(Date.now());

  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;
    let cancelled = false;

    function markActive() {
      lastActivity.current = Date.now();
    }

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    async function beat() {
      if (cancelled) return;
      if (document.hidden) return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;

      const { data, error } = await supabase.rpc("record_heartbeat", {
        p_session_id: sessionId.current,
      });

      if (error || cancelled) return;
      const result = data as { session_id?: string } | null;
      if (result?.session_id) sessionId.current = result.session_id;
    }

    // Open the session immediately so the first minute is not lost, then settle
    // into the interval.
    void beat();
    timer = window.setInterval(beat, HEARTBEAT_MS);

    // Beat once when the tab comes back, rather than waiting up to a minute.
    function onVisibility() {
      if (!document.hidden) {
        markActive();
        void beat();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    function endSession() {
      if (!sessionId.current) return;
      // pagehide fires reliably on mobile Safari where unload does not. There
      // is no await here on purpose: the request is fire-and-forget, and the
      // server's idle timeout closes the session anyway if it never lands.
      void supabase.rpc("end_study_session", { p_session_id: sessionId.current });
    }
    window.addEventListener("pagehide", endSession);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", endSession);
      endSession();
    };
  }, []);

  return null;
}
