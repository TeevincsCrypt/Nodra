import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Near-black surfaces, darkest to lightest.
        base: '#050608',
        surface: '#080A0D',
        card: '#0B0F14',
        raised: '#101620',
        // Creditcoin-style blue: the single accent that carries the product.
        blue: {
          300: '#8CC0FF',
          400: '#5AA2FF',
          500: '#2E7CF6',
          600: '#1D5FD0',
          700: '#14459B',
        },
        ok: '#2ED47A',
        warn: '#E8B44A',
        danger: '#F45B5B',
        ink: {
          primary: '#E8ECF2',
          secondary: '#98A5B8',
          muted: '#5E6B7E',
          faint: '#3A4553',
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          strong: 'rgba(255,255,255,0.12)',
          blue: 'rgba(46,124,246,0.28)',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.6), 0 8px 24px -12px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(46,124,246,0.3), 0 0 28px -6px rgba(46,124,246,0.45)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' },
        },
        'flow-x': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '15%, 85%': { opacity: '1' },
          '100%': { transform: 'translateX(400%)', opacity: '0' },
        },
        'flow-y': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '15%, 85%': { opacity: '1' },
          '100%': { transform: 'translateY(400%)', opacity: '0' },
        },
        'rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2.4s ease-in-out infinite',
        'flow-x': 'flow-x 3.2s cubic-bezier(0.4,0,0.2,1) infinite',
        'flow-y': 'flow-y 3.2s cubic-bezier(0.4,0,0.2,1) infinite',
        rise: 'rise 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
