/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gen-primary': '#6366f1', // Indigo-500 (Modern & Scientific)
        'gen-dark': '#1e293b',    // Slate-800
      }
    },
  },
  plugins: [],
}