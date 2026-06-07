// blog-featured.js
// Módulo responsável por carregar automaticamente o artigo mais relevante
// Regras: tenta WP REST API, depois RSS feed; cache em localStorage; skeleton loading

const BLOG_URL = 'https://blog.ybyracasting.com';
const CACHE_KEY = 'ybyra_blog_featured_v1';
const CACHE_TTL = 1000 * 60 * 60; // 1 hora

const root = () => document.getElementById('blog-featured-root');

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.ts) return null;
    if (Date.now() - data.ts > CACHE_TTL) return data; // still return but flagged old
    return data;
  } catch (e) { return null; }
}

function setCached(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload })); } catch (e) {}
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

function truncate(text, n = 220) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n).trim() + '…' : text;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) { return iso; }
}

function formatDateTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ts; }
}

// fetch with timeout helper
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchWP() {
  const endpoint = `${BLOG_URL.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=12&_embed`;
  if (window && window.localStorage && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] fetchWP ->', endpoint);
  const res = await fetchWithTimeout(endpoint, { cache: 'no-cache' }, 20000);
  if (!res.ok) throw new Error('WP API não disponível: ' + res.status);
  const posts = await res.json();
  if (window && window.localStorage && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] WP posts count', posts.length);
  return posts;
}

async function fetchRSS() {
  const feedUrl = `${BLOG_URL.replace(/\/$/, '')}/feed/`;
  const res = await fetchWithTimeout(feedUrl, { cache: 'no-cache' }, 20000);
  if (!res.ok) throw new Error('Feed RSS indisponível: ' + res.status);
  const txt = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(txt, 'application/xml');
  const items = Array.from(xml.querySelectorAll('item')).slice(0, 12).map(item => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const author = item.querySelector('dc\\:creator, creator')?.textContent || '';
    const enclosure = item.querySelector('enclosure')?.getAttribute('url') || null;
    return {
      title: { rendered: title },
      link,
      date: pubDate,
      excerpt: { rendered: description },
      _embedded: { 'wp:featuredmedia': enclosure ? [{ source_url: enclosure }] : [] },
      _rss: true,
      author: { name: author }
    };
  });
  return items;
}

// Try fetching via a public CORS proxy (AllOrigins). Returns Response-like object.
async function fetchViaProxy(url) {
  const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
  if (window && window.localStorage && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] fetchViaProxy ->', proxy);
  const res = await fetchWithTimeout(proxy, { cache: 'no-cache' }, 25000);
  if (!res.ok) throw new Error('Proxy indisponível: ' + res.status);
  return res;
}

function scorePost(post) {
  let score = 0;
  if (post.sticky) score += 1000;
  if (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'].length) score += 10;
  if (post._embedded && post._embedded.replies) score += (post._embedded.replies.length || 0) * 5;
  // Plugins sometimes expose view counts in meta
  if (post.meta && typeof post.meta === 'object') {
    for (const k of Object.keys(post.meta)) {
      const v = post.meta[k];
      const n = Number(v);
      if (!Number.isNaN(n)) score += Math.min(500, n);
    }
  }
  // Recent posts slightly favored
  try { score += (new Date(post.date).getTime() / 1000) % 100; } catch (e) {}
  return score;
}

function pickMostRelevant(posts) {
  if (!posts || !posts.length) return null;
  // If any sticky posts, pick the most recent sticky
  const sticky = posts.filter(p => p.sticky);
  if (sticky.length) return sticky.sort((a,b)=> new Date(b.date)-new Date(a.date))[0];
  // Otherwise compute heuristic score
  let best = posts[0];
  let bestScore = scorePost(best);
  for (const p of posts) {
    const s = scorePost(p);
    if (s > bestScore) { best = p; bestScore = s; }
  }
  // If all scores equal or zero, fallback to most recent
  return best || posts.sort((a,b)=> new Date(b.date)-new Date(a.date))[0];
}

function buildFeaturedElement(post, lastUpdated) {
  const container = document.createElement('article');
  container.className = 'blog-featured loaded';
  container.setAttribute('aria-label', post.title && (stripHtml(post.title.rendered || post.title) || 'Artigo em destaque'));

  const media = document.createElement('div');
  media.className = 'featured-media';

  const featured = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  const src = (featured && featured.source_url) || (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'].source_url) || '';
  if (src) {
    media.style.backgroundImage = `url('${src}')`;
    // add visually-hidden img for screen readers / lazy loading behavior
    const a11yImg = document.createElement('img');
    a11yImg.src = src;
    a11yImg.alt = (featured && (featured.alt_text || featured.alt)) || stripHtml(post.title && post.title.rendered) || 'Imagem do artigo';
    a11yImg.loading = 'lazy';
    a11yImg.style.position = 'absolute';
    a11yImg.style.width = '1px';
    a11yImg.style.height = '1px';
    a11yImg.style.opacity = '0';
    a11yImg.style.left = '-9999px';
    media.appendChild(a11yImg);
  }

  const overlay = document.createElement('div');
  overlay.className = 'featured-overlay';
  media.appendChild(overlay);

  const copy = document.createElement('div');
  copy.className = 'featured-copy';

  const cat = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0] && post._embedded['wp:term'][0][0] && post._embedded['wp:term'][0][0].name) || '';
  const tag = document.createElement('span');
  tag.className = 'featured-tag';
  tag.textContent = cat || 'Artigo';

  const h3 = document.createElement('h3');
  h3.innerText = stripHtml(post.title && (post.title.rendered || post.title));

  const excerpt = document.createElement('p');
  const rawExcerpt = post.excerpt ? (post.excerpt.rendered || post.excerpt) : '';
  excerpt.innerText = truncate(stripHtml(rawExcerpt), 260);

  const meta = document.createElement('div');
  meta.style.marginBottom = '0.6rem';
  meta.style.fontSize = '.85rem';
  meta.style.opacity = '0.9';
  const author = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || (post.author && (post.author.name || post.author)) || 'Equipe';
  const date = post.date ? formatDate(post.date) : '';
  meta.textContent = `${author} • ${date}`;

  // Last updated indicator (from cache/local) if available
  if (lastUpdated) {
    const lu = document.createElement('div');
    lu.style.fontSize = '.78rem';
    lu.style.opacity = '0.85';
    lu.style.marginBottom = '0.55rem';
    lu.textContent = `Última atualização: ${formatDateTime(lastUpdated)}`;
    // ensure meta info stacked with last update following
    meta.appendChild(document.createTextNode(' '));
    // we'll insert last update after meta
    // add later below
    var lastUpdateNode = lu;
  }

  const ctaWrap = document.createElement('div');
  ctaWrap.className = 'blog-cta-wrapper';
  const a = document.createElement('a');
  a.className = 'btn btn-hero blog-cta';
  a.href = post.link || (post.guid && post.guid.rendered) || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Ler artigo completo';

  ctaWrap.appendChild(a);

  copy.appendChild(tag);
  copy.appendChild(h3);
  copy.appendChild(excerpt);
  copy.appendChild(meta);
  if (typeof lastUpdateNode !== 'undefined') copy.appendChild(lastUpdateNode);
  copy.appendChild(ctaWrap);

  container.appendChild(media);
  container.appendChild(copy);

  return container;
}

function renderError(message, cachedPayload) {
  const r = root();
  if (!r) return;
  r.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'section-note';
  note.setAttribute('role','status');
  note.innerText = message || 'Conteúdo do blog indisponível no momento.';
  r.appendChild(note);
  if (cachedPayload) {
    try {
      const cachedPost = cachedPayload.payload;
      if (cachedPost) {
        const el = buildFeaturedElement(cachedPost, cachedPayload.ts);
        r.appendChild(el);
        return;
      }
    } catch (e) {}
  }
  // No cache available: render guaranteed fallback card directing to blog homepage
  const fallback = buildFallbackElement();
  r.appendChild(fallback);
}

function buildFallbackElement() {
  const container = document.createElement('article');
  container.className = 'blog-featured loaded';

  const media = document.createElement('div');
  media.className = 'featured-media';
  // gradient background as cinematic placeholder
  media.style.background = 'linear-gradient(135deg, rgba(16,14,13,0.35), rgba(143,108,88,0.1))';
  media.style.display = 'block';
  media.style.minHeight = '320px';

  const overlay = document.createElement('div');
  overlay.className = 'featured-overlay';
  media.appendChild(overlay);

  const copy = document.createElement('div');
  copy.className = 'featured-copy';

  const tag = document.createElement('span');
  tag.className = 'featured-tag';
  tag.textContent = 'Blog';

  const h3 = document.createElement('h3');
  h3.innerText = 'Visite nosso blog — notícias e artigos em destaque';

  const p = document.createElement('p');
  p.innerText = 'O conteúdo do blog está temporariamente indisponível aqui. Clique abaixo para acessar o blog ou tente atualizar a seção.';

  const meta = document.createElement('div');
  meta.style.marginBottom = '0.6rem';
  meta.style.fontSize = '.85rem';
  meta.style.opacity = '0.9';
  meta.textContent = 'Última versão local indisponível';

  const ctaWrap = document.createElement('div');
  ctaWrap.className = 'blog-cta-wrapper';

  const a = document.createElement('a');
  a.className = 'btn btn-hero blog-cta';
  a.href = BLOG_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Ir ao blog';

  const refresh = document.createElement('button');
  refresh.className = 'btn btn-outline-dark';
  refresh.style.marginLeft = '0.8rem';
  refresh.textContent = 'Atualizar';
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    refresh.textContent = 'Atualizando...';
    fetchAndUpdate(true).finally(() => { refresh.disabled = false; refresh.textContent = 'Atualizar'; });
  });

  ctaWrap.appendChild(a);
  ctaWrap.appendChild(refresh);

  copy.appendChild(tag);
  copy.appendChild(h3);
  copy.appendChild(p);
  copy.appendChild(meta);
  copy.appendChild(ctaWrap);

  container.appendChild(media);
  container.appendChild(copy);
  return container;
}

async function loadFeatured() {
  const r = root();
  if (!r) return;
  // show skeleton (already in DOM). Try cached first for instant render
  // 1) Fast local fallback (bundled JSON) so user sees content instantly
  try {
    const local = await (async function loadLocalFallback() {
      try {
        const res = await fetchWithTimeout('./data/blog-fallback.json', { cache: 'no-cache' }, 800);
        if (res.ok) {
          const j = await res.json();
          return Array.isArray(j) ? j : (j && j.length ? j : null);
        }
      } catch (e) {
        return null;
      }
      return null;
    })();
    if (local && local.length) {
      r.innerHTML = '';
      const now = Date.now();
      const el = buildFeaturedElement(local[0], now);
      r.appendChild(el);
      // cache local fallback for quicker next loads
      try { setCached(local[0]); } catch (e) {}
      // still attempt background refresh from remote sources
      fetchAndUpdate(true);
      return;
    }
  } catch (e) {
    // ignore local load errors and continue
  }

  // 2) then try cached (older but possibly more recent than local)
  const cached = getCached();
  if (cached && cached.payload) {
    try {
      r.innerHTML = '';
      const el = buildFeaturedElement(cached.payload, cached.ts);
      r.appendChild(el);
      // still try background refresh if TTL expired
      if (Date.now() - cached.ts > CACHE_TTL) {
        fetchAndUpdate(true);
      }
      return;
    } catch (e) {
      // fallthrough to fetch
    }
  }

  // 3) no local or cache found, fetch and render (may show skeleton until done)
  await fetchAndUpdate(false);
}

let fetching = false;
async function fetchAndUpdate(silent = false) {
  if (fetching) return;
  fetching = true;
  const r = root();
  try {
    let posts = null;
    try { posts = await fetchWP(); } catch (e) { if (window && localStorage.getItem('ybyra_blog_debug')) console.warn('[blog-featured] fetchWP failed', e); }
    if ((!posts || !posts.length)) {
      try { posts = await fetchRSS(); } catch (e) { if (window && localStorage.getItem('ybyra_blog_debug')) console.warn('[blog-featured] fetchRSS failed', e); }
    }
    // If still no posts, try via proxy (WP then RSS)
    if ((!posts || !posts.length)) {
      try {
        const proxied = await fetchViaProxy(`${BLOG_URL.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=12&_embed`);
        const json = await proxied.json();
        posts = json;
        if (window && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] fetched WP via proxy');
      } catch (e) {
        if (window && localStorage.getItem('ybyra_blog_debug')) console.warn('[blog-featured] proxy WP failed', e);
      }
    }
    if ((!posts || !posts.length)) {
      try {
        const proxiedRss = await fetchViaProxy(`${BLOG_URL.replace(/\/$/, '')}/feed/`);
        const txt = await proxiedRss.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(txt, 'application/xml');
        const items = Array.from(xml.querySelectorAll('item')).slice(0, 12).map(item => {
          const title = item.querySelector('title')?.textContent || '';
          const link = item.querySelector('link')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          const description = item.querySelector('description')?.textContent || '';
          const author = item.querySelector('dc\\:creator, creator')?.textContent || '';
          const enclosure = item.querySelector('enclosure')?.getAttribute('url') || null;
          return {
            title: { rendered: title },
            link,
            date: pubDate,
            excerpt: { rendered: description },
            _embedded: { 'wp:featuredmedia': enclosure ? [{ source_url: enclosure }] : [] },
            _rss: true,
            author: { name: author }
          };
        });
        posts = items;
        if (window && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] fetched RSS via proxy');
      } catch (e) {
        if (window && localStorage.getItem('ybyra_blog_debug')) console.warn('[blog-featured] proxy RSS failed', e);
      }
    }
      // If still no posts, try local fallback JSON bundled with the site
      if ((!posts || !posts.length)) {
        try {
          const localRes = await fetchWithTimeout('./data/blog-fallback.json', { cache: 'no-cache' }, 5000);
          if (localRes.ok) {
            const localJson = await localRes.json();
            if (localJson && localJson.length) {
              posts = localJson;
              if (window && localStorage.getItem('ybyra_blog_debug')) console.debug('[blog-featured] loaded local fallback JSON');
            }
          }
        } catch (e) {
          if (window && localStorage.getItem('ybyra_blog_debug')) console.warn('[blog-featured] local fallback failed', e);
        }
      }
    if (!posts || !posts.length) throw new Error('nenhum post encontrado');
    const selected = pickMostRelevant(posts);
    if (!selected) throw new Error('não foi possível determinar destaque');
    setCached(selected);
    // render
    if (r) {
      r.innerHTML = '';
      const now = Date.now();
      setCached(selected);
      const el = buildFeaturedElement(selected, now);
      r.appendChild(el);
    }
  } catch (err) {
    console.warn('blog-featured:', err);
    const cached = getCached();
    renderError('Conteúdo do blog indisponível. Mostrando versão em cache quando disponível.', cached);
  } finally { fetching = false; }
}

document.addEventListener('DOMContentLoaded', () => {
  // kick off
  loadFeatured();
});

export {};
