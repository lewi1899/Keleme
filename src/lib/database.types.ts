/**
 * Hand-maintained mirror of the SQL schema in `supabase/migrations/`.
 *
 * Regenerate from a live project with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * It is written by hand here so the repository typechecks without network
 * access to a Supabase project — CI, a fresh clone and a laptop on a bad
 * connection all build the same way. If you change a migration, change this
 * file in the same commit.
 */

export type UserRole = "student" | "content_editor" | "admin";
export type ContentType = "html" | "pdf" | "youtube" | "other";
export type AccessTier = "free" | "premium" | "matric";
export type PlanKind = "standard" | "matric";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";
export type EntitlementKind = "premium" | "matric";
export type EntitlementSource = "purchase" | "referral_reward" | "admin_grant" | "promotion";
export type AdLevel = "none" | "low" | "medium" | "high";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type RewardStatus = "pending" | "awarded" | "claimed" | "forfeited";
export type ReferralStatus = "pending" | "confirmed" | "rejected";

/** Grades KELEME serves. Grade 12 additionally reaches 9, 10 and 11. */
export const GRADES = [9, 10, 11, 12] as const;
export type Grade = (typeof GRADES)[number];

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  grade: Grade;
  school_id: string | null;
  school_name: string | null;
  role: UserRole;
  display_name: string | null;
  leaderboard_opt_in: boolean;
  public_no: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  total_seconds: number;
  referral_code: string;
  referred_by: string | null;
  timezone: string;
  avatar_url: string | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface School {
  id: string;
  name: string;
  normalized_name: string;
  region: string | null;
  city: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  grade: Grade;
  name: string;
  slug: string;
  description: string | null;
  icon_key: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentItem {
  id: string;
  content_type: ContentType;
  access_tier: AccessTier;
  grade: Grade;
  subject_id: string | null;
  unit_id: string | null;
  title: string;
  description: string | null;
  tags: string[];
  storage_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  external_url: string | null;
  thumbnail_path: string | null;
  duration_minutes: number | null;
  is_published: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  kind: PlanKind;
  slug: string;
  name: string;
  description: string | null;
  duration_days: number;
  price: number;
  currency: string;
  ad_level: AdLevel;
  is_active: boolean;
  is_promotional: boolean;
  promo_ends_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  plan_id: string;
  provider: string;
  provider_reference: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export interface UserEntitlement {
  id: string;
  user_id: string;
  kind: EntitlementKind;
  source: EntitlementSource;
  plan_id: string | null;
  payment_id: string | null;
  starts_at: string;
  ends_at: string;
  granted_by: string | null;
  note: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

export interface MatricYear {
  id: string;
  year: number;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MatricQuestion {
  id: string;
  year_id: string;
  subject_id: string;
  question_html: string;
  explanation_html: string | null;
  difficulty: QuestionDifficulty;
  access_tier: AccessTier;
  marks: number;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatricQuestionOption {
  id: string;
  question_id: string;
  label: string;
  body_html: string;
  is_correct: boolean;
  sort_order: number;
}

/** Shape returned by `get_matric_questions` — note the absence of is_correct. */
export interface MatricQuestionForStudent {
  id: string;
  question_html: string | null;
  difficulty: QuestionDifficulty;
  marks: number;
  access_tier: AccessTier;
  locked: boolean;
  options: { id: string; label: string; body_html: string }[];
  answered: boolean;
  answered_option: string | null;
  answered_correct: boolean | null;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  is_anonymous: boolean;
  is_me: boolean;
  grade: Grade;
  streak: number;
  seconds: number;
}

export interface ReferralTier {
  id: string;
  name: string;
  required: number;
  reward_days: number;
  reward_kind: EntitlementKind;
  earned: boolean;
}

export interface ReferralSummary {
  referral_code: string;
  confirmed: number;
  pending: number;
  tiers: ReferralTier[];
}

export interface ContactPhone {
  id: string;
  phone: string;
  label: string;
  purpose: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContactEmail {
  id: string;
  email: string;
  label: string;
  purpose: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SupportContacts {
  phones: { phone: string; label: string; purpose: string | null }[];
  emails: { email: string; label: string; purpose: string | null }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning" | "critical";
  target_grade: Grade | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardCatalogItem {
  id: string;
  name: string;
  description: string | null;
  reward_type: "premium_days" | "matric_days" | "prize" | "airtime" | "cash";
  reward_days: number | null;
  value_birr: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WeeklyRewardRun {
  id: string;
  week_start: string;
  week_end: string;
  computed_at: string;
  published: boolean;
}

export interface WeeklyRewardWinner {
  id: string;
  run_id: string;
  user_id: string;
  rank: number;
  seconds: number;
  reward_id: string | null;
  status: RewardStatus;
  claimed_at: string | null;
  admin_note: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DailyActivity {
  user_id: string;
  activity_date: string;
  seconds: number;
  content_opened: number;
  questions_answered: number;
  is_learning_day: boolean;
  updated_at: string;
}

export interface HeartbeatResult {
  session_id: string;
  credited_seconds: number;
  session_seconds: number;
  day_seconds: number;
}
