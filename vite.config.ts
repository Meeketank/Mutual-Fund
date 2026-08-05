import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'config-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/config') {
            const configPath = path.resolve(__dirname, 'groq_config.json');
            
            if (req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              if (fs.existsSync(configPath)) {
                res.end(fs.readFileSync(configPath, 'utf-8'));
              } else {
                res.end(JSON.stringify({ apiKey: '', summary: '' }));
              }
              return;
            }
            
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                } catch (e) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                }
              });
              return;
            }
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    open: true
  }
});
