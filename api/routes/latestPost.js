'use strict';

const express = require('express');
const { fetchLatestPost } = require('../services/ghostClient');

const router = express.Router();

/**
 * GET /api/latest-post
 *
 * Retorna o post mais recente do Ghost CMS.
 *
 * Resposta de sucesso (200):
 * {
 *   "success": true,
 *   "post": {
 *     "title": "string",
 *     "slug": "string",
 *     "excerpt": "string",
 *     "feature_image": "string|null",
 *     "published_at": "string|null",
 *     "url": "string",
 *     "reading_time": "number"
 *   }
 * }
 *
 * Resposta de erro (503):
 * {
 *   "success": false,
 *   "error": "string"
 * }
 */
router.get('/', async (_req, res) => {
  try {
    const post = await fetchLatestPost();

    res.json({
      success: true,
      post,
    });
  } catch (err) {
    console.error('[LatestPost] Error:', err.message);

    res.status(503).json({
      success: false,
      error: err.message || 'Ghost CMS is temporarily unavailable.',
    });
  }
});

module.exports = router;