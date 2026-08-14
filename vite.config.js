import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos deixam o build funcionar em /stemlab/ no GitHub Pages
  // e também em qualquer outro subdiretório no futuro.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets'
  }
});
