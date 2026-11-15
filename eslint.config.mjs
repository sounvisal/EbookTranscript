import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    // Surface existing React Compiler findings during the framework upgrade.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn'
    }
  },
  globalIgnores(['.next/**', '.temp/**', 'scratch/**', 'out/**', 'build/**', 'next-env.d.ts'])
])
