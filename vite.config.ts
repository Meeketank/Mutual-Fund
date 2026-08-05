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
          const urlObj = new URL(req.url || '', 'http://localhost');
          if (urlObj.pathname === '/api/config') {
            const customPath = urlObj.searchParams.get('path');
            let configPath = customPath ? path.resolve(customPath) : path.resolve(__dirname, 'groq_config.json');
            
            if (customPath) {
              try {
                if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
                  configPath = path.join(configPath, 'groq_config.json');
                } else if (!configPath.toLowerCase().endsWith('.json')) {
                  configPath = path.join(configPath, 'groq_config.json');
                }
              } catch (e) {
                if (!configPath.toLowerCase().endsWith('.json')) {
                  configPath = path.join(configPath, 'groq_config.json');
                }
              }
            }
            
            if (req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              if (fs.existsSync(configPath)) {
                try {
                  const content = fs.readFileSync(configPath, 'utf-8');
                  const parsed = JSON.parse(content);
                  parsed.exists = true;
                  res.end(JSON.stringify(parsed));
                } catch (e) {
                  res.end(JSON.stringify({ apiKey: '', summary: '', pinnedSchemes: [], exists: false }));
                }
              } else {
                res.end(JSON.stringify({ apiKey: '', summary: '', pinnedSchemes: [], exists: false }));
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
                  let targetPath = data.path ? path.resolve(data.path) : configPath;
                  
                  if (data.path) {
                    try {
                      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                        targetPath = path.join(targetPath, 'groq_config.json');
                      } else if (!targetPath.toLowerCase().endsWith('.json')) {
                        targetPath = path.join(targetPath, 'groq_config.json');
                      }
                    } catch (e) {
                      if (!targetPath.toLowerCase().endsWith('.json')) {
                        targetPath = path.join(targetPath, 'groq_config.json');
                      }
                    }
                  }
                  
                  // Strip path from output json so it doesn't self-reference
                  const { path: _, ...configToSave } = data;
                  
                  const dir = path.dirname(targetPath);
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  
                  fs.writeFileSync(targetPath, JSON.stringify(configToSave, null, 2), 'utf-8');
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
