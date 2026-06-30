import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import type { ViteDevServer } from 'vite';

function apiProxyPlugin() {
  return {
    name: 'local-api-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost');
          const target = requestUrl.searchParams.get('target');

          if (!target) {
            res.statusCode = 400;
            res.end('缺少 target 参数');
            return;
          }

          const response = await fetch(target, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': '*/*',
            },
          });
          const text = await response.text();

          res.statusCode = response.status;
          res.setHeader('Content-Type', response.headers.get('content-type') ?? 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(text);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(error instanceof Error ? error.message : '代理请求失败');
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/state': 'http://127.0.0.1:5175',
      '/api/config': 'http://127.0.0.1:5175',
      '/api/admin': 'http://127.0.0.1:5175',
      '/api/redeem': 'http://127.0.0.1:5175',
      '/api/records': 'http://127.0.0.1:5175',
      '/api/tasks': 'http://127.0.0.1:5175',
      '/api/issues': 'http://127.0.0.1:5175',
    },
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    apiProxyPlugin(),
    tsconfigPaths()
  ],
})
