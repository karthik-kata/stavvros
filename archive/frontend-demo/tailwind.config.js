/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#17202C', soft: '#3A4656' },
        muted: '#5A6675',
        line: '#D3D9E1',
        canvas: '#F2F4F7',
        panel: '#FFFFFF',
        sunken: '#EEF1F5',
        accent: { DEFAULT: '#2C5A88', soft: '#E3ECF6', strong: '#1F4A75' },
        drift: { DEFAULT: '#C2570C', soft: '#FBEBDD' },
        crit: { DEFAULT: '#B42318', soft: '#FBE4E1' },
        warn: { DEFAULT: '#966A10', soft: '#F7EDD4' },
        ok: { DEFAULT: '#1E7B4F', soft: '#DFF2E7' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
