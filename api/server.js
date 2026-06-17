'use strict';

const express = require('express');
const path = require('path');

// Tenta carregar .env (falha silenciosamente se não existir)
try {
  require('fs').accessSync(path.resolve(__dirname, '.env'), require('fs').constants.R_OK);
  console.log('[Server] .env file detected');
} catch {
  console.log('[Server] No .env file — using environment variables');
}

const latestPostRouter = require('./routes/latestPost');
const { invalidateCache, getCacheInfo } = require('./services/ghostClient');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── Middleware ─────────────────────────────────────────────────────

// Trust proxy (Nginx/Cloudflare)
app.set('trust proxy', 1);

app.use(express.json());

// CORS — permite requisições de qualquer origem
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
  if (_req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Logging básico
app.use((req, _res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

// ─── Rotas ─────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: getCacheInfo(),
  });
});

// Invalidação manual de cache
app.post('/api/cache/invalidate', (_req, res) => {
  invalidateCache();
  res.json({ success: true, message: 'Cache invalidated', cache: getCacheInfo() });
});

// Informações do cache
app.get('/api/cache/info', (_req, res) => {
  res.json({ success: true, cache: getCacheInfo() });
});

// Post mais recente do blog
app.use('/api/latest-post', latestPostRouter);

// ─── Error handling ────────────────────────────────────────────────

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler global
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message || err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Ybyra Casting API running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/latest-post`);
  console.log(`  GET  /api/cache/info`);
  console.log(`  POST /api/cache/invalidate`);
});