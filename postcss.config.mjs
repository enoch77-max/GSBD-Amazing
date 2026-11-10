/**
 * PostCSS pipeline.
 *
 * Next.js compiles Tailwind through `@tailwindcss/postcss`. The Vite preview
 * build already runs Tailwind through `@tailwindcss/vite` (see vite.config.ts),
 * so PostCSS is left empty there to avoid processing the stylesheet twice.
 */
const isVite = process.argv.some((arg) => /(^|[/\\])vite(\.[a-z]+)?$/.test(arg));

const postcssConfig = {
  plugins: isVite ? {} : { "@tailwindcss/postcss": {} },
};

export default postcssConfig;
