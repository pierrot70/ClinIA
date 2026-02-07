/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        secondary: "#10b981",
        background: "#f9fafb"
      },
      keyframes: {
        "time-flash": {
          "0%": { backgroundColor: "transparent", opacity: "0.6" },
          "20%": { backgroundColor: "#86efac", opacity: "1" },
          "80%": { backgroundColor: "#86efac", opacity: "1" },
          "100%": { backgroundColor: "transparent", opacity: "1" }
        }
      },
      animation: {
        "time-flash": "time-flash 1.6s ease-in-out"
      }
    }
  },
  plugins: []
};
