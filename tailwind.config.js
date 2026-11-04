/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        secure: {
          bg: "#060A17",
          sidebar: "#0B132B",
          card: "#111C35",
          elevated: "#172440",
          border: "#1E2C4F",
          primary: "#2563EB",
          accent: "#38BDF8",
          text: "#F8FAFC",
          muted: "#94A3B8",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
        navy: {
          950: "#060A17",
          900: "#0B132B",
          850: "#111C35",
          800: "#172440",
          700: "#27355B",
          600: "#3A506B",
        },
      },
    },
  },
  plugins: [],
};
