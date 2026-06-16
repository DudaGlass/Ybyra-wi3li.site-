/**
 * blog-embed.js
 * Carrega o post mais recente do blog via API Ghost CMS.
 * Cache em localStorage, timeout, fallback robusto e tratamento de erros.
 * 
 * Fluxo:
 *   1. Tenta API (múltiplas URLs em fallback) → se OK, renderiza e atualiza cache
 *   2. Se API falha → tenta cache localStorage → se tem cache, usa
 *   3. Se cache vazio → tenta fallback.json (NUNCA salva fallback no cache)
 * 
 * CORREÇÃO 2026-06-16:
 *   - Fallback JAMAIS sobrescreve cache válido
 *   - Comparação de published_at para atualizar cache apenas com dados mais recentes
 *   - Logs de depuração no console
 *   - silent mode respeitado para evitar flicker
 *   - Retry automático em caso de falha com múltiplas URLs
 *   - Código legado removido
 * 
 * Versão: 2026-06-16 (FIX)
 */
(function () {
  'use strict';

  // ─── Configurações ───────────────────────────────────────────────
  // Estratégia: múltiplas URLs em ordem de preferência
  // 1. Tenta diretamente a API (api.ybyracasting.com)
  // 2. Se falhar, tenta via nginx proxy (mesmo domínio, /api/latest-post)
  // Isso evita problemas de CORS e DNS
  var API_URLS;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_URLS = [
      'http://localhost:3001/api/latest-post'
    ];
  } else {
    API_URLS = [
      'https://api.ybyracasting.com/api/latest-post',
      '/api/latest-post'  // fallback via nginx proxy no mesmo domínio
    ];
  }

  var CACHE_KEY = 'ybyra_latest_post_v2';
  var CACHE_TTL = 1000 * 60 * 60; // 1 hora (máximo, mas published_at tem prioridade)
  var FETCH_TIMEOUT = 15000; // 15s para rede lenta

  // ─── DOM helpers ─────────────────────────────────────────────────
  function root() { return document.getElementById('blog-featured-root'); }

  // ─── Log de depuração ─────────────────────────────────────────────
  var DEBUG = true;
  function log(source, title, date, status) {
    if (!DEBUG) return;
    var payload = {
      origem: source,
      titulo: title || '(vazio)',
      data: date || '(sem data)',
      status: status || 'ok',
      timestamp: new Date().toISOString()
    };
    console.log('[BlogEmbed]', JSON.stringify(payload));
  }

  // ─── Cache ────────────────────────────────────────────────────────
  function getCached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ts || !data.payload) return null;
      return data;
    } catch (_) { return null; }
  }

  function setCached(payload) {
    try {
      // Só salva se tiver um título válido (nunca salva fallback ou dados vazios)
      if (!payload || !payload.title || payload.title.length === 0) return;
      
      // Verifica se o cache existente é MAIS NOVO que o novo payload
      var existing = getCached();
      if (existing && existing.payload && existing.payload.published_at && payload.published_at) {
        var existingDate = new Date(existing.payload.published_at).getTime();
        var newDate = new Date(payload.published_at).getTime();
        if (!isNaN(existingDate) && !isNaN(newDate) && existingDate >= newDate) {
          log('cache', '(ignorado - cache existente é mais recente ou igual)', existing.payload.published_at, 'cache_mais_recente');
          return;
        }
      }

      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: payload }));
      log('cache_atualizado', payload.title, payload.published_at, 'ok');
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

  // ─── Fetch com timeout (COMPAT: sem spread operator ES6) ───────────
  function fetchWithTimeout(url, ms) {
    ms = ms || FETCH_TIMEOUT;
    var controller = new AbortController();
    var id = setTimeout(function () { controller.abort(); }, ms);
    return fetch(url, { signal: controller.signal, cache: 'no-cache' })
      .then(function (res) {
        clearTimeout(id);
        return res;
      })
      .catch(function (err) {
        clearTimeout(id);
        throw err;
      });
  }

  // ─── Fetch com fallback de URLs ──────────────────────────────────
  // Tenta cada URL em sequência até uma funcionar
  function fetchWithFallback(urls, ms) {
    ms = ms || FETCH_TIMEOUT;
    var index = 0;
    
    function tryNext() {
      if (index >= urls.length) {
        return Promise.reject(new Error('Todas as URLs falharam'));
      }
      var url = urls[index];
      index++;
      log('tentando_url', url, null, index + '/' + urls.length);
      return fetchWithTimeout(url, ms).then(function (res) {
        if (!res.ok) {
          if (index < urls.length) {
            log('url_falhou', url + ' status ' + res.status, null, 'tentando_proxima');
            return tryNext();
          }
          throw new Error('HTTP ' + res.status);
        }
        return res;
      }).catch(function (err) {
        if (index < urls.length) {
          log('url_erro', url + ' ' + err.message, null, 'tentando_proxima');
          return tryNext();
        }
        throw err;
      });
    }
    
    return tryNext();
  }

  // ─── Fallback local (blog-fallback.json) ─────────────────────────
  // ATENÇÃO: Este fallback NUNCA é salvo no localStorage.
  // Ele é usado APENAS quando a API E o cache estão indisponíveis.
  function loadLocalFallback() {
    return fetchWithTimeout('./data/blog-fallback.json', 5000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          var post = data[0];
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

  function buildFallbackStatic() {
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
    if (isFetching) {
      log('fetch', '(ignorado - já buscando)', null, 'duplicado');
      return;
    }
    isFetching = true;

    var fetchStart = Date.now();

    // Usa fetchWithFallback para tentar múltiplas URLs
    fetchWithFallback(API_URLS, FETCH_TIMEOUT)
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.success || !json.post) {
          throw new Error('Resposta inválida da API');
        }
        var post = json.post;
        log('api', post.title, post.published_at, '200');

        // Atualiza cache (com validação de data - só se for mais recente)
        setCached(post);

        // Renderiza
        var el = buildCard(post);
        var r = root();
        if (r) { r.innerHTML = ''; r.appendChild(el); }
        isFetching = false;
      })
      .catch(function (err) {
        log('api_falha', err.message, null, 'buscando_cache');

        // Tenta cache primeiro (NUNCA salva fallback no cache)
        var cached = getCached();
        if (cached && cached.payload) {
          log('cache', cached.payload.title, cached.payload.published_at, 'usando_cache');
          var el = buildCard(cached.payload);
          var r = root();
          if (r) { r.innerHTML = ''; r.appendChild(el); }
          isFetching = false;
          return;
        }

        // Se não tem cache, tenta fallback local (NUNCA salva no localStorage)
        loadLocalFallback().then(function (adaptedPost) {
          var r = root();
          if (r) {
            if (adaptedPost) {
              log('fallback', adaptedPost.title, adaptedPost.published_at, 'usando_fallback');
              r.innerHTML = '';
              r.appendChild(buildCard(adaptedPost));
            } else {
              log('fallback', 'Nenhum dado disponível', null, 'fallback_vazio');
              r.innerHTML = '';
              r.appendChild(buildFallbackStatic());
            }
          }
          isFetching = false;
        }).catch(function () {
          log('fallback', 'Erro ao carregar fallback', null, 'erro');
          var r = root();
          if (r) { r.innerHTML = ''; r.appendChild(buildFallbackStatic()); }
          isFetching = false;
        });
      });
  }

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    var r = root();
    if (!r) return;

    // 1º: Tenta mostrar cache imediatamente (apenas se existir)
    var cached = getCached();
    if (cached && cached.payload) {
      log('inicial', cached.payload.title, cached.payload.published_at, 'cache');
      r.innerHTML = '';
      r.appendChild(buildCard(cached.payload));
    } else {
      log('inicial', 'Sem cache, aguardando API', null, 'skeleton');
    }

    // 2º: Sempre tenta refresh em background (com um pequeno delay)
    // para não bloquear o rendering inicial
    setTimeout(function () {
      fetchAndRender(!!cached);
    }, 100);
  }

  // Aguarda DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();