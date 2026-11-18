import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { generateSitePages } from './scripts/generate-site-pages.mjs';
import { footerNavigation, header } from './scripts/site-layout.mjs';

let siteBase = '/';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    {
      name: 'static-site-pages',
      configResolved(config) {
        siteBase = config.base;
      },
      transformIndexHtml(html) {
        return html
          .replace('<!-- site-style -->', () => `<style>${readFileSync('public/site.css', 'utf8')}</style>`)
          .replace('<!-- site-header -->', header(0, ''))
          .replace('<!-- site-footer-links -->', footerNavigation(0, ''));
      },
      configureServer(server) {
        const { base } = server.config;
        const files = generateSitePages(base);
        server.middlewares.use((request, response, next) => {
          let pathname;
          try {
            pathname = decodeURIComponent((request.url || '').split('?')[0]);
          } catch {
            return next();
          }
          if (!pathname.startsWith(base)) return next();
          const relativePath = pathname.slice(base.length);
          const key = relativePath.endsWith('/') ? `${relativePath}index.html` : relativePath;
          const directFile = files.get(key);
          if (!directFile && relativePath && files.has(`${relativePath}/index.html`)) {
            response.writeHead(308, { Location: (request.url || '').split('?')[0] + '/' });
            return response.end();
          }
          if (!directFile) return next();

          const mime = key.endsWith('.xml') ? 'application/xml' : 'text/html';
          response.setHeader('Content-Type', `${mime}; charset=utf-8`);
          response.end(directFile);
        });
      },
      generateBundle() {
        for (const [fileName, source] of generateSitePages(siteBase)) {
          this.emitFile({ type: 'asset', fileName, source });
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port: Number(process.env.PORT) || 5173,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
