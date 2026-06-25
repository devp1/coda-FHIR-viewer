/**
 * Tailwind tokens ported VERBATIM from the Coda Lab app config so the standalone viewer renders
 * byte-identically to the in-app version. Fonts resolve to system fallbacks via the CSS variables in
 * index.css (no bundled font files → the single HTML works fully offline).
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FBFBFA',
        surface: '#FFFFFF',
        'surface-dim': '#F5F5F3',
        ink: {
          DEFAULT: '#0A0A0A',
          mid: '#525252',
          light: '#8A8A8A',
          faint: '#A3A3A3',
        },
        ok: { DEFAULT: '#1a6b4a', soft: '#dde6d4' },
        info: { DEFAULT: '#2d3e50', soft: '#e4e8ec' },
        warn: { DEFAULT: '#92400e', soft: 'rgba(146,64,14,0.08)' },
        bad: { DEFAULT: '#b91c1c', soft: 'rgba(220,38,38,0.06)' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderColor: {
        hairline: 'rgba(0,0,0,0.08)',
        'hairline-strong': 'rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '14px',
        sm: '8px',
      },
    },
  },
  plugins: [],
};
