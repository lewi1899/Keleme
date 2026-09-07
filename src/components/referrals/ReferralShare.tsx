"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Share surface for a referral code.
 *
 * Prefers the native share sheet when the browser has one — on Android that is
 * the single tap that reaches WhatsApp, Telegram or SMS without KELEME having
 * to guess which the student uses. The explicit WhatsApp and Telegram buttons
 * are the fallback for desktop and older browsers, since those two carry
 * essentially all of this audience's sharing.
 */
export function ReferralShare({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const message = `Join me on KELEME — study notes, textbooks and past matric papers for grades 9 to 12. Use my code ${code}: ${link}`;

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${what} copied`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy", "Select the code and copy it manually.");
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copy(message, "Invite");
      return;
    }
    try {
      await navigator.share({ title: "Join me on KELEME", text: message, url: link });
    } catch {
      // An abort is the user changing their mind, not a failure worth a toast.
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-medium text-text-secondary">Your referral code</p>

      <button
        type="button"
        onClick={() => copy(code, "Code")}
        className="kl-press mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-kl-border p-4 hover:border-accent"
        aria-label={`Copy referral code ${code}`}
      >
        <span className="kl-display text-3xl font-extrabold tracking-[0.25em] text-text-primary">
          {code}
        </span>
        {copied ? (
          <Check size={20} className="shrink-0 text-emerald-500" aria-hidden />
        ) : (
          <Copy size={20} className="shrink-0 text-text-secondary" aria-hidden />
        )}
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={nativeShare} icon={<Share2 size={16} />}>
          Share invite
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" icon={<MessageCircle size={16} />}>
            WhatsApp
          </Button>
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
            `Join me on KELEME — use my code ${code}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" icon={<Send size={16} />}>
            Telegram
          </Button>
        </a>
        <Button variant="ghost" onClick={() => copy(link, "Link")} icon={<Copy size={16} />}>
          Copy link
        </Button>
      </div>
    </Card>
  );
}
