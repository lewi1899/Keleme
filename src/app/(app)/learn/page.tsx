import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { requireUser, accessibleGrades } from "@/lib/session";
import { getSubjectsForGrade, listContent } from "@/lib/queries/student";
import { Card } from "@/components/ui/Card";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContentTypeIcon, contentHref } from "@/components/content/ContentRow";

export const metadata = { title: "Study" };
export const dynamic = "force-dynamic";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: { grade?: string; q?: string };
}) {
  const { profile } = await requireUser();

  const grades = accessibleGrades(profile.grade);
  const requested = Number(searchParams.grade);
  // Never trust the query string for which grade to show: fall back to the
  // student's own grade unless the requested one is genuinely reachable. The
  // database would refuse anyway, but silently showing an empty page is a
  // worse experience than showing the right one.
  const activeGrade = grades.includes(requested) ? requested : profile.grade;
  const search = searchParams.q?.trim() ?? "";

  const [subjects, searchResults] = await Promise.all([
    getSubjectsForGrade(activeGrade),
    search ? listContent({ grade: activeGrade, search, limit: 30 }) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Study</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {profile.grade === 12
            ? "Everything for Grade 12, plus Grades 9 to 11 for revision."
            : `Everything published for Grade ${profile.grade}.`}
        </p>
      </header>

      <form className="relative" role="search">
        {activeGrade !== profile.grade && <input type="hidden" name="grade" value={activeGrade} />}
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search notes, textbooks and videos…"
          aria-label="Search content"
          className="w-full rounded-xl border border-kl-border bg-surface py-2.5 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent"
        />
      </form>

      {/* Grade 12 is the only case with more than one option, so the switcher
          simply does not render for anyone else. */}
      {grades.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Grade">
          {grades.map((grade) => {
            const active = grade === activeGrade;
            return (
              <Link
                key={grade}
                href={grade === profile.grade ? "/learn" : `/learn?grade=${grade}`}
                role="tab"
                aria-selected={active}
                className={`kl-press rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent text-[var(--accent-contrast)]"
                    : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                }`}
              >
                Grade {grade}
                {grade === profile.grade && " (yours)"}
              </Link>
            );
          })}
        </div>
      )}

      {searchResults ? (
        <section>
          <h2 className="kl-display mb-3 text-lg font-bold text-text-primary">
            {searchResults.total === 0
              ? `No results for “${search}”`
              : `${searchResults.total} result${searchResults.total === 1 ? "" : "s"} for “${search}”`}
          </h2>

          {searchResults.items.length === 0 ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Nothing matched that"
              description="Try a shorter search, or browse by subject below."
            />
          ) : (
            <div className="kl-stagger space-y-2">
              {searchResults.items.map((item, i) => (
                <Link
                  key={item.id}
                  href={contentHref(item)}
                  style={{ ["--kl-i" as string]: Math.min(i, 12) }}
                  className="kl-interactive kl-surface flex items-center gap-3 rounded-xl border p-3 shadow-kl-card"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                    <ContentTypeIcon type={item.content_type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">{item.title}</span>
                    <span className="block truncate text-xs text-text-secondary">
                      Grade {item.grade}
                      {item.description ? ` · ${item.description}` : ""}
                    </span>
                  </span>
                  <TierBadge tier={item.access_tier} />
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="kl-display mb-3 text-lg font-bold text-text-primary">
          Grade {activeGrade} subjects
        </h2>

        {subjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={20} />}
            title="No subjects published yet"
            description="Your teachers add subjects and content through the KELEME admin panel. Check back soon."
          />
        ) : (
          <div className="kl-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject, i) => (
              <Card
                key={subject.id}
                interactive
                as={Link}
                {...({ href: `/learn/subject/${subject.id}` } as object)}
                style={{ ["--kl-i" as string]: i }}
                className="block p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor: subject.color }}
                    aria-hidden
                  >
                    {subject.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-text-primary">{subject.name}</span>
                    <span className="block text-xs text-text-secondary">
                      {subject.content_count === 0
                        ? "Nothing published yet"
                        : `${subject.content_count} ${subject.content_count === 1 ? "item" : "items"}`}
                    </span>
                  </span>
                </div>
                {subject.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{subject.description}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
