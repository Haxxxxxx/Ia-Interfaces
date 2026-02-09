import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0D0D12",
          surface: "#16161D",
          border: "#2A2A3C",
          text: "#E4E4ED",
          muted: "#8B8BA3",
          accent: "#F97316",
          green: "#22C55E",
          red: "#EF4444",
          yellow: "#EAB308",
          purple: "#A259FF",
          orange: "#F97316",
          blue: "#1ABCFE",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
