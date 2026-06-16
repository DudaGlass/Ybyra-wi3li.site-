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
 * Retry configuration for Ghost API calls
 */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

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
 * Sleep helper for retry delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches the latest published post from Ghost CMS via the Content API.
 * Uses query parameters: limit=1&order=published_at%20DESC&fields=...
 * Includes automatic retry logic for transient failures.
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
  const fields =
    'title,slug,excerpt,feature_image,published_at,url,reading_time';
  const url = `${ghostUrl.replace(/\/+$/, '')}/ghost/api/content/posts/?limit=1&order=published_at%20DESC&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

  console.log(`[GhostService] Fetching latest post from Ghost CMS: ${ghostUrl}`);

  let lastError = null;
  
  // Retry loop for transient failures
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[GhostService] Retry attempt ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Accept-Version': 'v5.0',
        },
      }, 10000); // 10 second timeout

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(
          `[GhostService] Ghost API returned status ${response.status}: ${errorText}`
        );
        
        // Only retry on 5xx errors (server errors), not 4xx (client errors)
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`Ghost API responded with status ${response.status}: ${errorText}`);
          continue;
        }
        
        // If cache exists, return stale data instead of failing completely
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
        if (attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        if (cache.data) {
          console.warn('[GhostService] Returning stale cached data due to parse error');
          return cache.data;
        }
        throw new Error(`Failed to parse Ghost API response: ${err.message}`);
      }

      // Validate response structure
      if (!data || !data.posts || !Array.isArray(data.posts) || data.posts.length === 0) {
        console.warn('[GhostService] Ghost API returned no posts');
        if (attempt < MAX_RETRIES) {
          lastError = new Error('No published posts found in Ghost CMS');
          continue;
        }
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

      console.log(`[GhostService] Successfully fetched latest post: "${result.title}" (slug: ${result.slug}, published: ${result.published_at})`);
      return result;
      
    } catch (err) {
      console.error(`[GhostService] Attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      lastError = err;
      // Continue to retry if we have attempts left
      if (attempt < MAX_RETRIES) continue;
    }
  }

  // All retries exhausted
  console.error('[GhostService] All retry attempts exhausted');
  
  // If cache exists, return stale data instead of failing completely
  if (cache.data) {
    console.warn('[GhostService] Returning stale cached data after retries exhausted');
    return cache.data;
  }
  
  throw lastError || new Error('Failed to reach Ghost CMS after retries');
}

/**
 * Invalidates the cache so the next request fetches fresh data.
 */
function invalidateCache() {
  cache = { data: null, timestamp: 0 };
  console.log('[GhostService] Cache invalidated');
}

/**
 * Get current cache info (for debugging)
 */
function getCacheInfo() {
  return {
    hasData: cache.data !== null,
    cachedTitle: cache.data ? cache.data.title : null,
    cachedAt: cache.timestamp ? new Date(cache.timestamp).toISOString() : null,
    cachedSlug: cache.data ? cache.data.slug : null,
    age: cache.timestamp ? Math.floor((Date.now() - cache.timestamp) / 1000) + 's' : null,
  };
}

module.exports = { fetchLatestPost, invalidateCache, getCacheInfo };