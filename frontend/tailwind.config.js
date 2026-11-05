/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          deep: '#3A0A0F',
          accent: '#5B0F1B',
          light: '#7A1B28',
          subtle: '#8B2635',
          50: '#FAF4F2',
          100: '#F5E8E5',
          200: '#EAD8C0',
          300: '#D6BEA0',
          400: '#9C3848',
          500: '#5B0F1B',
          600: '#4A0D16',
          700: '#3A0A0F',
          800: '#2D070B',
          900: '#1F0508',
          950: '#140305',
        },
        beige: {
          DEFAULT: '#EAD8C0',
          50: '#FAF6F0',
          100: '#F5EDE1',
          200: '#EAD8C0',
          300: '#DFC9AF',
          400: '#D0B596',
          500: '#BFA07E',
        },
        cream: {
          DEFAULT: '#FDF6EC',
          50: '#FFFCF7',
          100: '#FDF6EC',
          200: '#F7EBDC',
          300: '#EEDCC7',
        },
        offwhite: {
          DEFAULT: '#F8EFE6',
          50: '#FCF8F4',
          100: '#F8EFE6',
          200: '#F0E3D5',
        },
        brand: {
          50: '#FAF4F2',
          100: '#F5E8E5',
          200: '#EAD8C0',
          300: '#DFC9AF',
          400: '#7A1B28',
          500: '#5B0F1B', // Accent Maroon
          600: '#4A0D16',
          700: '#3A0A0F', // Deep Maroon
          800: '#2D070B',
          900: '#1F0508',
          950: '#140305',
        },
        primary: {
          50: '#FAF4F2',
          100: '#F5E8E5',
          200: '#EAD8C0',
          300: '#DFC9AF',
          400: '#7A1B28',
          500: '#5B0F1B',
          600: '#4A0D16',
          700: '#3A0A0F',
          800: '#2D070B',
          900: '#1F0508',
          950: '#140305',
        },
        surface: {
          50: '#FCF8F4',
          100: '#F8EFE6',
          200: '#FDF6EC',
          300: '#EAD8C0',
          800: '#2D070B',
          900: '#3A0A0F',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
