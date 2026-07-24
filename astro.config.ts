import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tv.significanthobbies.com',
  output: 'static',
  integrations: [react()],
  vite: {
    css: {
      transformer: 'lightningcss',
    },
    plugins: [tailwindcss()],
  },
});
