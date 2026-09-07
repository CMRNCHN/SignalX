import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/App.tsx"],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
