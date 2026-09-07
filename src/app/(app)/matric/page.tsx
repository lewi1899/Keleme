import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Lock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Matric papers" };
export const dynamic = "force-dynamic";

interface CatalogRow {
  year_id: string;
  year: number;
  label: string;
  subject_id: string;
  subject_name: string;
  question_count: number;
  free_count: number;
}

export default async function MatricPage() {
  const session = await requireUser();

  // Matric is a grade 12 product. Other grades are sent home rather than shown
  // a paywall they could never buy through.
  if (session.profile.grade !== 12) {
    redirect("/dashboard");
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc("get_matric_catalog");
  const rows = (data ?? []) as CatalogRow[];

  const byYear = new Map<string, { year: number; label: string; subjects: CatalogRow[] }>();
  for (const row of rows) {
    const existing = byYear.get(row.year_id);
    if (existing) existing.subjects.push(row);
    else byYear.set(row.year_id, { year: row.year, label: row.label, subjects: [row] });
  }
  const years = [...byYear.entries()].sort((a, b) => b[1].year - a[1].year);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Matric papers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Real past matric and model papers, by year and subject. Every question is marked
            instantly and explained.
          </p>
        </div>
        {session.is_matric ? (
          <Badge tone="matric" icon={<GraduationCap size={12} />}>Matric package active</Badge>
        ) : (
          <Link href="/premium">
            <Button icon={<Lock size={16} />}>Unlock matric papers</Button>
          </Link>
        )}
      </header>

      {!session.is_matric && (
        <Card className="border-violet-500/30 p-5">
          <p className="text-sm leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">The Matric Package is separate from KELEME Premium.</span>{" "}
            Premium covers your grade&apos;s notes, textbooks and videos. The Matric Package covers
            past papers, answers and explanations. You can hold either, or both.
          </p>
        </Card>
      )}

      {years.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={20} />}
          title="No papers published yet"
          description="Past papers are added year by year. Check back soon — or start with your Grade 12 subject notes in the meantime."
          action={
            <Link href="/learn">
              <Button variant="secondary">Browse Grade 12 notes</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {years.map(([yearId, year]) => (
            <section key={yearId}>
              <h2 className="kl-display mb-3 text-lg font-bold text-text-primary">{year.label}</h2>
              <div className="kl-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {year.subjects.map((subject, i) => (
                  <Card
                    key={subject.subject_id}
                    interactive
                    as={Link}
                    {...({ href: `/matric/${yearId}/${subject.subject_id}` } as object)}
                    style={{ ["--kl-i" as string]: i }}
                    className="block p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-text-primary">{subject.subject_name}</p>
                      {!session.is_matric && subject.free_count > 0 && (
                        <Badge tone="success">{subject.free_count} free</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {subject.question_count} {subject.question_count === 1 ? "question" : "questions"}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
