/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#0F172A',
        surface: '#1E293B',
        'border-subtle': '#334155',
      },
      keyframes: {
        'slide-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bounce-dot': {
          '0%, 60%, 100%': {
            transform: 'translateY(0) scale(1)',
            opacity: '0.4',
          },
          '30%': {
            transform: 'translateY(-3px) scale(1.15)',
            opacity: '1',
          },
        },
      },
      animation: {
        'slide-fade-in': 'slide-fade-in 150ms ease-out both',
        'bounce-dot': 'bounce-dot 1.2s infinite ease-in-out',
        'bounce-dot-delay-1': 'bounce-dot 1.2s infinite ease-in-out 150ms',
        'bounce-dot-delay-2': 'bounce-dot 1.2s infinite ease-in-out 300ms',
      },
    },
  },
  plugins: [],
}
