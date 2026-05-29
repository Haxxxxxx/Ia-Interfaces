import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0D1117",
          surface: "#161B22",
          border: "#30363D",
          text: "#C9D1D9",
          muted: "#8B949E",
          accent: "#F97316",
          accentDim: "#C2410C",
          green: "#3FB950",
          red: "#F85149",
          yellow: "#D29922",
          purple: "#BC8CFF",
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
