/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['Syne', 'Figtree', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#05070D',
        surface: '#0C1220',
        'surface-elevated': '#121A2A',
        'border-subtle': '#243044',
      },
      boxShadow: {
        soft: '0 16px 40px -20px rgba(0,0,0,0.65)',
        glow: '0 20px 50px -24px rgba(59,130,246,0.45)',
        bubble: '0 14px 32px -18px rgba(0,0,0,0.55)',
        lift: '0 22px 50px -28px rgba(0,0,0,0.7)',
      },
      keyframes: {
        'slide-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
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
        'soft-pulse': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.04)' },
        },
        'icon-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'slide-fade-in': 'slide-fade-in 280ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-rise': 'fade-rise 620ms cubic-bezier(0.22,1,0.36,1) both',
        'bounce-dot': 'bounce-dot 1.2s infinite ease-in-out',
        'bounce-dot-delay-1': 'bounce-dot 1.2s infinite ease-in-out 150ms',
        'bounce-dot-delay-2': 'bounce-dot 1.2s infinite ease-in-out 300ms',
        shimmer: 'shimmer 2.2s linear infinite',
        'soft-pulse': 'soft-pulse 2.8s ease-in-out infinite',
        'icon-float': 'icon-float 4.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
