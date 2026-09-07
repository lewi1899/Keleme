/**
 * Ethiopian phone normalisation.
 *
 * A deliberate, exact mirror of `public.normalize_et_phone` in
 * supabase/migrations/0001_init.sql. Two implementations of one rule is a
 * hazard, so it is worth being explicit about why both exist: the SQL copy is
 * the enforcement point (it runs even when someone posts straight to GoTrue,
 * bypassing this app entirely), and this copy exists purely so the
 * registration form can tell a student their number is wrong before they
 * submit it. If you change one, change both — `tests/phone.test.ts` checks
 * this implementation against the same table of cases the SQL suite uses.
 */

/** Canonical form is +251 followed by the nine-digit subscriber number. */
export function normalizeEthiopianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return null;

  if (digits.length === 12 && digits.startsWith("251")) {
    digits = digits.slice(3);
  } else if (digits.length === 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  } else if (digits.length !== 9) {
    return null;
  }

  // Ethiopian mobile ranges: 9 (all operators) and 7 (Safaricom Ethiopia).
  if (!/^[97][0-9]{8}$/.test(digits)) return null;

  return `+251${digits}`;
}

export function isValidEthiopianPhone(raw: string | null | undefined): boolean {
  return normalizeEthiopianPhone(raw) !== null;
}

/** `+251944046611` -> `+251 94 404 6611`, for display only. */
export function formatEthiopianPhone(normalized: string): string {
  const m = /^\+251(\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : normalized;
}
