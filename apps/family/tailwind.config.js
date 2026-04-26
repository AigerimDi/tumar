/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      // Pull from the shared CSS variables so the Electron app matches the
      // web terminal exactly. Don't duplicate hex values here - that's how
      // the two surfaces drift apart.
      colors: {
        ink: {
          950: "var(--color-ink-950)",
          900: "var(--color-ink-900)",
          850: "var(--color-ink-850)",
          800: "var(--color-ink-800)",
          700: "var(--color-ink-700)",
          600: "var(--color-ink-600)",
          500: "var(--color-ink-500)",
          400: "var(--color-ink-400)",
          300: "var(--color-ink-300)",
          200: "var(--color-ink-200)",
          100: "var(--color-ink-100)",
          50: "var(--color-ink-50)",
        },
        gold: {
          300: "var(--color-gold-300)",
          400: "var(--color-gold-400)",
          500: "var(--color-gold-500)",
          600: "var(--color-gold-600)",
        },
        up: "var(--color-up)",
        down: "var(--color-down)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};
