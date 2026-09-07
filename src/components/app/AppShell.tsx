"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  BookOpen, ChevronDown, Crown, GraduationCap, Home, LogOut, Settings,
  Shield, Trophy, Users,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { StreakPill } from "./StreakPill";
import { StudyHeartbeat } from "./StudyHeartbeat";
import { logoutAction } from "@/app/(auth)/actions";
import type { SessionContext } from "@/lib/session";

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  /** Grade 12 only — the matric package is not sold to other years. */
  grade12Only?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", shortLabel: "Home", icon: <Home size={19} /> },
  { href: "/learn", label: "Study", shortLabel: "Study", icon: <BookOpen size={19} /> },
  { href: "/matric", label: "Matric papers", shortLabel: "Matric", icon: <GraduationCap size={19} />, grade12Only: true },
  { href: "/leaderboard", label: "Leaderboard", shortLabel: "Ranks", icon: <Trophy size={19} /> },
  { href: "/referrals", label: "Invite friends", shortLabel: "Invite", icon: <Users size={19} /> },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/**
 * Authenticated shell.
 *
 * Two navigations, not one responsive compromise: a sidebar on desktop, and a
 * thumb-reachable bottom tab bar on phones. The original build put six
 * header buttons in a row, which wrapped into an unusable stack below about
 * 420px — the width of most of the phones this is used on.
 */
export function AppShell({
  session,
  children,
}: {
  session: SessionContext & { profile: NonNullable<SessionContext["profile"]> };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile } = session;

  const items = NAV.filter((item) => !item.grade12Only || profile.grade === 12);
  const isStaff = profile.role === "admin" || profile.role === "content_editor";

  return (
    <div className="min-h-screen">
      <StudyHeartbeat />

      {/* ------------------------------------------------------------ sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-kl-border bg-surface lg:flex lg:flex-col">
        <div className="px-5 py-5">
          <Link href="/dashboard" className="kl-press inline-flex rounded-lg">
            <Logo subtitle={`Grade ${profile.grade}`} />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "kl-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 p-3">
          {!session.is_premium && (
            <Link
              href="/premium"
              className="kl-interactive block rounded-2xl border border-kl-border bg-[var(--surface-elevated)] p-4"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Crown size={15} className="text-amber-500" aria-hidden />
                Go Premium
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                Unlock every note and textbook for your grade, with fewer ads.
              </span>
            </Link>
          )}

          {isStaff && (
            <Link
              href="/admin"
              className="kl-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-accent-soft hover:text-text-primary"
            >
              <Shield size={19} />
              Admin
            </Link>
          )}
        </div>
      </aside>

      {/* ---------------------------------------------------------------- top */}
      <div className="lg:pl-60">
        <header className="kl-glass sticky top-0 z-30 border-b">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/dashboard" className="kl-press inline-flex rounded-lg lg:hidden">
              <Logo size="sm" showWordmark={false} />
            </Link>

            <div className="flex flex-1 items-center justify-end gap-2">
              <StreakPill streak={profile.current_streak} todaySeconds={session.today_seconds} />
              <ThemeSwitcher isPremium={session.is_premium} />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  className="kl-press flex items-center gap-1.5 rounded-full border border-kl-border py-1 pl-1 pr-2"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-[var(--accent-contrast)]">
                    {initials(profile.full_name)}
                  </span>
                  <ChevronDown size={14} className="text-text-secondary" aria-hidden />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div className="kl-surface animate-kl-pop absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-2xl border p-2 shadow-kl-lift">
                      <div className="border-b border-kl-border px-3 pb-2.5 pt-1.5">
                        <p className="truncate text-sm font-semibold text-text-primary">{profile.full_name}</p>
                        <p className="truncate text-xs text-text-secondary">{profile.email}</p>
                        <p className="mt-1.5 text-xs text-text-secondary">
                          Grade {profile.grade}
                          {session.is_premium && " · Premium"}
                          {session.is_matric && " · Matric"}
                        </p>
                      </div>

                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="kl-press mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-primary hover:bg-accent-soft"
                      >
                        <Settings size={16} aria-hidden />
                        Settings
                      </Link>
                      <Link
                        href="/premium"
                        onClick={() => setMenuOpen(false)}
                        className="kl-press flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-primary hover:bg-accent-soft"
                      >
                        <Crown size={16} aria-hidden />
                        {session.is_premium ? "Manage subscription" : "Go Premium"}
                      </Link>
                      {isStaff && (
                        <Link
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="kl-press flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-primary hover:bg-accent-soft lg:hidden"
                        >
                          <Shield size={16} aria-hidden />
                          Admin
                        </Link>
                      )}

                      <form action={logoutAction} className="mt-1 border-t border-kl-border pt-1">
                        <button
                          type="submit"
                          className="kl-press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                        >
                          <LogOut size={16} aria-hidden />
                          Sign out
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* pb-24 leaves room for the mobile tab bar; lg:pb-10 reclaims it. */}
        <main id="main" className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------ mobile tabs */}
      <nav
        aria-label="Main"
        className="kl-glass kl-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "kl-press flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-text-secondary"
                )}
              >
                <span className={clsx("transition-transform duration-200", active && "-translate-y-0.5 scale-110")}>
                  {item.icon}
                </span>
                {item.shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
