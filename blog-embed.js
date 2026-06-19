/**
 * blog-embed.js
 *
 * Busca o post mais recente do blog diretamente do RSS nativo do Ghost CMS.
 * Sem backend Node.js, sem API intermediária.
 *
 * Fluxo:
 *   1. Tenta fetch('/rss/') via nginx proxy → Ghost → RSS XML
 *   2. Se OK → parseia XML com DOMParser → extrai dados → renderiza → atualiza cache
 *   3. Se falha → tenta cache localStorage
 *   4. Se cache vazio → tenta data/blog-fallback.json
 *   5. Se tudo falhar → renderiza card estático "Visite nosso blog"
 *
 * O fallback NUNCA sobrescreve o cache em localStorage.
 * O cache só é atualizado com dados da requisição bem-sucedida ao RSS.
 *
 * Versão: 2026-06-17 (RSS Native)
 */
(function () {
  'use strict';

  // ─── Configurações ───────────────────────────────────────────────
  var RSS_URL_PROXY = '/rss/'; // Proxy nginx direto para RSS externo
  var RSS_URL_PROXY_NODE = '/rss-proxy/'; // Proxy Node.js (fallback)
  var RSS_URL_DIRECT = 'https://blog.ybyracasting.com/rss/'; // Direto (último recurso)
  var CACHE_KEY = 'ybyra_latest_post_v2';
  var FETCH_TIMEOUT = 15000; // 15s

  // ─── DOM helpers ─────────────────────────────────────────────────
  function root() {
    return document.getElementById('blog-featured-root');
  }

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
    } catch (_) {
      return null;
    }
  }

  function setCached(payload) {
    try {
      if (!payload || !payload.title || payload.title.length === 0) return;

      // Não sobrescreve cache com dados mais antigos
      var existing = getCached();
      if (
        existing &&
        existing.payload &&
        existing.payload.published_at &&
        payload.published_at
      ) {
        var existingDate = new Date(existing.payload.published_at).getTime();
        var newDate = new Date(payload.published_at).getTime();
        if (
          !isNaN(existingDate) &&
          !isNaN(newDate) &&
          existingDate >= newDate
        ) {
          log(
            'cache',
            '(ignorado - cache existente é mais recente)',
            existing.payload.published_at,
            'cache_mais_recente'
          );
          return;
        }
      }

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), payload: payload })
      );
      log('cache_atualizado', payload.title, payload.published_at, 'ok');
    } catch (_) {
      /* quota exceeded */
    }
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
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch (_) {
      return iso || '';
    }
  }

  // ─── Fetch com timeout ────────────────────────────────────────────
  function fetchWithTimeout(url, ms) {
    ms = ms || FETCH_TIMEOUT;
    var controller = new AbortController();
    var id = setTimeout(function () {
      controller.abort();
    }, ms);
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

  // ─── Parser de RSS ───────────────────────────────────────────────
  /**
   * Parseia XML RSS do Ghost e extrai o primeiro post.
   *
   * Estrutura esperada do RSS do Ghost:
   * <rss>
   *   <channel>
   *     <item>
   *       <title>Título</title>
   *       <link>https://...</link>
   *       <description>Excerpt em HTML</description>
   *       <pubDate>RFC 2822 date</pubDate>
   *       <enclosure url="https://..." type="image/..." />
   *       <dc:creator>Autor</dc:creator>
   *     </item>
   *   </channel>
   * </rss>
   */
  function parseRssToPost(xmlText) {
    var parser = new DOMParser();
    var xml = parser.parseFromString(xmlText, 'text/xml');

    // Verifica erro de parse
    var parseError = xml.querySelector('parsererror');
    if (parseError) {
      throw new Error('Falha ao parsear RSS XML: ' + parseError.textContent);
    }

    var item = xml.querySelector('channel > item');
    if (!item) {
      throw new Error('Nenhum item encontrado no RSS');
    }

    function getNodeText(node) {
      return node ? node.textContent || '' : '';
    }

    // Título
    var title = getNodeText(item.querySelector('title'));

    // Link
    var link = getNodeText(item.querySelector('link'));

    // Description (excerpt em HTML)
    var description = getNodeText(item.querySelector('description'));

    // Data de publicação (RFC 2822 → ISO)
    var pubDateRaw = getNodeText(item.querySelector('pubDate'));
    var published_at = pubDateRaw
      ? new Date(pubDateRaw).toISOString()
      : null;

    // Imagem destacada via <enclosure>
    var enclosureEl = item.querySelector('enclosure');
    var feature_image = null;
    if (enclosureEl) {
      var url = enclosureEl.getAttribute('url');
      var type = enclosureEl.getAttribute('type') || '';
      // Só aceita se for imagem
      if (url && type.indexOf('image/') === 0) {
        feature_image = url;
      }
    }

    // Slug extraído do link (último segmento da URL)
    var slug = '';
    try {
      var urlParts = link.split('/').filter(Boolean);
      slug = urlParts[urlParts.length - 1] || '';
    } catch (_) {
      slug = '';
    }

    return {
      title: title,
      slug: slug,
      excerpt: truncate(stripHtml(description), 260),
      feature_image: feature_image,
      published_at: published_at,
      url: link,
      reading_time: 0 // RSS não fornece tempo de leitura
    };
  }

  // ─── Fallback local (blog-fallback.json) ─────────────────────────
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
            excerpt:
              post.excerpt?.rendered || post.excerpt || '',
            feature_image:
              post.feature_image ||
              (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) ||
              null,
            url: post.link || post.url || 'https://blog.ybyracasting.com',
            published_at: post.date || post.published_at || null,
            reading_time: 0,
            slug: post.slug || ''
          };
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  // ─── Render ──────────────────────────────────────────────────────
  function buildCard(post) {
    var container = document.createElement('article');
    container.className = 'blog-featured loaded';

    var imgUrl = post.feature_image || '';
    if (imgUrl) {
      container.style.setProperty(
        '--featured-image',
        "url('" + imgUrl.replace(/'/g, '%27') + "')"
      );
      container.classList.add('has-featured-image');
    }

    var copy = document.createElement('div');
    copy.className = 'featured-copy';

    var tag = document.createElement('span');
    tag.className = 'featured-tag';
    tag.textContent = 'Notícias';

    var h3 = document.createElement('h3');
    h3.textContent = stripHtml(post.title || '');

    var excerpt = document.createElement('p');
    excerpt.textContent = post.excerpt || '';

    var meta = document.createElement('div');
    meta.className = 'featured-meta';
    var dateStr = post.published_at
      ? formatDate(post.published_at)
      : '';
    // reading_time não está disponível no RSS — omitido

    if (dateStr) {
      meta.textContent = dateStr;
    }

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
    p.textContent =
      'Fique por dentro das novidades do Ybyrá Casting. Acesse nosso blog para conferir artigos, notícias e conteúdos exclusivos do setor audiovisual.';

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

  // ─── Fetch RSS principal ─────────────────────────────────────────
  var isFetching = false;

  function fetchAndRender(silent) {
    if (isFetching) {
      log('fetch', '(ignorado - já buscando)', null, 'duplicado');
      return;
    }
    isFetching = true;

    // Tenta primeiro o proxy nginx direto
    fetchWithTimeout(RSS_URL_PROXY, FETCH_TIMEOUT)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (xmlText) {
        var post = parseRssToPost(xmlText);
        log('rss_proxy_nginx', post.title, post.published_at, '200');

        // Atualiza cache apenas com dados do RSS (nunca com fallback)
        setCached(post);

        // Renderiza
        var el = buildCard(post);
        var r = root();
        if (r) {
          r.innerHTML = '';
          r.appendChild(el);
        }
        isFetching = false;
      })
      .catch(function (nginxErr) {
        log('rss_proxy_nginx_falha', nginxErr.message, null, 'tentando_proxy_node');

        // Se proxy nginx falhar, tenta proxy Node.js
        fetchWithTimeout(RSS_URL_PROXY_NODE, FETCH_TIMEOUT)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          })
          .then(function (xmlText) {
            var post = parseRssToPost(xmlText);
            log('rss_proxy_node', post.title, post.published_at, '200');

            // Atualiza cache apenas com dados do RSS (nunca com fallback)
            setCached(post);

            // Renderiza
            var el = buildCard(post);
            var r = root();
            if (r) {
              r.innerHTML = '';
              r.appendChild(el);
            }
            isFetching = false;
          })
          .catch(function (nodeErr) {
            log('rss_proxy_node_falha', nodeErr.message, null, 'tentando_direto');

            // Se proxy Node.js falhar, tenta fetch direto (pode falhar por CORS)
            fetchWithTimeout(RSS_URL_DIRECT, FETCH_TIMEOUT)
              .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
              })
              .then(function (xmlText) {
                var post = parseRssToPost(xmlText);
                log('rss_direto', post.title, post.published_at, '200');

                // Atualiza cache apenas com dados do RSS (nunca com fallback)
                setCached(post);

                // Renderiza
                var el = buildCard(post);
                var r = root();
                if (r) {
                  r.innerHTML = '';
                  r.appendChild(el);
                }
                isFetching = false;
              })
              .catch(function (directErr) {
                log('rss_direto_falha', directErr.message, null, 'buscando_cache');

                // Tenta cache localStorage primeiro
                var cached = getCached();
                if (cached && cached.payload) {
                  log(
                    'cache',
                    cached.payload.title,
                    cached.payload.published_at,
                    'usando_cache'
                  );
                  var el = buildCard(cached.payload);
                  var r = root();
                  if (r) {
                    r.innerHTML = '';
                    r.appendChild(el);
                  }
                  isFetching = false;
                  return;
                }

                // Se não tem cache, tenta fallback local
                loadLocalFallback()
                  .then(function (adaptedPost) {
                    var r = root();
                    if (r) {
                      if (adaptedPost) {
                        log(
                          'fallback',
                          adaptedPost.title,
                          adaptedPost.published_at,
                          'usando_fallback'
                        );
                        r.innerHTML = '';
                        r.appendChild(buildCard(adaptedPost));
                      } else {
                        log('fallback', 'Nenhum dado disponível', null, 'fallback_vazio');
                        r.innerHTML = '';
                        r.appendChild(buildFallbackStatic());
                      }
                    }
                    isFetching = false;
                  })
                  .catch(function () {
                    log('fallback', 'Erro ao carregar fallback', null, 'erro');
                    var r = root();
                    if (r) {
                      r.innerHTML = '';
                      r.appendChild(buildFallbackStatic());
                    }
                    isFetching = false;
                  });
              });
          });
      });
  }

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    var r = root();
    if (!r) return;

    // 1º: Mostra cache imediatamente se existir (evita flicker)
    var cached = getCached();
    if (cached && cached.payload) {
      log('inicial', cached.payload.title, cached.payload.published_at, 'cache');
      r.innerHTML = '';
      r.appendChild(buildCard(cached.payload));
    } else {
      log('inicial', 'Sem cache, aguardando RSS', null, 'skeleton');
    }

    // 2º: Sempre tenta refresh em background
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