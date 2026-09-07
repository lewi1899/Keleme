import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentHtml, getContentItem } from "@/lib/queries/student";
import { Card } from "@/components/ui/Card";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProtectedHtmlViewer } from "@/components/content/ProtectedHtmlViewer";
import { PdfDownloadButton } from "@/components/content/PdfDownloadButton";
import { YouTubeEmbed } from "@/components/content/YouTubeEmbed";
import { Paywall } from "@/components/content/Paywall";
import { BookmarkButton } from "@/components/content/BookmarkButton";
import { contentTypeLabel } from "@/components/content/ContentRow";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { contentId: string } }) {
  const item = await getContentItem(params.contentId);
  return { title: item?.title ?? "Content" };
}

export default async function ContentPage({ params }: { params: { contentId: string } }) {
  const session = await requireUser();
  const supabase = createSupabaseServerClient();

  const item = await getContentItem(params.contentId);
  // Null here means either "no such row" or "RLS hid it". Both render as 404
  // on purpose — distinguishing them would let a student in grade 9 probe
  // which grade 12 content ids exist.
  if (!item) notFound();

  const [{ data: canAccess }, { data: bookmark }] = await Promise.all([
    supabase.rpc("can_access_content", { p_content: item.id }),
    supabase
      .from("bookmarks")
      .select("content_id")
      .eq("content_id", item.id)
      .maybeSingle(),
  ]);

  const allowed = Boolean(canAccess);

  // Opening a piece of content is a genuine learning event, so it counts
  // toward the day's activity and the streak. Only recorded when the student
  // is actually entitled — arriving at a paywall is not studying.
  if (allowed) {
    await supabase.rpc("record_learning_event", {
      p_kind: "content_opened",
      p_content_id: item.id,
    });
  }

  const html = allowed && item.content_type === "html" ? await getContentHtml(item.id) : null;
  const watermark = `${session.profile.full_name} · KELEME`;

  return (
    <article className="space-y-5">
      <div>
        <Link
          href={item.subject_id ? `/learn/subject/${item.subject_id}` : "/learn"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} aria-hidden />
          Back
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              {item.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{contentTypeLabel(item.content_type)}</Badge>
              <Badge tone="neutral">Grade {item.grade}</Badge>
              <TierBadge tier={item.access_tier} />
              {item.duration_minutes && <Badge tone="neutral">{item.duration_minutes} min</Badge>}
            </div>
          </div>

          {allowed && <BookmarkButton contentId={item.id} initiallyBookmarked={Boolean(bookmark)} />}
        </div>

        {item.description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">{item.description}</p>
        )}
      </div>

      {!allowed ? (
        <Paywall tier={item.access_tier === "matric" ? "matric" : "premium"} title={item.title} />
      ) : (
        <>
          {item.content_type === "html" && (
            <Card className="p-5 sm:p-7">
              {html ? (
                <ProtectedHtmlViewer html={html} watermark={watermark} />
              ) : (
                <p className="text-sm text-text-secondary">
                  This note has no content yet. Please check back later.
                </p>
              )}
            </Card>
          )}

          {item.content_type === "pdf" && (
            <Card className="p-6">
              <p className="text-sm leading-relaxed text-text-secondary">
                This is a downloadable textbook. Save it to your phone and read it with no
                connection at all.
              </p>
              <div className="mt-4">
                <PdfDownloadButton contentId={item.id} fileSizeBytes={item.file_size_bytes} />
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-text-secondary">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                The download link is created for you and expires in a few minutes. Come back here
                any time for a fresh one.
              </p>
            </Card>
          )}

          {item.content_type === "youtube" && item.youtube_video_id && (
            <YouTubeEmbed videoId={item.youtube_video_id} title={item.title} />
          )}

          {item.content_type === "other" && item.external_url && (
            <Card className="p-6">
              <p className="text-sm text-text-secondary">This resource is hosted elsewhere.</p>
              <a href={item.external_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-block">
                <Button variant="secondary" icon={<ExternalLink size={16} />}>
                  Open resource
                </Button>
              </a>
            </Card>
          )}
        </>
      )}

      <p className="text-xs text-text-secondary">Updated {formatDate(item.updated_at)}</p>
    </article>
  );
}
