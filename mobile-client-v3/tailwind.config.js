/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        yt: {
          black: '#030303',
          dark: '#0f0f0f',
          player: '#212121',
          chip: 'rgba(255, 255, 255, 0.1)',
          chipActive: '#ffffff',
          red: '#FF0000',
          gray: '#aaaaaa',
          subtext: '#909090'
        }
      },
      fontFamily: {
        sans: ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif']
      }
    },
  },
  plugins: [],
}
