"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary.
 *
 * Deliberately generic on screen: a student must never see a database error,
 * a policy name or a stack trace (spec section 35). The detail goes to the
 * console — and to whatever error reporting is wired up in production — while
 * the student gets something they can act on.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[KELEME] Unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-600">
          <RefreshCw size={24} />
        </div>
        <h1 className="kl-display mt-4 text-xl font-bold text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          That page didn&apos;t load properly. Try again — if it keeps happening, check your
          connection or contact KELEME support.
        </p>
        <div className="mt-6">
          <Button onClick={reset} icon={<RefreshCw size={16} />}>
            Try again
          </Button>
        </div>
        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-text-secondary">Reference: {error.digest}</p>
        )}
      </Card>
    </div>
  );
}
