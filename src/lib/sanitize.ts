import "server-only";

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Server-side HTML sanitisation for admin-authored study content.
 *
 * Sanitising on write rather than on read is deliberate. Study notes are read
 * far more often than they are written, so paying the cost once at upload keeps
 * the student-facing path fast; and it means anything already in the database
 * is known-clean, rather than depending on every future read path remembering
 * to sanitise.
 *
 * The allow-list is generous about structure (tables, figures, details,
 * KaTeX's span soup) because real textbook content needs it, and absolute
 * about behaviour: no script, no style, no event handlers, no iframes, and no
 * javascript: or data: URLs.
 */

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis);

const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code", "kbd", "samp",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption",
  "details", "summary",
  // KaTeX renders to annotated MathML plus spans; without these, equations
  // arrive as unreadable fragments.
  "math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "msup", "msub",
  "mfrac", "msqrt", "mroot", "mtext", "mspace", "mtable", "mtr", "mtd", "munder",
  "mover", "munderover", "mstyle", "mpadded", "mphantom", "menclose",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "title",
  "src", "alt", "width", "height", "loading", "decoding",
  "class", "id",
  "colspan", "rowspan", "scope", "headers",
  "open",
  "data-katex", "data-diagram", "aria-hidden", "aria-label", "role",
  "mathvariant", "displaystyle", "scriptlevel", "encoding", "stretchy",
];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Belt and braces alongside the tag allow-list.
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style", "formaction", "srcdoc"],
    ALLOW_DATA_ATTR: false,
    // Images may be data: URIs (diagrams are often inlined); links may not.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
  });
}

/**
 * Every external link in study content opens in a new tab and drops the
 * referrer. `noopener` is the one that matters: without it the opened page can
 * reach back through window.opener and navigate the student away from KELEME.
 */
export function hardenLinks(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });

  doc.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  });

  return doc.body.innerHTML;
}

/** The single call sites should use: sanitise, then harden. */
export function prepareContentHtml(dirty: string): string {
  return hardenLinks(sanitizeHtml(dirty));
}

/** Plain-text preview for search results and admin lists. */
export function htmlToText(html: string, maxLength = 200): string {
  const text = new JSDOM(`<body>${sanitizeHtml(html)}</body>`).window.document.body.textContent ?? "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}
