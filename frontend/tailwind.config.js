/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf6',
          100: '#d6f5e7',
          500: '#1f9d67',
          700: '#156f49',
          900: '#0f3f2a',
        },
      },
      boxShadow: {
        panel: '0 8px 30px rgba(4, 40, 24, 0.09)',
      },
    },
  },
  plugins: [],
}
