/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50:  '#FDFCFA',
          100: '#F7F4EE',
          200: '#EDE7DC',
          300: '#DFD8CB',
          400: '#C8BFB0',
        },
        ink: {
          DEFAULT: '#0D0C0B',
          900: '#1C1A18',
          700: '#4A4742',
          500: '#857F78',
          300: '#C2BCB4',
          100: '#ECE8E2',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
