import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works at a domain root (Netlify, Vercel,
  // Cloudflare Pages) and under a sub-path (GitHub Pages: /my-app/) alike.
  base: './',
});
