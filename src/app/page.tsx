import Link from "next/link";
import {
  ArrowRight, BookOpen, Crown, Download, FileText, Flame, GraduationCap,
  PlayCircle, ShieldCheck, Sparkles, Trophy, Users,
} from "lucide-react";
import { getSessionContext } from "@/lib/session";
import { getActivePlans, getSupportContacts } from "@/lib/queries/public";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatBirr } from "@/lib/format";
import type { Plan } from "@/lib/database.types";

export const metadata = {
  title: "KELEME — Study Smarter",
  description:
    "Notes, textbooks, past matric papers and practice questions for Ethiopian students in grades 9 to 12. Study offline, keep your streak, win weekly prizes.",
};

// Rendered per request (it greets a signed-in visitor differently) but its
// data comes from an hour-long cache, so the common case costs no database
// round trip. This is the page most likely to be opened on a slow connection
// by someone who is not yet a user.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [session, plans, support] = await Promise.all([
    getSessionContext(),
    getActivePlans(),
    getSupportContacts(),
  ]);

  const standard = plans.filter((p) => p.kind === "standard");
  const matric = plans.filter((p) => p.kind === "matric");

  return (
    <div className="kl-mesh min-h-screen">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40">
        <div className="kl-glass border-b">
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Logo />
            <div className="flex items-center gap-2">
              <Link href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary sm:block">
                Pricing
              </Link>
              <Link href="/leaderboard" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary sm:block">
                Leaderboard
              </Link>
              {session?.profile ? (
                <Link href="/dashboard">
                  <Button size="sm" icon={<ArrowRight size={15} />}>
                    Open KELEME
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/login">
                    <Button size="sm" variant="ghost">
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm">Get started</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* -------------------------------------------------------------- hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-kl-fade-up">
              <Badge tone="accent" icon={<Sparkles size={12} />}>
                Built for Ethiopian students
              </Badge>

              <h1 className="kl-display mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
                Everything you need to
                <span className="text-accent"> pass your exams</span>, in one place.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
                Study notes written for the Ethiopian curriculum, downloadable textbooks, video
                lessons and every past matric paper — for grades 9 through 12. Keep a daily streak,
                climb the leaderboard, and win prizes every week.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/register">
                  <Button size="lg" icon={<GraduationCap size={18} />}>
                    Create a free account
                  </Button>
                </Link>
                <Link href="#pricing">
                  <Button size="lg" variant="secondary">
                    See pricing
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-xs text-text-secondary">
                Free forever for free content in your grade. No card needed to start.
              </p>
            </div>

            {/* A composed preview rather than a screenshot: it stays truthful as
                the product changes, it themes correctly, and it costs no image
                bytes on a slow connection. */}
            <div className="animate-kl-fade-up [animation-delay:120ms]">
              <div className="kl-surface relative rounded-3xl border p-5 shadow-kl-lift">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Welcome back</p>
                    <p className="kl-display text-lg font-bold text-text-primary">Selam</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-kl-border px-2.5 py-1 text-xs font-semibold text-text-primary">
                    <Flame size={13} className="animate-kl-flame text-orange-500" aria-hidden />
                    12 day streak
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: "Studied today", value: "48m" },
                    { label: "This week", value: "5h 20m" },
                    { label: "Rank", value: "#7" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-[var(--surface-elevated)] p-3">
                      <p className="kl-display text-lg font-bold text-text-primary">{stat.value}</p>
                      <p className="mt-0.5 text-[11px] leading-tight text-text-secondary">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    { icon: <FileText size={15} />, title: "Chemistry — Unit 3 Notes", meta: "Grade 11 · 22 min" },
                    { icon: <PlayCircle size={15} />, title: "Physics — Projectile Motion", meta: "Video · 14 min" },
                    { icon: <BookOpen size={15} />, title: "Maths Textbook", meta: "PDF · downloadable" },
                  ].map((row) => (
                    <div key={row.title} className="flex items-center gap-3 rounded-xl border border-kl-border p-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                        {row.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{row.title}</p>
                        <p className="text-[11px] text-text-secondary">{row.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="kl-display text-center text-3xl font-bold tracking-tight text-text-primary">
            Made for the way you actually study
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-text-secondary">
            Not a video dump and not a PDF folder. Every piece of content is filed by grade, subject
            and unit, so you find the thing you need in seconds.
          </p>

          <div className="kl-stagger mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <FileText size={18} />,
                title: "Interactive study notes",
                body: "Written for the Ethiopian curriculum with proper equations, diagrams and collapsible explanations. Read them online on any phone.",
              },
              {
                icon: <Download size={18} />,
                title: "Downloadable textbooks",
                body: "Full PDF textbooks you can keep on your phone and open with no connection. Free textbooks stay free.",
              },
              {
                icon: <GraduationCap size={18} />,
                title: "Every past matric paper",
                body: "Grade 12 papers going back years, by subject, with the correct answer and an explanation for each question.",
              },
              {
                icon: <Flame size={18} />,
                title: "Streaks that mean something",
                body: "A day counts when you actually study — five real minutes or five questions. Not for opening the app.",
              },
              {
                icon: <Trophy size={18} />,
                title: "Weekly prizes",
                body: "The ten students who study the most each week win. Ranking is computed on our servers, so it cannot be gamed.",
              },
              {
                icon: <Users size={18} />,
                title: "Invite your friends",
                body: "Bring 5 friends and get a month of Premium. Bring 50 and get a full year. They only count once they actually join.",
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                style={{ ["--kl-i" as string]: i }}
                className="kl-surface kl-interactive rounded-2xl border p-5 shadow-kl-card"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  {feature.icon}
                </span>
                <h3 className="kl-display mt-3.5 font-bold text-text-primary">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ grades */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="kl-surface rounded-3xl border p-7 shadow-kl-card sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="kl-display text-2xl font-bold text-text-primary">Pick your grade</h2>
                <p className="mt-1.5 text-sm text-text-secondary">
                  You get everything for your year. Grade 12 also gets grades 9, 10 and 11 for revision.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[9, 10, 11, 12].map((grade, i) => (
                <Link
                  key={grade}
                  href="/register"
                  style={{ ["--kl-i" as string]: i }}
                  className="kl-interactive group rounded-2xl border border-kl-border p-5"
                >
                  <p className="kl-display text-3xl font-extrabold text-text-primary">
                    Grade {grade}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {grade === 12 ? "Plus grades 9–11 and matric papers" : "Notes, textbooks and videos"}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    Start here
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="kl-display text-center text-3xl font-bold tracking-tight text-text-primary">
            Simple pricing
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-text-secondary">
            The longer you commit, the cheaper each month gets — and the fewer ads you see. The
            annual plans have no ads at all.
          </p>

          <PlanGroup
            title="KELEME Premium"
            subtitle="All premium notes, textbooks and videos for your grade."
            plans={standard}
            highlightSlug="standard-12m"
          />

          {matric.length > 0 && (
            <PlanGroup
              title="Matric Package"
              subtitle="A separate package for grade 12 — every past matric and model paper, with answers and explanations."
              plans={matric}
              highlightSlug="matric-12m"
              tone="matric"
            />
          )}

          <p className="mt-8 text-center text-xs text-text-secondary">
            The Matric Package is sold separately from KELEME Premium. You can hold either, or both.
          </p>
        </section>

        {/* ----------------------------------------------------------- contact */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="kl-surface rounded-3xl border p-7 shadow-kl-card sm:p-10">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="kl-display text-2xl font-bold text-text-primary">Questions or problems?</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  Call or message us any time. We read every suggestion and complaint.
                </p>
                <div className="mt-5 space-y-2">
                  {support.phones.map((phone) => (
                    <a
                      key={phone.phone}
                      href={`tel:${phone.phone}`}
                      className="kl-interactive flex items-center justify-between rounded-xl border border-kl-border p-3"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">{phone.phone}</span>
                        <span className="block text-xs text-text-secondary">{phone.label}</span>
                      </span>
                      <ArrowRight size={15} className="text-accent" aria-hidden />
                    </a>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="kl-display font-bold text-text-primary">Email</h3>
                <div className="mt-3 space-y-2">
                  {support.emails.map((email) => (
                    <a
                      key={email.email}
                      href={`mailto:${email.email}`}
                      className="kl-interactive flex items-center justify-between rounded-xl border border-kl-border p-3"
                    >
                      <span>
                        <span className="block break-all text-sm font-semibold text-text-primary">{email.email}</span>
                        <span className="block text-xs text-text-secondary">{email.label}</span>
                      </span>
                      <ArrowRight size={15} className="shrink-0 text-accent" aria-hidden />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-kl-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo size="sm" subtitle="Study smarter" />
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-secondary">
            <Link href="/leaderboard" className="hover:text-text-primary">Leaderboard</Link>
            <Link href="#pricing" className="hover:text-text-primary">Pricing</Link>
            <Link href="/login" className="hover:text-text-primary">Sign in</Link>
            <Link href="/register" className="hover:text-text-primary">Create account</Link>
          </div>
          <p className="text-xs text-text-secondary">
            © {new Date().getFullYear()} KELEME
          </p>
        </div>
      </footer>
    </div>
  );
}

function PlanGroup({
  title,
  subtitle,
  plans,
  highlightSlug,
  tone = "standard",
}: {
  title: string;
  subtitle: string;
  plans: Plan[];
  highlightSlug: string;
  tone?: "standard" | "matric";
}) {
  if (plans.length === 0) return null;

  return (
    <div className="mt-12">
      <div className="flex items-center gap-2">
        {tone === "matric" ? (
          <Badge tone="matric" icon={<GraduationCap size={12} />}>Grade 12 only</Badge>
        ) : (
          <Badge tone="premium" icon={<Crown size={12} />}>All grades</Badge>
        )}
        <h3 className="kl-display text-xl font-bold text-text-primary">{title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>

      <div className="kl-stagger mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const featured = plan.slug === highlightSlug;
          const months = Math.round(plan.duration_days / 30);
          const perMonth = plan.price / Math.max(1, months);

          return (
            <div
              key={plan.id}
              style={{ ["--kl-i" as string]: i }}
              className={`kl-surface kl-interactive relative flex flex-col rounded-2xl border p-5 shadow-kl-card ${
                featured ? "border-accent ring-1 ring-accent" : ""
              }`}
            >
              {featured && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-contrast)]">
                  Best value
                </span>
              )}

              <p className="text-sm font-semibold text-text-secondary">{plan.name}</p>
              <p className="kl-display mt-2 text-3xl font-extrabold text-text-primary">
                {formatBirr(plan.price)}
              </p>
              {months > 1 && (
                <p className="mt-1 text-xs text-text-secondary">
                  about {formatBirr(Math.round(perMonth))} a month
                </p>
              )}

              <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
                {plan.description}
              </p>

              <div className="mt-4">
                {plan.ad_level === "none" ? (
                  <Badge tone="success" icon={<ShieldCheck size={12} />}>No ads</Badge>
                ) : plan.ad_level === "low" ? (
                  <Badge tone="accent">Very few ads</Badge>
                ) : plan.ad_level === "medium" ? (
                  <Badge tone="neutral">Fewer ads</Badge>
                ) : (
                  <Badge tone="neutral">Includes ads</Badge>
                )}
              </div>

              <Link href="/register" className="mt-4">
                <Button fullWidth variant={featured ? "primary" : "secondary"} size="sm">
                  Get started
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
