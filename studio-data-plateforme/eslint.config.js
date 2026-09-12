// ESLint (configuration plate) pour l'API NestJS, le front Angular et les scripts : règles recommandées de
// typescript-eslint, plus quelques garde-fous de lisibilité (pas de variables inutilisées, pas de « any » implicite).
//   npx eslint .
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/donnees/**', '**/.angular/**', 'web-classique/dist/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off'
        }
    },
    {
        files: ['**/*.mjs', '**/*.js'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                URL: 'readonly',
                fetch: 'readonly',
                document: 'readonly',
                window: 'readonly',
                setTimeout: 'readonly',
                state: 'readonly'
            }
        },
        rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] }
    }
];
