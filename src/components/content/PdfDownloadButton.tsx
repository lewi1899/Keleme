"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Fetches a fresh signed URL, then hands it to the browser.
 *
 * The URL is requested at click time rather than rendered into the page,
 * which matters: a signed URL baked into HTML is a live credential sitting in
 * the DOM and in any cached copy of the page, still valid for its whole TTL.
 * This way it exists for the moment of the download and is never persisted.
 */
export function PdfDownloadButton({
  contentId,
  fileSizeBytes,
}: {
  contentId: string;
  fileSizeBytes?: number | null;
}) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function download() {
    setLoading(true);
    try {
      const response = await fetch(`/api/content/${contentId}/pdf`);
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        toast.error("Download unavailable", payload.error ?? "Please try again in a moment.");
        return;
      }

      window.location.href = payload.url;
    } catch {
      toast.error("Download failed", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={download} loading={loading} icon={<Download size={16} />}>
      {loading ? "Preparing…" : `Download PDF${fileSizeBytes ? ` (${formatBytes(fileSizeBytes)})` : ""}`}
    </Button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
