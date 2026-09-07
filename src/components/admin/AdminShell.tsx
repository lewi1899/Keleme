"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, BarChart3, BookOpen, CreditCard, FileText, GraduationCap,
  LayoutDashboard, Megaphone, Menu, Phone, ScrollText, Settings, Tag,
  Trophy, Users, UserCog, X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import type { UserRole } from "@/lib/database.types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Real administrative power — hidden from content editors entirely. */
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard size={18} /> },
  { href: "/admin/content", label: "Content", icon: <FileText size={18} /> },
  { href: "/admin/subjects", label: "Subjects & units", icon: <BookOpen size={18} /> },
  { href: "/admin/matric", label: "Matric questions", icon: <GraduationCap size={18} /> },
  { href: "/admin/students", label: "Students", icon: <Users size={18} />, adminOnly: true },
  { href: "/admin/payments", label: "Payments", icon: <CreditCard size={18} />, adminOnly: true },
  { href: "/admin/plans", label: "Plans & pricing", icon: <Tag size={18} />, adminOnly: true },
  { href: "/admin/rewards", label: "Rewards", icon: <Trophy size={18} />, adminOnly: true },
  { href: "/admin/referrals", label: "Referrals", icon: <Users size={18} />, adminOnly: true },
  { href: "/admin/announcements", label: "Announcements", icon: <Megaphone size={18} />, adminOnly: true },
  { href: "/admin/contacts", label: "Contacts", icon: <Phone size={18} />, adminOnly: true },
  { href: "/admin/team", label: "Team", icon: <UserCog size={18} />, adminOnly: true },
  { href: "/admin/analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings size={18} />, adminOnly: true },
  { href: "/admin/audit", label: "Audit log", icon: <ScrollText size={18} />, adminOnly: true },
];

/**
 * Admin shell, following the original build's sidebar layout.
 *
 * Items a content editor cannot use are removed rather than disabled. A greyed
 * out "Plans & pricing" invites someone to ask why they cannot click it; a
 * menu that only contains what you can do is simply a smaller menu. The
 * server-side gate is `requireStaff`/`requireAdmin` on each route, and RLS
 * underneath that — this filtering is presentation, not protection.
 */
export function AdminShell({
  role,
  fullName,
  email,
  isPremium,
  children,
}: {
  role: UserRole;
  fullName: string;
  email: string | null;
  isPremium: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV.filter((item) => !item.adminOnly || role === "admin");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/admin" className="kl-press inline-flex rounded-lg" onClick={() => setMobileOpen(false)}>
          <Logo subtitle="Admin" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft lg:hidden"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "kl-press flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
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

      <div className="border-t border-kl-border p-3">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-semibold text-text-primary">{fullName}</p>
          <p className="truncate text-xs text-text-secondary">{email}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-accent">
            {role === "admin" ? "Administrator" : "Content editor"}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="kl-press flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-text-secondary hover:bg-accent-soft hover:text-text-primary"
        >
          <ArrowLeft size={18} />
          Back to KELEME
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-kl-border bg-surface lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-kl-fade-in absolute inset-0 bg-black/45" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="animate-kl-slide-in-right absolute inset-y-0 left-0 w-72 border-r border-kl-border bg-surface">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="kl-glass sticky top-0 z-30 border-b">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="kl-press rounded-lg p-2 text-text-secondary hover:bg-accent-soft lg:hidden"
            >
              <Menu size={20} aria-hidden />
            </button>
            <div className="flex-1 lg:hidden">
              <Logo size="sm" showWordmark={false} />
            </div>
            <ThemeSwitcher isPremium={isPremium} />
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
