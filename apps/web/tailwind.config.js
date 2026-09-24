export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        accent: {
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
          solid: "rgb(var(--accent-solid) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          brand: "rgb(var(--accent-brand) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          line: "rgb(var(--accent-line) / <alpha-value>)",
          pale: "rgb(var(--accent-pale) / <alpha-value>)",
        },
        danger: {
          ink: "rgb(var(--danger-ink) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)",
          line: "rgb(var(--danger-line) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
