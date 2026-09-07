import type { Config } from "tailwindcss";

/**
 * Ported from the original KELEME build so the visual identity is unchanged:
 * the same brand ramp, the same CSS-variable-backed semantic tokens
 * (`surface`, `kl-border`, `text-primary`, `accent`, ...) that let the six
 * themes swap instantly with no React re-render.
 *
 * Added here on top of that original: the motion keyframes/animations and the
 * shadow + timing tokens that the interaction layer builds on, so animation
 * is a design-system decision rather than something re-invented per component.
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
      },
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        "kl-border": "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
      },
      boxShadow: {
        "kl-sm": "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        "kl-card": "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "kl-lift": "0 12px 28px -12px rgb(0 0 0 / 0.18), 0 4px 10px -6px rgb(0 0 0 / 0.10)",
        "kl-glow": "0 0 0 4px var(--accent-soft)",
      },
      transitionTimingFunction: {
        "kl-spring": "cubic-bezier(0.22, 1, 0.36, 1)",
        "kl-out": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "kl-fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "kl-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "kl-pop": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "kl-slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "kl-flame": {
          "0%, 100%": { transform: "scale(1) rotate(-2deg)" },
          "50%": { transform: "scale(1.12) rotate(2deg)" },
        },
        "kl-shimmer": {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "kl-ring": {
          from: { strokeDashoffset: "var(--ring-circumference)" },
          to: { strokeDashoffset: "var(--ring-offset-target)" },
        },
        "kl-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "kl-fade-up": "kl-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "kl-fade-in": "kl-fade-in 0.4s ease-out both",
        "kl-pop": "kl-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        "kl-slide-in-right": "kl-slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
        "kl-flame": "kl-flame 1.8s ease-in-out infinite",
        "kl-float": "kl-float 6s ease-in-out infinite",
        "kl-ring": "kl-ring 1s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
