/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#070B14',
        surface: '#111827',
        'surface-elevated': '#171F2E',
        'border-subtle': '#243044',
      },
      boxShadow: {
        soft: '0 8px 30px -12px rgba(0,0,0,0.55)',
        glow: '0 0 40px -12px rgba(59,130,246,0.35)',
        bubble: '0 10px 28px -14px rgba(0,0,0,0.55)',
      },
      keyframes: {
        'slide-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bounce-dot': {
          '0%, 60%, 100%': {
            transform: 'translateY(0) scale(1)',
            opacity: '0.35',
          },
          '30%': {
            transform: 'translateY(-4px) scale(1.2)',
            opacity: '1',
          },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'slide-fade-in': 'slide-fade-in 220ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-rise': 'fade-rise 500ms cubic-bezier(0.22,1,0.36,1) both',
        'bounce-dot': 'bounce-dot 1.2s infinite ease-in-out',
        'bounce-dot-delay-1': 'bounce-dot 1.2s infinite ease-in-out 150ms',
        'bounce-dot-delay-2': 'bounce-dot 1.2s infinite ease-in-out 300ms',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
}
