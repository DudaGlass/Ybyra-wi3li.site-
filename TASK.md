# PRODUCTION READY REVIEW — Ybyrá Casting

## AUDIO COMPLETA — Problemas Encontrados

### 1. CACHE (CRÍTICO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 1 | CSS sem cache busting automático | `?v=20250427-1705` manual não atualiza em deploy automático | index.html |
| 2 | blog-embed.js sem versão | `<script src="blog-embed.js">` sem `?v=...` | index.html |
| 3 | Nginx `expires 1y` para CSS/JS | Cache de 1 ano impede atualização de arquivos | nginx.conf |
| 4 | Nginx `public, immutable` para estáticos | Usuário nunca recebe nova versão sem hard refresh | nginx.conf |
| 5 | Cache do navegador vs localStorage | blog-embed.js usa localStorage com TTL de 1h, mas se API falha, dados velhos ficam 1h | blog-embed.js |

### 2. JAVASCRIPT (CRÍTICO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 6 | **script.js não existe** | `<script src="script.js">` leva a 404 | index.html:385 |
| 7 | Seletores `.btn-casting` e `.btn-produtor` nunca existem | Nenhum elemento com essas classes no HTML → fetch nunca executa | index.html:365-379 |
| 8 | Nenhum tratamento de erro nos eventos de clique | Se fetch falhar, erro silencioso (ok) mas sem feedback | index.html |

### 3. CSS (CRÍTICO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 9 | `Collaborate` font não existe no Google Fonts | URL inválida: `family=Collaborate:wght@100;300;400;700` | style.css:1 |
| 10 | Featured media hidden (`display: none`) | `.blog-featured .featured-media { display: none }` impede imagem do post de aparecer | style.css:1086-1088 |
| 11 | `.featured-copy h3` duplicado 3x | Definições conflitantes nas linhas 1126, 1174, 1182 | style.css |
| 12 | `.blog-cta` usa `Collaborate` font | Fallback para Inter, mas o erro de fonte persiste | style.css:1198 |
| 13 | Seção Sobre carrega PNG+WebP sem prioridade | Ambas as imagens carregam, WebP é sobrescrita | style.css:579-602 |

### 4. IMAGENS (MÉDIO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 14 | `ybyra.img (1).png` com espaço no nome | Incompatível com Linux/Unix em alguns contextos | index.html:294,310,326 |
| 15 | Imagens duplicadas em data/ghost_content | Múltiplas versões do mesmo arquivo (539424226_..., IMG_2323) | data/ghost_content/ |

### 5. API DO BLOG (CRÍTICO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 16 | API retorna imagem mas CSS esconde `featured-media` | Nenhuma imagem de post aparece no card, só gradiente | style.css:1086 |
| 17 | `loadLocalFallback()` busca cache síncrono + assíncrono confuso | Se API falha e cache existe, usa cache. Se cache expirou e API falha, tenta fallback | blog-embed.js:78-89 |
| 18 | `fetchLatestPost` não tem fallback interno | GhostService deveria ter fallback para dados locais | ghostService.js |
| 19 | Timeout da API é 8s no frontend, 10s no backend | Pode causar discrepância de comportamento | blog-embed.js:63 |

### 6. PRODUÇÃO / DOCKER / NGINX (CRÍTICO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 20 | 404.html e 50x.html não existem | Nginx referencia páginas de erro inexistentes | nginx.conf |
| 21 | Sem Content-Security-Policy | Vulnerabilidade XSS | nginx.conf |
| 22 | Sem Permissions-Policy | Segurança de navegador | nginx.conf |
| 23 | `brand-logo-fix.css` existe mas não é carregado | Arquivo CSS não referenciado no HTML | css/ |
| 24 | Nginx não adiciona headers de cache na API proxy | Respostas da API podem ser cacheadas incorretamente | nginx.conf |

### 7. PERFORMANCE (MÉDIO)
| # | Problema | Causa | Arquivo |
|---|----------|-------|---------|
| 25 | Fonte Collaboration falha carregamento | Bloqueia renderização por até 3s | style.css:1 |
| 26 | Bootstrap 5.3.3 + Font Awesome carregados de CDN | Sem fallback se CDN cair | index.html |
| 27 | Métricas inline enviam fetch toda página | Sem debounce ou batelada | index.html:352-360 |