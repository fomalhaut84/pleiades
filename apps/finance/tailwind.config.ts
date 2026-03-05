import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        bg: '#07080c',
        'bg-raised': '#0d0e14',
        dim: '#6e6e82',
        sub: '#9494a8',
        muted: '#c8c8d4',
        bright: '#eeeef2',
        sejin: '#34d399',
        sodam: '#60a5fa',
        dasom: '#fb923c',
        card: 'rgba(255,255,255,0.025)',
        'card-hover': 'rgba(255,255,255,0.045)',
        border: 'rgba(255,255,255,0.06)',
        'border-hover': 'rgba(255,255,255,0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
