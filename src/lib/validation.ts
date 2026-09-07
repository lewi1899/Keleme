import { z } from "zod";
import { normalizeEthiopianPhone } from "@/lib/phone";

/**
 * Input schemas shared by the client forms and the server actions that receive
 * them. The server always re-parses — a schema used only in the browser is a
 * hint, not a check.
 */

export const ethiopianPhone = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((value, ctx) => {
    const normalized = normalizeEthiopianPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Ethiopian mobile number, e.g. 0912345678",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const gradeSchema = z.coerce
  .number()
  .int()
  .refine((g) => [9, 10, 11, 12].includes(g), "Choose a grade between 9 and 12");

export const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(120, "That name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: ethiopianPhone,
  grade: gradeSchema,
  schoolName: z
    .string()
    .trim()
    .min(2, "Enter your school's name")
    .max(160, "That school name is too long"),
  // Eight is the practical floor: Supabase's own default is six, and the extra
  // two characters cost a student nothing while removing the worst passwords.
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Passwords are limited to 72 characters"),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,12}$/, "That referral code doesn't look right")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationValues = z.output<typeof registrationSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display names need at least 2 characters")
    .max(40, "Display names are limited to 40 characters")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  leaderboardOptIn: z.boolean(),
  schoolName: z.string().trim().min(2).max(160).optional(),
});

export const contentSchema = z
  .object({
    contentType: z.enum(["html", "pdf", "youtube", "other"]),
    accessTier: z.enum(["free", "premium", "matric"]),
    grade: gradeSchema,
    subjectId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    unitId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    title: z.string().trim().min(1, "Give this content a title").max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    bodyHtml: z.string().optional(),
    storagePath: z.string().optional(),
    youtubeUrl: z.string().optional(),
    externalUrl: z.string().optional(),
    isPublished: z.boolean().default(false),
  })
  // Each content type carries its own required payload. Mirrors the
  // `content_type_payload` CHECK constraint, so the form can explain the
  // problem instead of surfacing a database error.
  .superRefine((value, ctx) => {
    if (value.contentType === "html" && !value.bodyHtml?.trim()) {
      ctx.addIssue({ code: "custom", path: ["bodyHtml"], message: "HTML content needs a body" });
    }
    if (value.contentType === "pdf" && !value.storagePath?.trim()) {
      ctx.addIssue({ code: "custom", path: ["storagePath"], message: "Upload a PDF file first" });
    }
    if (value.contentType === "youtube" && !extractYouTubeId(value.youtubeUrl ?? "")) {
      ctx.addIssue({
        code: "custom",
        path: ["youtubeUrl"],
        message: "That doesn't look like a YouTube link",
      });
    }
    if (value.contentType === "other" && !value.externalUrl?.trim()) {
      ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Add a link" });
    }
  });

/**
 * Accepts every YouTube URL shape students and admins actually paste — watch
 * links, share links, embeds, shorts, and a bare id — and returns the video id
 * or null. Nothing else is stored, so a tracking-laden URL never reaches the
 * database or the student's browser.
 */
export function extractYouTubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return idPattern.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && idPattern.test(v)) return v;

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && ["embed", "v", "shorts", "live"].includes(segments[0])) {
      return idPattern.test(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

export const planSchema = z.object({
  kind: z.enum(["standard", "matric"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  durationDays: z.coerce.number().int().min(1).max(3650),
  price: z.coerce.number().min(0).max(1_000_000),
  adLevel: z.enum(["none", "low", "medium", "high"]),
  isActive: z.boolean(),
  isPromotional: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const contactPhoneSchema = z.object({
  phone: ethiopianPhone,
  label: z.string().trim().min(1).max(40),
  purpose: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const contactEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  label: z.string().trim().min(1).max(40),
  purpose: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const matricQuestionSchema = z.object({
  yearId: z.string().uuid(),
  subjectId: z.string().uuid(),
  questionHtml: z.string().trim().min(1, "The question cannot be empty"),
  explanationHtml: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  accessTier: z.enum(["free", "premium", "matric"]),
  marks: z.coerce.number().int().min(1).max(20).default(1),
  isPublished: z.boolean().default(false),
  options: z
    .array(
      z.object({
        label: z.string().regex(/^[A-H]$/),
        bodyHtml: z.string().trim().min(1, "An option cannot be empty"),
        isCorrect: z.boolean(),
      })
    )
    .min(2, "A question needs at least two options")
    .max(8)
    // Mirrors the partial unique index and the publish-time trigger.
    .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
      message: "Mark exactly one option as correct",
    }),
});

/** Human-readable message for the first failure in a ZodError. */
export function firstError(error: z.ZodError): string {
  return error.errors[0]?.message ?? "Please check the form and try again.";
}
