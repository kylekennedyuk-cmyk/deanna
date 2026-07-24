/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs', './src/**/*.js', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f3f6fa',
          100: '#e4ebf3',
          200: '#c9d7e6',
          300: '#9fb6ce',
          400: '#6f91b2',
          500: '#4f7396',
          600: '#3d5b79',
          700: '#334a63',
          800: '#2c3f54',
          900: '#1a2b40',
          950: '#0f1a28',
        },
        secondary: {
          50: '#fbf7ee',
          100: '#f5ebd3',
          200: '#ead5a4',
          300: '#debc72',
          400: '#d1a24a',
          500: '#c08b34',
          600: '#a56e2a',
          700: '#845425',
          800: '#6d4424',
          900: '#5b3921',
        },
        accent: {
          50: '#f4faf9',
          100: '#d9efec',
          200: '#b5ddd8',
          300: '#87c5bf',
          400: '#5aa8a1',
          500: '#3f8b85',
          600: '#32706c',
          700: '#2c5b58',
          blush: '#f3d6de',
          soft: '#e8a0b8',
        },
        ivory: '#fbf8f3',
        blush: '#f8efe8',
        success: {
          50: '#f0faf4',
          100: '#dcf5e6',
          700: '#1f7a4d',
        },
        warning: {
          50: '#fff8eb',
          100: '#feecc7',
          700: '#9a6700',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Outfit', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['3.75rem', { lineHeight: '1.12', letterSpacing: '-0.025em' }],
        'display-lg': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        'display-sm': ['1.75rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(15, 26, 40, 0.06)',
        card: '0 12px 40px rgba(15, 26, 40, 0.08)',
        lift: '0 18px 50px rgba(15, 26, 40, 0.12)',
        gold: '0 10px 30px rgba(192, 139, 52, 0.18)',
        focus: '0 0 0 3px rgba(209, 162, 74, 0.35)',
        inset: 'inset 0 1px 2px rgba(15, 26, 40, 0.04)',
      },
      borderRadius: {
        card: '1.125rem',
        '2.5xl': '1.25rem',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
      },
      transitionDuration: {
        250: '250ms',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        fadeUp: 'fadeUp 0.45s ease-out both',
        toastIn: 'toastIn 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
