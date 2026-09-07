import Link from "next/link";
import { ArrowLeft, Flame, ShieldCheck, Trophy } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/**
 * Shared shell for sign-in and registration.
 *
 * The left panel is hidden below `lg`. That is not just responsive tidying:
 * on a phone the form should be the first and only thing on screen, because
 * every pixel spent on marketing above it is a pixel the student has to scroll
 * past to type their password.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kl-mesh flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="kl-press inline-flex items-center gap-2 rounded-lg">
          <Logo size="sm" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} aria-hidden />
          Back
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="hidden lg:block">
            <h1 className="kl-display text-4xl font-extrabold leading-tight tracking-tight text-text-primary">
              Study smarter,
              <br />
              <span className="text-accent">every single day.</span>
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-text-secondary">
              Notes, textbooks, videos and past matric papers for grades 9 to 12 — organised by
              subject and unit, so you spend your time studying rather than searching.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                { icon: <Flame size={16} />, title: "Daily streaks", body: "A day counts when you genuinely study, not when you open the app." },
                { icon: <Trophy size={16} />, title: "Weekly prizes", body: "The top ten students by study time win every week." },
                { icon: <ShieldCheck size={16} />, title: "Your data stays yours", body: "Your name only appears on the leaderboard if you say so." },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    {item.icon}
                  </span>
                  <span>
                    <span className="block font-semibold text-text-primary">{item.title}</span>
                    <span className="block text-sm text-text-secondary">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </main>

      <footer className="px-4 py-6 text-center text-xs text-text-secondary sm:px-6">
        © {new Date().getFullYear()} KELEME
      </footer>
    </div>
  );
}
