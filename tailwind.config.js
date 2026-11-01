/** @type {import('tailwindcss').Config} */
module.exports = {
  // Supports running Tailwind from either workspace root or frontend/.
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./frontend/src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: []
};
