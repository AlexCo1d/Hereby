/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Hereby brand palette (derived from the UI screenshots)
        brand: {
          DEFAULT: "#FF6B35", // primary orange (CTA / active tab)
          50: "#FFF3EE",
          100: "#FFE0D2",
          200: "#FFC1A5",
          300: "#FFA178",
          400: "#FF824B",
          500: "#FF6B35",
          600: "#E5562A",
          700: "#B33F1F",
          800: "#802C16",
          900: "#4D1A0C",
        },
        accent: {
          blue: "#4C9EEB",
          yellow: "#FFCB1F",
          purple: "#7C6CF0",
          green: "#3EC28F",
        },
        ink: {
          DEFAULT: "#111111",
          muted: "#6B6B6B",
          line: "#E5E5E5",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          soft: "#F7F7F7",
        },
      },
      fontFamily: {
        sans: ["System"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};
