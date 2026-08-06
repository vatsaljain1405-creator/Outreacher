import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Lora", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        slate: {
          50: '#FAF8F5',   // Lightest: warm cream (used for light text accents)
          100: '#F5F0EB',  // Very light warm cream  
          200: '#E8E3DC',  // Light warm border
          300: '#D8D1C5',  // Muted warm divider
          400: '#A09890',  // Muted caption text
          500: '#7A746E',  // Secondary text
          600: '#5C5854',  // Body text
          700: '#3D3B3A',  // Strong text
          800: '#2C2A29',  // Primary dark text / card border on dark
          850: '#252322',  // Table row divider (dark)
          900: '#1E1C1B',  // Card background: deep warm charcoal
          950: '#161413',  // Page background: deepest warm black
        },
        indigo: {
          50: '#F0F2EE',   // Very soft olive tint for highlights
          100: '#E1E6DD',  
          200: '#C3CDBA',
          300: '#A5B497',
          400: '#7D8E73',  // Muted sage green
          500: '#5C6B50',  // Accent: Calming moss/matcha green
          600: '#4A5640',  // Button background
          700: '#3A4332',
          800: '#2A3024',
          900: '#1A1E16',
          950: '#0F120D',
        },
        pink: {
          400: '#D4896B',  // Warm terracotta for replies
          500: '#C57D61',
          600: '#B06C51',
        },
        rose: {
          400: '#D4896B',  
          500: '#C57D61',  
          600: '#B06C51',
        },
        amber: {
          400: '#E0AA5C',  // Warm ochre/gold for schedules
          500: '#D6A65D',
        },
        emerald: {
          400: '#8FB898',  // Muted sage green for success
          500: '#6E8A75',
        }
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-up': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
        'liquid-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-up': 'scale-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'float': 'float 4s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'liquid-shimmer 2.5s infinite linear',
      },
      boxShadow: {
        'glow-indigo': '0 0 20px rgba(92, 107, 80, 0.12)',
        'glow-pink': '0 0 20px rgba(197, 125, 97, 0.12)',
        'glow-emerald': '0 0 20px rgba(110, 138, 117, 0.12)',
        'glow-amber': '0 0 20px rgba(214, 166, 93, 0.12)',
      }
    },
  },
  plugins: [],
};
export default config;
