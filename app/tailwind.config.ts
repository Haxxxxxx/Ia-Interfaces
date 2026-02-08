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
          bg: "#0D1117",
          surface: "#161B22",
          border: "#30363D",
          text: "#C9D1D9",
          muted: "#8B949E",
          accent: "#58A6FF",
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
