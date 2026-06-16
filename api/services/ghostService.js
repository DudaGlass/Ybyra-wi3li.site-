'use strict';

const fetch = require('node-fetch');

/**
 * In-memory cache for the latest post response.
 * Stores { data, timestamp } to avoid hitting Ghost on every request.
 */
let cache = {
  data: null,
  timestamp: 0,
};

/**
 * Creates an AbortController-based fetch with timeout.
 * Falls back to the legacy timeout option for older node-fetch versions.
 */
async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Fetches the latest published post from Ghost CMS via the Content API.
 * Uses query parameters: limit=1&order=published_at%20DESC&fields=...
 *
 * @returns {Promise<Object>} The latest post object with selected fields.
 */
async function fetchLatestPost() {
  const ghostUrl = process.env.GHOST_URL;
  const apiKey = process.env.GHOST_CONTENT_API_KEY;
  const cacheTtl = parseInt(process.env.CACHE_TTL, 10) || 300; // default 5 minutes

  // Validate required environment variables
  if (!ghostUrl || !apiKey) {
    throw new Error(
      'Missing required environment variables: GHOST_URL and GHOST_CONTENT_API_KEY must be set.'
    );
  }

  // Check cache freshness
  const now = Date.now();
  if (cache.data && now - cache.timestamp < cacheTtl * 1000) {
    console.log('[GhostService] Returning cached post data');
    return cache.data;
  }

  // Build the Ghost Content API URL
  // Optimized: only fetch 1 post, ordered by most recent
  const fields =
    'title,slug,excerpt,feature_image,published_at,url,reading_time';
  const url = `${ghostUrl.replace(/\/+$/, '')}/ghost/api/content/posts/?limit=1&order=published_at%20DESC&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

  console.log(`[GhostService] Fetching latest post from Ghost CMS: ${ghostUrl}`);

  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept-Version': 'v5.0',
      },
    }, 10000); // 10 second timeout
  } catch (err) {
    console.error('[GhostService] Network error while fetching from Ghost:', err.message);
    // If cache exists, return stale data instead of failing completely
    if (cache.data) {
      console.warn('[GhostService] Returning stale cached data due to network error');
      return cache.data;
    }
    throw new Error(`Failed to reach Ghost CMS: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(
      `[GhostService] Ghost API returned status ${response.status}: ${errorText}`
    );
    // If cache exists, return stale data
    if (cache.data) {
      console.warn('[GhostService] Returning stale cached data due to API error');
      return cache.data;
    }
    throw new Error(
      `Ghost API responded with status ${response.status}: ${errorText}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    console.error('[GhostService] Failed to parse Ghost API response JSON:', err.message);
    if (cache.data) {
      console.warn('[GhostService] Returning stale cached data due to parse error');
      return cache.data;
    }
    throw new Error(`Failed to parse Ghost API response: ${err.message}`);
  }

  // Validate response structure
  if (!data || !data.posts || !Array.isArray(data.posts) || data.posts.length === 0) {
    console.warn('[GhostService] Ghost API returned no posts');
    if (cache.data) {
      console.warn('[GhostService] Returning stale cached data (no posts returned)');
      return cache.data;
    }
    throw new Error('No published posts found in Ghost CMS');
  }

  const post = data.posts[0];

  // Build the response object with only the required fields
  const result = {
    title: post.title || '',
    slug: post.slug || '',
    excerpt: post.excerpt || '',
    feature_image: post.feature_image || null,
    published_at: post.published_at || null,
    url: post.url || '',
    reading_time: typeof post.reading_time === 'number' ? post.reading_time : 0,
  };

  // Update cache
  cache = {
    data: result,
    timestamp: Date.now(),
  };

  console.log(`[GhostService] Successfully fetched latest post: "${result.title}" (slug: ${result.slug})`);
  return result;
}

/**
 * Invalidates the cache so the next request fetches fresh data.
 */
function invalidateCache() {
  cache = { data: null, timestamp: 0 };
  console.log('[GhostService] Cache invalidated');
}

module.exports = { fetchLatestPost, invalidateCache };