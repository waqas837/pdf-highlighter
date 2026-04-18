/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        gray: {
          950: "#0a0a0a",
        },
      },
      animation: {
        typing: "typing 3.5s steps(40, end)",
        blink: "blink-caret .75s step-end infinite",
      },
    },
  },
  plugins: [],
};
