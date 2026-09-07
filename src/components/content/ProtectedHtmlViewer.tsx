"use client";

import { useEffect, useRef } from "react";

/**
 * Renders study HTML that has already been sanitised on the server.
 *
 * On what this does and does not achieve — spec section 22 asks for screenshot
 * prevention, and it is worth being straight about this rather than shipping
 * something that looks like protection and is not:
 *
 *   - There is no download button and no file. The HTML is stored in Postgres
 *     and delivered through a server-checked RPC, never as a storage object,
 *     so there is no URL a student can share or save.
 *   - Context menu, drag, copy and print are suppressed. That stops casual
 *     copying, which is most of it.
 *   - A watermark carrying the student's own identifier is laid over the
 *     content, so a leaked screenshot points somewhere.
 *
 * A browser CANNOT prevent a screenshot. Any claim otherwise would be false:
 * the OS screenshot key, a second phone, and devtools are all outside the
 * page's reach. Real screen-capture blocking needs FLAG_SECURE on Android,
 * which is why the delivery path here is designed to port to a native app
 * unchanged (see docs/SECURITY.md).
 */
export function ProtectedHtmlViewer({
  html,
  watermark,
}: {
  html: string;
  watermark?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const block = (event: Event) => event.preventDefault();

    node.addEventListener("contextmenu", block);
    node.addEventListener("dragstart", block);
    node.addEventListener("copy", block);
    node.addEventListener("cut", block);

    return () => {
      node.removeEventListener("contextmenu", block);
      node.removeEventListener("dragstart", block);
      node.removeEventListener("copy", block);
      node.removeEventListener("cut", block);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="kl-protected kl-watermark kl-prose prose prose-slate max-w-none"
      data-watermark={watermark}
      // Sanitised server-side by prepareContentHtml() before it was ever
      // stored — script, style, iframe and every event handler are stripped at
      // write time, so this string cannot carry executable content.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
