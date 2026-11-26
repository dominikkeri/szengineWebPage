import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A GitHub project page lives at /repository-name/; a user page lives at /.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const githubBase = repo.endsWith('.github.io') ? '/' : `/${repo}/`;

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? githubBase : '/'),
});
