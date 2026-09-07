import { BookOpen, FileText, Link2, PlayCircle } from "lucide-react";
import type { ContentItem } from "@/lib/database.types";

/** One icon vocabulary for content types, used everywhere they are listed. */
export function ContentTypeIcon({ type, size = 15 }: { type: ContentItem["content_type"]; size?: number }) {
  switch (type) {
    case "pdf":
      return <BookOpen size={size} aria-hidden />;
    case "youtube":
      return <PlayCircle size={size} aria-hidden />;
    case "other":
      return <Link2 size={size} aria-hidden />;
    default:
      return <FileText size={size} aria-hidden />;
  }
}

export function contentTypeLabel(type: ContentItem["content_type"]): string {
  switch (type) {
    case "pdf":
      return "Textbook";
    case "youtube":
      return "Video";
    case "other":
      return "Link";
    default:
      return "Notes";
  }
}

export function contentHref(item: Pick<ContentItem, "id">): string {
  return `/learn/content/${item.id}`;
}
