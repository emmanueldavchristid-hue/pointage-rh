/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#111827', soft: '#1F2937' },
        brand: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
        },
        surface: '#F8FAFC',
        muted: '#64748B',
        success: { DEFAULT: '#16A34A', soft: '#F0FDF4', border: '#BBF7D0' },
        warning: { DEFAULT: '#F59E0B', strong: '#B45309', soft: '#FFFBEB', border: '#FDE68A' },
        danger: { DEFAULT: '#DC2626', soft: '#FEF2F2', border: '#FECACA' },
      },
      borderRadius: { lg: '0.625rem', xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.18), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'zoom-in': { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'zoom-in': 'zoom-in 150ms ease-out',
        'slide-in-left': 'slide-in-left 200ms ease-out',
      },
    },
  },
  plugins: [],
};
