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
        bg: 'var(--bg)',
        'bg-raised': 'var(--bg-raised)',
        dim: 'var(--dim)',
        sub: 'var(--sub)',
        muted: 'var(--text)',
        bright: 'var(--bright)',
        sejin: 'var(--sejin)',
        sodam: 'var(--sodam)',
        dasom: 'var(--dasom)',
        card: 'var(--card)',
        'card-hover': 'var(--card-hover)',
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
        'surface-dim': 'var(--surface-dim)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-active': 'var(--surface-active)',
        'header-blur': 'var(--header-blur)',
      },
    },
  },
  plugins: [],
};
export default config;
