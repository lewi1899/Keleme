import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Announcement, ContentItem, Subject } from "@/lib/database.types";

/**
 * Read paths for the student surfaces.
 *
 * Every query here runs on the cookie-bound anon client, so RLS decides what
 * comes back. Nothing in this file re-checks grade or entitlement — that would
 * be a second, drift-prone copy of a rule the database already enforces. What
 * this file does own is *shape*: selecting only the columns a screen renders,
 * and paginating rather than fetching a table.
 */

export interface ContinueItem {
  content_id: string;
  last_opened_at: string;
  title: string;
  content_type: ContentItem["content_type"];
  access_tier: ContentItem["access_tier"];
  grade: number;
  subject_name: string | null;
}

export async function getContinueStudying(limit = 4): Promise<ContinueItem[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("content_progress")
    .select(
      "content_id, last_opened_at, content_items!inner(title, content_type, access_tier, grade, subjects(name))"
    )
    .order("last_opened_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => {
    const item = row.content_items as unknown as {
      title: string;
      content_type: ContentItem["content_type"];
      access_tier: ContentItem["access_tier"];
      grade: number;
      subjects: { name: string } | null;
    };
    return {
      content_id: row.content_id as string,
      last_opened_at: row.last_opened_at as string,
      title: item.title,
      content_type: item.content_type,
      access_tier: item.access_tier,
      grade: item.grade,
      subject_name: item.subjects?.name ?? null,
    };
  });
}

export interface SubjectWithCount extends Subject {
  content_count: number;
}

/**
 * Subjects for a grade, each with how much published content it holds.
 *
 * The count comes back from PostgREST as an aggregate on the embedded
 * relation rather than as N follow-up queries — with ten subjects per grade
 * that is the difference between one round trip and eleven.
 */
export async function getSubjectsForGrade(grade: number): Promise<SubjectWithCount[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("subjects")
    .select("*, content_items(count)")
    .eq("grade", grade)
    .eq("is_active", true)
    .order("sort_order");

  if (error || !data) return [];

  return data.map((row) => {
    const { content_items, ...subject } = row as Subject & { content_items: { count: number }[] };
    return { ...subject, content_count: content_items?.[0]?.count ?? 0 };
  });
}

export async function getWeeklySeconds(): Promise<{ week: number; today: number }> {
  const supabase = createSupabaseServerClient();

  // Sunday-anchored, matching the leaderboard's week so the two never disagree
  // about which days count.
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_activity")
    .select("activity_date, seconds")
    .gte("activity_date", weekStartIso);

  if (error || !data) return { week: 0, today: 0 };

  return data.reduce(
    (acc, row) => ({
      week: acc.week + (row.seconds as number),
      today: acc.today + (row.activity_date === todayIso ? (row.seconds as number) : 0),
    }),
    { week: 0, today: 0 }
  );
}

export async function getMyRank(scope: "weekly" | "monthly" | "all" = "weekly") {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_rank", { p_scope: scope });
  if (error || !data) return { rank: null as number | null, seconds: 0, streak: 0 };
  return data as { rank: number | null; seconds: number; streak: number };
}

export async function getLiveAnnouncements(limit = 3): Promise<Announcement[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(limit);

  // RLS already filters to live, in-window, grade-matched announcements, so
  // there is nothing to re-filter here.
  if (error || !data) return [];
  return data as Announcement[];
}

export interface ContentListOptions {
  subjectId?: string;
  unitId?: string;
  grade?: number;
  type?: ContentItem["content_type"];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ContentListResult {
  items: ContentItem[];
  total: number;
}

/**
 * Paginated catalogue listing. Always ranged, never a bare select — the
 * catalogue is expected to grow into the thousands of rows, and the browser
 * should never receive more than a page of it.
 */
export async function listContent(options: ContentListOptions = {}): Promise<ContentListResult> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = supabase
    .from("content_items")
    .select("*", { count: "exact" })
    .eq("is_published", true);

  if (options.subjectId) query = query.eq("subject_id", options.subjectId);
  if (options.unitId) query = query.eq("unit_id", options.unitId);
  if (options.grade) query = query.eq("grade", options.grade);
  if (options.type) query = query.eq("content_type", options.type);
  if (options.search?.trim()) {
    // Backed by the trigram GIN index on title, so this stays an index scan
    // rather than degrading into a sequential one as the catalogue grows.
    query = query.ilike("title", `%${options.search.trim()}%`);
  }

  const { data, count, error } = await query
    .order("sort_order")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { items: [], total: 0 };
  return { items: (data ?? []) as ContentItem[], total: count ?? 0 };
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as ContentItem;
}

/**
 * The HTML body, through the RPC that is the only path to it.
 *
 * Returns null when the student is not entitled — the caller renders a paywall
 * rather than an error, because "you need Premium for this" is the honest
 * answer, not a failure.
 */
export async function getContentHtml(id: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_content_html", { p_content: id });
  if (error) return null;
  return (data as string | null) ?? null;
}
