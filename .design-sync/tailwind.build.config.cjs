/**
 * Tailwind config used only to compile a static stylesheet for the design-sync
 * bundle (cfg.cssEntry). Content globs scan the real Kuadrat sources so exactly
 * the utility classes the components use are emitted. Mirrors the repo's own
 * tailwind.config.js theme (Inter as the sans family).
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    '/home/axgalache/projects/kuadrat/client/components/**/*.{js,jsx,mdx}',
    '/home/axgalache/projects/kuadrat/client/app/**/*.{js,jsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
