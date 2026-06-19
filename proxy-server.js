const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const RSS_URL = 'https://blog.ybyracasting.com/rss/';

// Cache simples em memória (5 minutos)
let cachedRSS = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

app.use(cors());

app.get('/rss', (req, res) => {
  const now = Date.now();
  
  // Retorna cache se ainda válido
  if (cachedRSS && (now - cacheTime) < CACHE_DURATION) {
    console.log('[RSS Proxy] Usando cache');
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(cachedRSS);
  }

  console.log('[RSS Proxy] Buscando RSS externo:', RSS_URL);
  
  https.get(RSS_URL, (rssRes) => {
    let data = '';
    
    rssRes.on('data', (chunk) => {
      data += chunk;
    });
    
    rssRes.on('end', () => {
      // Atualiza cache
      cachedRSS = data;
      cacheTime = now;
      
      console.log('[RSS Proxy] RSS recebido com sucesso, tamanho:', data.length);
      
      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.send(data);
    });
  }).on('error', (err) => {
    console.error('[RSS Proxy] Erro ao buscar RSS:', err.message);
    
    // Se tiver cache, retorna mesmo expirado
    if (cachedRSS) {
      console.log('[RSS Proxy] Retornando cache expirado devido a erro');
      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      return res.send(cachedRSS);
    }
    
    res.status(502).json({ 
      error: 'Não foi possível buscar o RSS',
      message: err.message 
    });
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    cached: !!cachedRSS,
    cacheAge: cachedRSS ? (Date.now() - cacheTime) / 1000 : 0
  });
});

app.listen(PORT, () => {
  console.log(`[RSS Proxy] Servidor rodando na porta ${PORT}`);
  console.log(`[RSS Proxy] Endpoint: http://localhost:${PORT}/rss`);
});
