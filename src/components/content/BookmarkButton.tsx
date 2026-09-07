"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

/**
 * Optimistic bookmark toggle: the icon flips immediately and reverts if the
 * write fails. On a slow connection, waiting a second for a star to fill in
 * makes the app feel broken.
 */
export function BookmarkButton({
  contentId,
  initiallyBookmarked,
}: {
  contentId: string;
  initiallyBookmarked: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initiallyBookmarked);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    const next = !bookmarked;
    setBookmarked(next);

    startTransition(async () => {
      const supabase = createClient();
      const { error } = next
        ? await supabase.from("bookmarks").insert({ content_id: contentId })
        : await supabase.from("bookmarks").delete().eq("content_id", contentId);

      if (error) {
        setBookmarked(!next);
        toast.error("Could not save that", "Check your connection and try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this"}
      className={`kl-press inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors ${
        bookmarked
          ? "border-accent bg-accent-soft text-accent"
          : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
      }`}
    >
      {bookmarked ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
      <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
    </button>
  );
}
