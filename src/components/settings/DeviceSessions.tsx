"use client";

import { useTransition } from "react";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import { signOutOtherDevicesAction } from "@/app/(app)/settings/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";

interface DeviceSession {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export function DeviceSessions({ sessions }: { sessions: DeviceSession[] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function signOutOthers() {
    startTransition(async () => {
      const result = await signOutOtherDevicesAction();
      if (result.error) toast.error("Could not sign out other devices", result.error);
      else toast.success("Other devices signed out");
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="kl-display font-bold text-text-primary">Devices</h2>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-text-secondary">
            One KELEME account can only be used on one device at a time. Signing in somewhere else
            signs you out here.
          </p>
        </div>
        {sessions.length > 1 && (
          <Button variant="secondary" size="sm" loading={pending} icon={<LogOut size={15} />} onClick={signOutOthers}>
            Sign out other devices
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-text-secondary">No active devices recorded.</p>
        ) : (
          sessions.map((session, index) => (
            <div key={session.id} className="flex items-center gap-3 rounded-xl border border-kl-border p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                {isMobile(session.user_agent) ? <Smartphone size={16} aria-hidden /> : <Laptop size={16} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {session.device_label ?? describeAgent(session.user_agent)}
                  {index === 0 && <span className="ml-2 text-xs font-semibold text-accent">this device</span>}
                </p>
                <p className="text-xs text-text-secondary">Last used {formatDateTime(session.last_seen_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function isMobile(userAgent: string | null): boolean {
  return /android|iphone|ipad|mobile/i.test(userAgent ?? "");
}

/**
 * A coarse, human-readable device name from the user agent. Deliberately
 * shallow — the goal is "is that phone mine?", not fingerprinting, and a full
 * UA string on screen is noise.
 */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/android/i.test(userAgent)) return "Android device";
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/windows/i.test(userAgent)) return "Windows computer";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac";
  if (/linux/i.test(userAgent)) return "Linux computer";
  return "Unknown device";
}
