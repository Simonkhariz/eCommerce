import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// next/core-web-vitals rules, including the React Compiler checks that come with
// eslint-config-next 16 (`next lint` was removed in Next.js 16; `npm run lint` runs ESLint).
export default defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'backend/**', 'public/**', 'design/**', 'docs/**']),
]);
