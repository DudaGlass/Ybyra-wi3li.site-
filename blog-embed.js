/**
 * blog-embed.js
 * Carrega o post mais recente do blog via API Ghost CMS.
 * Cache em localStorage, timeout, fallback robusto e tratamento de erros.
 * Versão: 2026-06-15
 */

(function () {
  'use strict';

  // ─── Configurações ───────────────────────────────────────────────
  var API_BASE;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE = 'http://localhost:3001';
  } else {
    API_BASE = 'https://api.ybyracasting.com';
  }

  var API_URL = API_BASE + '/api/latest-post';
  var CACHE_KEY = 'ybyra_latest_post_v2';
  var CACHE_TTL = 1000 * 60 * 60; // 1 hora
  var FETCH_TIMEOUT = 10000; // 10s (igual ao backend)

  // ─── DOM helpers ─────────────────────────────────────────────────
  function root() { return document.getElementById('blog-featured-root'); }

  // ─── Cache ────────────────────────────────────────────────────────
  function getCached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ts) return null;
      return data;
    } catch (_) { return null; }
  }

  function setCached(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: payload }));
    } catch (_) { /* quota exceeded */ }
  }

  // ─── Utilitários ─────────────────────────────────────────────────
  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
  }

  function truncate(text, n) {
    n = n || 200;
    if (!text) return '';
    return text.length > n ? text.slice(0, n).trim() + '\u2026' : text;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
    } catch (_) { return iso || ''; }
  }

  // ─── Fetch com timeout ───────────────────────────────────────────
  function fetchWithTimeout(url, opts, ms) {
    ms = ms || FETCH_TIMEOUT;
    var controller = new AbortController();
    var id = setTimeout(function () { controller.abort(); }, ms);
    return fetch(url, { signal: controller.signal, cache: 'no-cache', ...opts })
      .then(function (res) {
        clearTimeout(id);
        return res;
      })
      .catch(function (err) {
        clearTimeout(id);
        throw err;
      });
  }

  // ─── Fallback local (blog-fallback.json) ─────────────────────────
  function loadLocalFallback() {
    return fetchWithTimeout('./data/blog-fallback.json', {}, 5000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          var post = data[0];
          // Adapta formato WordPress/Ghost
          return {
            title: post.title?.rendered || post.title || '',
            excerpt: post.excerpt?.rendered || post.excerpt || '',
            feature_image: post.feature_image || (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) || null,
            url: post.link || post.url || 'https://blog.ybyracasting.com',
            published_at: post.date || post.published_at || null,
            reading_time: post.reading_time || 0,
            slug: post.slug || ''
          };
        }
        return null;
      })
      .catch(function () { return null; });
  }

  // ─── Render ──────────────────────────────────────────────────────
  function buildCard(post) {
    var container = document.createElement('article');
    container.className = 'blog-featured loaded';

    // Aplica a imagem do post como background direto no container
    // Isso sobrescreve o ::before do CSS quando há uma imagem
    var imgUrl = post.feature_image || post.feature_image_url || '';
    if (imgUrl) {
      container.style.setProperty('--featured-image', "url('" + imgUrl.replace(/'/g, '%27') + "')");
      container.classList.add('has-featured-image');
    }

    var copy = document.createElement('div');
    copy.className = 'featured-copy';

    var tag = document.createElement('span');
    tag.className = 'featured-tag';
    tag.textContent = 'Notícias';

    var h3 = document.createElement('h3');
    h3.textContent = stripHtml(post.title || post.title?.rendered || '');

    var excerpt = document.createElement('p');
    var rawExcerpt = post.excerpt || post.excerpt?.rendered || '';
    excerpt.textContent = truncate(stripHtml(rawExcerpt), 260);

    var meta = document.createElement('div');
    meta.className = 'featured-meta';
    var dateStr = post.published_at ? formatDate(post.published_at) : '';
    var readTime = post.reading_time ? post.reading_time + ' min de leitura' : '';
    meta.textContent = [dateStr, readTime].filter(Boolean).join(' • ');

    var ctaWrap = document.createElement('div');
    ctaWrap.className = 'blog-cta-wrapper';
    var link = document.createElement('a');
    link.className = 'btn btn-hero blog-cta';
    link.href = post.url || 'https://blog.ybyracasting.com';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ler artigo completo';
    ctaWrap.appendChild(link);

    copy.appendChild(tag);
    copy.appendChild(h3);
    copy.appendChild(excerpt);
    if (meta.textContent) copy.appendChild(meta);
    copy.appendChild(ctaWrap);

    container.appendChild(copy);
    return container;
  }

  function buildFallback() {
    var container = document.createElement('article');
    container.className = 'blog-featured loaded';

    var copy = document.createElement('div');
    copy.className = 'featured-copy';

    var tag = document.createElement('span');
    tag.className = 'featured-tag';
    tag.textContent = 'Blog';

    var h3 = document.createElement('h3');
    h3.textContent = 'Visite nosso blog';

    var p = document.createElement('p');
    p.textContent = 'Fique por dentro das novidades do Ybyrá Casting. Acesse nosso blog para conferir artigos, notícias e conteúdos exclusivos do setor audiovisual.';

    var ctaWrap = document.createElement('div');
    ctaWrap.className = 'blog-cta-wrapper';
    var link = document.createElement('a');
    link.className = 'btn btn-hero blog-cta';
    link.href = 'https://blog.ybyracasting.com';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ir ao blog';
    ctaWrap.appendChild(link);

    copy.appendChild(tag);
    copy.appendChild(h3);
    copy.appendChild(p);
    copy.appendChild(ctaWrap);

    container.appendChild(copy);
    return container;
  }

  // ─── API fetch principal ─────────────────────────────────────────
  var isFetching = false;

  function fetchAndRender(silent) {
    if (isFetching) return;
    isFetching = true;

    fetchWithTimeout(API_URL, {}, FETCH_TIMEOUT)
      .then(function (res) {
        if (!res.ok) throw new Error('API retornou status ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.success || !json.post) {
          throw new Error('Resposta inválida da API');
        }
        var post = json.post;
        setCached(post);
        var el = buildCard(post);
        var r = root();
        if (r) { r.innerHTML = ''; r.appendChild(el); }
      })
      .catch(function (err) {
        // Tenta cache
        var cached = getCached();
        if (cached && cached.payload) {
          var el = buildCard(cached.payload);
          var r = root();
          if (r) { r.innerHTML = ''; r.appendChild(el); }
          isFetching = false;
          return;
        }

        // Tenta fallback local
        loadLocalFallback().then(function (adaptedPost) {
          var r = root();
          if (r) {
            if (adaptedPost) {
              setCached(adaptedPost);
              r.innerHTML = '';
              r.appendChild(buildCard(adaptedPost));
            } else {
              r.innerHTML = '';
              r.appendChild(buildFallback());
            }
          }
          isFetching = false;
        }).catch(function () {
          var r = root();
          if (r) { r.innerHTML = ''; r.appendChild(buildFallback()); }
          isFetching = false;
        });
      });
  }

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    var r = root();
    if (!r) return;

    // 1º: Tenta mostrar cache imediatamente
    var cached = getCached();
    if (cached && cached.payload) {
      r.innerHTML = '';
      r.appendChild(buildCard(cached.payload));
    }

    // 2º: Sempre tenta refresh em background
    fetchAndRender(!!cached);
  }

  // Aguarda DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();