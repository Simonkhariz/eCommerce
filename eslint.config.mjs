import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Same rules as before (next/core-web-vitals); `next lint` was removed in Next.js 16.
export default defineConfig([
  ...nextVitals,
  {
    // New React Compiler checks that arrived with eslint-config-next 16. The code works as it
    // is (the compiler is not enabled); they are reported as warnings to clean up over time.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'backend/**', 'public/**', 'design/**', 'docs/**']),
]);
