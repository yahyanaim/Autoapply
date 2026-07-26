/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#FF6A00', hover: '#E95E00', light: '#FFF2E8' },
        success: { DEFAULT: '#22C55E', light: '#F0FDF4' },
        danger: { DEFAULT: '#EF4444', light: '#FEF2F2' },
        dark: { 900: '#0F172A', 800: '#1E293B', 700: '#334155' },
        gray: { 100: '#F8FAFC', 200: '#E5E7EB', 400: '#9CA3AF', 500: '#6B7280', 900: '#111827' },
      },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '20px' },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.08)',
        overlay: '0 20px 40px rgba(0,0,0,0.15)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
