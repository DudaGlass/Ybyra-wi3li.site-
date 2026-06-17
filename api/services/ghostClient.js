'use strict';

/**
 * ghostClient.js
 * 
 * Cliente para a Ghost CMS Content API.
 * Responsável apenas por buscar dados do Ghost e fazer cache em memória.
 * Sem lógica de roteamento ou resposta HTTP.
 */

const fetch = require('node-fetch');

// --- Cache em memória ---
let cacheStore = {
  data: null,
  timestamp: 0,
};

// --- Constantes ---
const DEFAULT_CACHE_TTL_S = 300; // 5 minutos
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

// --- Helpers ---

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch com timeout via AbortController.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Valida e normaliza os campos do post retornado pela API do Ghost.
 */
function normalizePost(raw) {
  return {
    title: raw.title || '',
    slug: raw.slug || '',
    excerpt: raw.excerpt || '',
    feature_image: raw.feature_image || null,
    published_at: raw.published_at || null,
    url: raw.url || '',
    reading_time: typeof raw.reading_time === 'number' ? raw.reading_time : 0,
  };
}

// --- API pública ---

/**
 * Busca o post mais recente do Ghost CMS.
 * 
 * Fluxo:
 * 1. Se cache é válido (dentro do TTL), retorna do cache.
 * 2. Caso contrário, faz requisição à API do Ghost com retry.
 * 3. Se a API falhar e existir cache expirado, retorna cache stale.
 * 4. Se tudo falhar, lança erro.
 * 
 * @returns {Promise<Object>} Post normalizado.
 */
async function fetchLatestPost() {
  const ghostUrl = process.env.GHOST_URL;
  const apiKey = process.env.GHOST_CONTENT_API_KEY;
  const cacheTtl = parseInt(process.env.CACHE_TTL, 10) || DEFAULT_CACHE_TTL_S;

  if (!ghostUrl || !apiKey) {
    throw new Error(
      'GHOST_URL and GHOST_CONTENT_API_KEY must be set in environment variables.'
    );
  }

  // --- Cache hit ---
  const now = Date.now();
  if (cacheStore.data && now - cacheStore.timestamp < cacheTtl * 1000) {
    console.log('[GhostClient] Cache hit');
    return cacheStore.data;
  }

  // --- Monta URL da API Ghost ---
  const baseUrl = ghostUrl.replace(/\/+$/, '');
  const fields = 'title,slug,excerpt,feature_image,published_at,url,reading_time';
  const apiUrl = `${baseUrl}/ghost/api/content/posts/?limit=1&order=published_at%20DESC&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

  console.log('[GhostClient] Fetching latest post from Ghost CMS');

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[GhostClient] Retry ${attempt}/${MAX_RETRIES}`);
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const response = await fetchWithTimeout(
        apiUrl,
        {
          method: 'GET',
          headers: { 'Accept-Version': 'v5.0' },
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[GhostClient] HTTP ${response.status}: ${body}`);

        // Retry apenas em 5xx
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`Ghost API HTTP ${response.status}`);
          continue;
        }

        // Se tem cache stale, retorna ele
        if (cacheStore.data) {
          console.warn('[GhostClient] Returning stale cache (API error)');
          return cacheStore.data;
        }

        throw new Error(`Ghost API responded with status ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.error('[GhostClient] JSON parse error:', parseErr.message);
        if (attempt < MAX_RETRIES) {
          lastError = parseErr;
          continue;
        }
        if (cacheStore.data) {
          console.warn('[GhostClient] Returning stale cache (parse error)');
          return cacheStore.data;
        }
        throw new Error(`Failed to parse Ghost API response: ${parseErr.message}`);
      }

      if (!data || !data.posts || !Array.isArray(data.posts) || data.posts.length === 0) {
        console.warn('[GhostClient] No posts returned');
        if (attempt < MAX_RETRIES) {
          lastError = new Error('No published posts found');
          continue;
        }
        if (cacheStore.data) {
          console.warn('[GhostClient] Returning stale cache (no posts)');
          return cacheStore.data;
        }
        throw new Error('No published posts found in Ghost CMS');
      }

      const post = normalizePost(data.posts[0]);

      // Atualiza cache
      cacheStore = { data: post, timestamp: Date.now() };

      console.log(`[GhostClient] Success: "${post.title}"`);
      return post;
    } catch (err) {
      console.error(`[GhostClient] Attempt ${attempt} failed:`, err.message);
      lastError = err;
    }
  }

  // Esgotou todas as tentativas
  if (cacheStore.data) {
    console.warn('[GhostClient] Returning stale cache (retries exhausted)');
    return cacheStore.data;
  }

  throw lastError || new Error('Failed to reach Ghost CMS');
}

/**
 * Invalida o cache forçando a próxima requisição a buscar dados novos.
 */
function invalidateCache() {
  cacheStore = { data: null, timestamp: 0 };
  console.log('[GhostClient] Cache invalidated');
}

/**
 * Retorna informações sobre o estado atual do cache.
 */
function getCacheInfo() {
  return {
    hasData: cacheStore.data !== null,
    cachedTitle: cacheStore.data ? cacheStore.data.title : null,
    cachedSlug: cacheStore.data ? cacheStore.data.slug : null,
    cachedAt: cacheStore.timestamp
      ? new Date(cacheStore.timestamp).toISOString()
      : null,
    ageSeconds: cacheStore.timestamp
      ? Math.floor((Date.now() - cacheStore.timestamp) / 1000)
      : null,
  };
}

module.exports = { fetchLatestPost, invalidateCache, getCacheInfo };