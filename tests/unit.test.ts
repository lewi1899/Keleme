/**
 * Unit tests for the pure logic that the RLS suite cannot reach.
 *
 * The phone cases below are deliberately the SAME table the SQL suite uses,
 * because `normalizeEthiopianPhone` and `public.normalize_et_phone` are two
 * implementations of one rule and the whole risk is that they drift apart.
 *
 *   npm test
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  formatEthiopianPhone,
  isValidEthiopianPhone,
  normalizeEthiopianPhone,
} from "../src/lib/phone";
import { accessibleGrades, gradeCanAccess } from "../src/lib/grades";
import { extractYouTubeId, matricQuestionSchema, registrationSchema } from "../src/lib/validation";
import { formatBirr, formatDuration, formatDurationShort, ordinal } from "../src/lib/format";

describe("normalizeEthiopianPhone", () => {
  it("accepts every shape a student might type", () => {
    const cases: [string, string][] = [
      ["0982395841", "+251982395841"],       // national trunk form
      ["+251944046611", "+251944046611"],    // already canonical
      ["251944046611", "+251944046611"],     // country code, no plus
      ["944046611", "+251944046611"],        // bare subscriber number
      ["+251 94 404 6611", "+251944046611"], // spaced
      ["0911-22-33-44", "+251911223344"],    // dashed
      ["(0911) 223344", "+251911223344"],    // bracketed
      ["0712345678", "+251712345678"],       // Safaricom 7-range
    ];

    for (const [input, expected] of cases) {
      assert.equal(normalizeEthiopianPhone(input), expected, `input: ${input}`);
    }
  });

  it("rejects anything that is not an Ethiopian mobile number", () => {
    const invalid = [
      "0812345678",   // 8-range is not mobile
      "0112345678",   // Addis landline
      "091234567",    // too short
      "09123456789",  // too long
      "+254712345678",// Kenya
      "abcdefghij",
      "",
      "   ",
      "0",
    ];

    for (const input of invalid) {
      assert.equal(normalizeEthiopianPhone(input), null, `should reject: ${input}`);
      assert.equal(isValidEthiopianPhone(input), false);
    }
  });

  it("treats null and undefined as invalid rather than throwing", () => {
    assert.equal(normalizeEthiopianPhone(null), null);
    assert.equal(normalizeEthiopianPhone(undefined), null);
  });

  it("is idempotent — normalising twice changes nothing", () => {
    const once = normalizeEthiopianPhone("0982395841")!;
    assert.equal(normalizeEthiopianPhone(once), once);
  });

  it("formats for display without losing information", () => {
    assert.equal(formatEthiopianPhone("+251944046611"), "+251 94 404 6611");
    // An unexpected shape is passed through rather than mangled.
    assert.equal(formatEthiopianPhone("not-a-number"), "not-a-number");
  });
});

describe("grade access (spec section 7)", () => {
  it("walls grades 9, 10 and 11 off from each other", () => {
    for (const viewer of [9, 10, 11]) {
      for (const content of [9, 10, 11, 12]) {
        assert.equal(
          gradeCanAccess(viewer, content),
          viewer === content,
          `grade ${viewer} viewing grade ${content}`
        );
      }
    }
  });

  it("lets grade 12 reach the whole 9-12 catalogue", () => {
    for (const content of [9, 10, 11, 12]) {
      assert.equal(gradeCanAccess(12, content), true, `grade 12 viewing grade ${content}`);
    }
  });

  it("refuses grades outside 9-12 entirely", () => {
    assert.equal(gradeCanAccess(8, 8), false);
    assert.equal(gradeCanAccess(13, 12), false);
    assert.equal(gradeCanAccess(12, 8), false);
    assert.equal(gradeCanAccess(Number.NaN, 12), false);
  });

  it("lists browsable grades most-relevant-first", () => {
    assert.deepEqual(accessibleGrades(9), [9]);
    assert.deepEqual(accessibleGrades(11), [11]);
    assert.deepEqual(accessibleGrades(12), [12, 11, 10, 9]);
    assert.deepEqual(accessibleGrades(7), []);
  });
});

describe("extractYouTubeId", () => {
  it("handles every URL shape people actually paste", () => {
    const id = "dQw4w9WgXcQ";
    const urls = [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      // Tracking parameters must not survive into the database.
      `https://www.youtube.com/watch?v=${id}&t=42s&list=PLabc&si=xyz`,
      `youtube.com/watch?v=${id}`,
      id,
    ];

    for (const url of urls) {
      assert.equal(extractYouTubeId(url), id, `url: ${url}`);
    }
  });

  it("rejects non-YouTube and malformed links", () => {
    const invalid = [
      "https://vimeo.com/123456",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/",
      "not a url at all",
      "",
    ];

    for (const url of invalid) {
      assert.equal(extractYouTubeId(url), null, `should reject: ${url}`);
    }
  });
});

describe("registrationSchema", () => {
  const valid = {
    fullName: "Selam Tesfaye",
    email: "Selam@Example.COM",
    phone: "0912345678",
    grade: "11",
    schoolName: "Menelik II Secondary School",
    password: "a-strong-password",
  };

  it("normalises the phone number and lowercases the email", () => {
    const result = registrationSchema.parse(valid);
    assert.equal(result.phone, "+251912345678");
    assert.equal(result.email, "selam@example.com");
    assert.equal(result.grade, 11);
  });

  it("rejects a phone number that is not Ethiopian mobile", () => {
    const result = registrationSchema.safeParse({ ...valid, phone: "0812345678" });
    assert.equal(result.success, false);
  });

  it("rejects grades outside 9-12", () => {
    for (const grade of ["8", "13", "0", "abc"]) {
      assert.equal(registrationSchema.safeParse({ ...valid, grade }).success, false, `grade ${grade}`);
    }
  });

  it("requires a password of at least 8 characters", () => {
    assert.equal(registrationSchema.safeParse({ ...valid, password: "short" }).success, false);
  });

  it("requires a school, because school-level rewards depend on it", () => {
    assert.equal(registrationSchema.safeParse({ ...valid, schoolName: "" }).success, false);
  });

  it("treats an empty referral code as absent rather than invalid", () => {
    const result = registrationSchema.parse({ ...valid, referralCode: "" });
    assert.equal(result.referralCode, undefined);
  });

  it("uppercases a referral code so codes are case-insensitive to type", () => {
    const result = registrationSchema.parse({ ...valid, referralCode: "abc123" });
    assert.equal(result.referralCode, "ABC123");
  });
});

describe("matricQuestionSchema", () => {
  const base = {
    yearId: "00000000-0000-0000-0000-000000000001",
    subjectId: "00000000-0000-0000-0000-000000000002",
    questionHtml: "<p>What is 2 + 2?</p>",
    difficulty: "easy" as const,
    accessTier: "matric" as const,
    marks: 1,
    isPublished: true,
  };

  it("requires exactly one correct option", () => {
    const twoCorrect = matricQuestionSchema.safeParse({
      ...base,
      options: [
        { label: "A", bodyHtml: "3", isCorrect: true },
        { label: "B", bodyHtml: "4", isCorrect: true },
      ],
    });
    assert.equal(twoCorrect.success, false);

    const noneCorrect = matricQuestionSchema.safeParse({
      ...base,
      options: [
        { label: "A", bodyHtml: "3", isCorrect: false },
        { label: "B", bodyHtml: "4", isCorrect: false },
      ],
    });
    assert.equal(noneCorrect.success, false);

    const exactlyOne = matricQuestionSchema.safeParse({
      ...base,
      options: [
        { label: "A", bodyHtml: "3", isCorrect: false },
        { label: "B", bodyHtml: "4", isCorrect: true },
      ],
    });
    assert.equal(exactlyOne.success, true);
  });

  it("requires at least two options", () => {
    const result = matricQuestionSchema.safeParse({
      ...base,
      options: [{ label: "A", bodyHtml: "4", isCorrect: true }],
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty option body", () => {
    const result = matricQuestionSchema.safeParse({
      ...base,
      options: [
        { label: "A", bodyHtml: "", isCorrect: true },
        { label: "B", bodyHtml: "4", isCorrect: false },
      ],
    });
    assert.equal(result.success, false);
  });
});

describe("formatting", () => {
  it("formats study durations the way a student reads them", () => {
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(59), "0m");     // under a minute rounds down
    assert.equal(formatDuration(60), "1m");
    assert.equal(formatDuration(1800), "30m");
    assert.equal(formatDuration(3600), "1h");
    assert.equal(formatDuration(5400), "1h 30m");
    assert.equal(formatDuration(-100), "0m");   // never negative
    assert.equal(formatDuration(Number.NaN), "0m");
  });

  it("formats compact durations for tight cells", () => {
    assert.equal(formatDurationShort(1800), "30m");
    assert.equal(formatDurationShort(5400), "1.5h");
    assert.equal(formatDurationShort(36000), "10h");
  });

  it("formats prices as money: no decimals on whole birr, two on santim", () => {
    assert.equal(formatBirr(50), "50 Birr");
    assert.equal(formatBirr(120), "120 Birr");
    assert.equal(formatBirr(300), "300 Birr");
    // Money conventionally carries both santim digits or neither, never one.
    assert.equal(formatBirr(12.5), "12.50 Birr");
    assert.equal(formatBirr(12.75), "12.75 Birr");
  });

  it("gets ordinals right, including the teens", () => {
    const cases: [number, string][] = [
      [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
      [11, "11th"], [12, "12th"], [13, "13th"],
      [21, "21st"], [22, "22nd"], [23, "23rd"],
      [101, "101st"], [111, "111th"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(ordinal(input), expected, `ordinal(${input})`);
    }
  });
});
