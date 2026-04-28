/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Industrial Dark" Palette
        industrial: {
          bg: '#0f172a',    // Slate 900
          card: '#1e293b',  // Slate 800
          text: '#f1f5f9',  // Slate 100
          accent: '#f97316', // Orange 500 (Safety Orange)
          success: '#22c55e', // Green 500
          danger: '#ef4444', // Red 500
          warning: '#ca8a04', // Yellow 600
        }
      }
    },
  },
  plugins: [],
}
