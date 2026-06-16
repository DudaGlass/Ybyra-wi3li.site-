'use strict';

const express = require('express');
const path = require('path');

// Load environment variables from .env file if present
const envPath = path.resolve(__dirname, '.env');
try {
  require('fs').accessSync(envPath, require('fs').constants.R_OK);
  // .env exists, but we don't use dotenv package — environment variables
  // should be set by Docker or the host environment.
  console.log('[Server] .env file detected — ensure variables are set in the environment.');
} catch {
  console.log('[Server] No .env file found — using environment variables from host/Docker.');
}

const latestPostRouter = require('./routes/latestPost');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// --- Middleware ---

// Trust proxy if behind Nginx/Cloudflare
app.set('trust proxy', 1);

// Parse JSON bodies (though we don't expect any for this simple API)
app.use(express.json());

// CORS headers — allow requests from any origin (the main website)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

// --- Routes ---

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount the latest-post route
app.use('/api/latest-post', latestPostRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message || err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// --- Start ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Ybyra Casting API is running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/latest-post`);
});