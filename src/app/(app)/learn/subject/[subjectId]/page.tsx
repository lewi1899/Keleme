import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TierBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContentTypeIcon, contentHref, contentTypeLabel } from "@/components/content/ContentRow";
import type { ContentItem, Subject, Unit } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { subjectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("subjects").select("name, grade").eq("id", params.subjectId).maybeSingle();
  return { title: data ? `${data.name} — Grade ${data.grade}` : "Subject" };
}

export default async function SubjectPage({ params }: { params: { subjectId: string } }) {
  await requireUser();
  const supabase = createSupabaseServerClient();

  // Three reads in parallel. If RLS hides the subject — wrong grade, or
  // deactivated — `subject` comes back null and we render a 404 rather than an
  // authorization error, which tells an unauthorised student nothing about
  // whether the id exists.
  const [{ data: subject }, { data: units }, { data: content }] = await Promise.all([
    supabase.from("subjects").select("*").eq("id", params.subjectId).maybeSingle(),
    supabase
      .from("units")
      .select("*")
      .eq("subject_id", params.subjectId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("content_items")
      .select("*")
      .eq("subject_id", params.subjectId)
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (!subject) notFound();

  const typedSubject = subject as Subject;
  const typedUnits = (units ?? []) as Unit[];
  const items = (content ?? []) as ContentItem[];

  const byUnit = new Map<string | null, ContentItem[]>();
  for (const item of items) {
    const key = item.unit_id ?? null;
    const bucket = byUnit.get(key);
    if (bucket) bucket.push(item);
    else byUnit.set(key, [item]);
  }
  const unfiled = byUnit.get(null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/learn${typedSubject.grade !== undefined ? `?grade=${typedSubject.grade}` : ""}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} aria-hidden />
          All subjects
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-base font-bold text-white"
            style={{ backgroundColor: typedSubject.color }}
            aria-hidden
          >
            {typedSubject.name.slice(0, 2)}
          </span>
          <div>
            <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary">{typedSubject.name}</h1>
            <p className="text-sm text-text-secondary">
              Grade {typedSubject.grade} · {items.length} {items.length === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        {typedSubject.description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">{typedSubject.description}</p>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={20} />}
          title="Nothing published here yet"
          description={`${typedSubject.name} content will appear as soon as it is published. Try another subject in the meantime.`}
        />
      ) : (
        <div className="space-y-6">
          {typedUnits.map((unit) => {
            const unitItems = byUnit.get(unit.id) ?? [];
            if (unitItems.length === 0) return null;
            return <UnitSection key={unit.id} title={unit.title} description={unit.description} items={unitItems} />;
          })}

          {unfiled.length > 0 && (
            <UnitSection
              title={typedUnits.length > 0 ? "Other material" : "All material"}
              description={null}
              items={unfiled}
            />
          )}
        </div>
      )}
    </div>
  );
}

function UnitSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string | null;
  items: ContentItem[];
}) {
  return (
    <section>
      <h2 className="kl-display text-lg font-bold text-text-primary">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}

      <div className="kl-stagger mt-3 space-y-2">
        {items.map((item, i) => (
          <Card
            key={item.id}
            interactive
            as={Link}
            {...({ href: contentHref(item) } as object)}
            style={{ ["--kl-i" as string]: Math.min(i, 12) }}
            className="flex items-center gap-3 p-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <ContentTypeIcon type={item.content_type} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text-primary">{item.title}</span>
              <span className="block truncate text-xs text-text-secondary">
                {contentTypeLabel(item.content_type)}
                {item.duration_minutes ? ` · ${item.duration_minutes} min` : ""}
                {item.description ? ` · ${item.description}` : ""}
              </span>
            </span>
            <TierBadge tier={item.access_tier} />
          </Card>
        ))}
      </div>
    </section>
  );
}
