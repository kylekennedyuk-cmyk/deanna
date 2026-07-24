/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f2f5f9',
          100: '#e2e9f2',
          200: '#c5d3e4',
          300: '#9bb3cd',
          400: '#6b8db0',
          500: '#4d7196',
          600: '#3c5a7b',
          700: '#324963',
          800: '#2c3e54',
          900: '#1b2a3d',
          950: '#101925',
        },
        secondary: {
          50: '#fbf8f1',
          100: '#f5edd9',
          200: '#ead9b0',
          300: '#ddc07f',
          400: '#d0a656',
          500: '#c4923d',
          600: '#ad7532',
          700: '#8a592b',
          800: '#714928',
          900: '#5e3d24',
        },
        accent: {
          400: '#e8a0b8',
          500: '#d97a9a',
          600: '#c0557a',
        },
        ivory: '#fbf8f4',
        blush: '#f7efe9',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px rgba(27, 42, 61, 0.08)',
        lift: '0 16px 40px rgba(27, 42, 61, 0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
