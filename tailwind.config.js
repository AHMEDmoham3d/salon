/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cairo', 'sans-serif'],
        body: ['Tajawal', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f6f5f3',
          100: '#e8e5e0',
          200: '#d1ccc4',
          300: '#b3aaa0',
          400: '#8f8478',
          500: '#6b5f54',
          600: '#4d443c',
          700: '#332e29',
          800: '#1f1c19',
          900: '#0f0d0c',
        },
        gold: {
          50: '#fbf6ee',
          100: '#f5e9d3',
          200: '#ecd2a3',
          300: '#e0b56d',
          400: '#d49a3e',
          500: '#b88c40',
          600: '#9a6f30',
          700: '#7a5625',
          800: '#5c4220',
          900: '#3e2d16',
        },
      },
      boxShadow: {
        'soft': '0 2px 20px -4px rgba(24, 22, 20, 0.08)',
        'gold': '0 8px 30px -8px rgba(184, 140, 64, 0.35)',
      },
    },
  },
  plugins: [],
};
