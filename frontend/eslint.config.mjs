// eslint.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tscPlugin from 'eslint-plugin-tsc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
    // Mirror your .eslintignore patterns:
    {
        ignores: [
            'backend/resources/debug_info',
            '.env',
            'node_modules',
            '.pnp',
            '.pnp.js',
            '.yarn/install-state.gz',
            'coverage',
            '.next/',
            '.DS_Store',
            'npm-debug.log*',
            'yarn-debug.log*',
            '.env*.local',
            '.vercel',
            'next-env.d.ts',
            'certificates',
            'eslint.config.mjs',
            'next.config.mjs',
            'postcss.config.mjs',
            'global-setup.js',
        ],
    },
    // Extend Next.js and TypeScript shareable configs:
    ...compat.extends(
        'next/core-web-vitals',
        'next/typescript',
        'plugin:@typescript-eslint/recommended'
    ),
    // Custom TypeScript setup and rules:
    {
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            tsc: tscPlugin,
        },
        rules: {
            // Run the TS compiler and report diagnostics as ESLint errors
            'tsc/config': ['error', { configFile: './tsconfig.json' }],
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
