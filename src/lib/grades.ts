/**
 * Grade access rules.
 *
 * Kept in their own module, free of any server-only import, for two reasons:
 * client components need them for rendering decisions, and they can be unit
 * tested directly. They mirror `public.grade_can_access` in migration 0001 —
 * the database is still the enforcement point; these decide what to draw.
 */

export const GRADES = [9, 10, 11, 12] as const;
export type Grade = (typeof GRADES)[number];

export function isGrade(value: unknown): value is Grade {
  return typeof value === "number" && (GRADES as readonly number[]).includes(value);
}

/**
 * Grades 9-11 are strictly walled off from each other. Grade 12 is the single
 * exception: it reaches the whole 9-12 catalogue, because matric revision
 * legitimately spans every earlier year.
 */
export function gradeCanAccess(viewerGrade: number, contentGrade: number): boolean {
  if (!isGrade(viewerGrade) || !isGrade(contentGrade)) return false;
  if (viewerGrade === 12) return contentGrade >= 9 && contentGrade <= 12;
  return viewerGrade === contentGrade;
}

/** Grades a student may browse, most relevant first. */
export function accessibleGrades(viewerGrade: number): number[] {
  if (!isGrade(viewerGrade)) return [];
  return viewerGrade === 12 ? [12, 11, 10, 9] : [viewerGrade];
}
