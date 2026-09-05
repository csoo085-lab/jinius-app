/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f3f5f8",
        surface: "#ffffff",
        surface2: "#f0f2f6",
        border: "#e2e6ed",
        borderBright: "#cfd5e0",
        ink: "#1f2530",
        inkDim: "#71798a",
        accent: "#004cd4",
        accent2: "#262f6e",
        ok: "#2f9e63",
        warn: "#d18c1f",
        danger: "#d94c4c",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
