'use strict';

const express = require('express');
const { fetchLatestPost } = require('../services/ghostService');

const router = express.Router();

/**
 * GET /api/latest-post
 *
 * Returns the latest published post from Ghost CMS.
 * Response format:
 * {
 *   "success": true,
 *   "post": { ...postFields }
 * }
 *
 * On error:
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 */
router.get('/', async (req, res) => {
  console.log('[LatestPost] GET /api/latest-post called');

  try {
    const post = await fetchLatestPost();

    return res.json({
      success: true,
      post: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        feature_image: post.feature_image,
        published_at: post.published_at,
        url: post.url,
        reading_time: post.reading_time,
      },
    });
  } catch (err) {
    console.error('[LatestPost] Error fetching latest post:', err.message);

    return res.status(503).json({
      success: false,
      error: err.message || 'Ghost CMS is temporarily unavailable. Please try again later.',
    });
  }
});

module.exports = router;