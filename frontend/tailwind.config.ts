import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f4f7f4',
          100: '#e6ede6',
          200: '#cddcce',
          300: '#a8c2aa',
          400: '#7ea382',
          500: '#5c8660',
          600: '#476b4b',
          700: '#39553d',
          800: '#2f4432',
          900: '#27392b',
        },
      },
    },
  },
  plugins: [],
};

export default config;
