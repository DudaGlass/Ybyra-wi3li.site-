# Ybyrá Casting — Blog Featured

Este repositório contém a versão do site com a seção de Blog atualizada para carregar dinamicamente o artigo em destaque.

Funcionalidades implementadas
- Carregamento prioritário do `data/blog-fallback.json` (apresenta imediatamente o último post local).
- Tentativas de fetch em ordem: WordPress REST API → RSS feed → proxy CORS público (AllOrigins) → fallback local.
- Skeleton loading elegante, lazy-loading de imagens, cache em `localStorage` com TTL (1h).
- Fallback visual com botão "Atualizar" e link para o blog caso APIs estejam indisponíveis.
- Indicador "Última atualização" exibido quando disponível (usa timestamp do cache/local).

Como testar localmente
1. Sirva os arquivos estáticos (na raiz do projeto):

```bash
cd Ybyra-wi3li.site-
python3 -m http.server 8000
```

2. Abra no navegador: `http://localhost:8000/`

3. Para ver logs de depuração (Console):

```js
localStorage.setItem('ybyra_blog_debug','1');
location.reload();
```

Arquivos importantes
- `index.html` — página principal com container dinâmico para o blog.
- `css/style.css` — estilos, incluindo skeleton e fallback.
- `blog-featured.js` — lógica principal (módulo ES6).
- `data/blog-fallback.json` — fallback local com o último post (é carregado imediatamente).

Notas e recomendações
- Para produção, recomendo usar um proxy próprio para evitar depender de proxies públicos.
- Remova/atualize o `data/blog-fallback.json` sempre que publicar conteúdo novo, ou manter o cache TTL conforme necessário.

Se quiser, eu faço:
- Commit das alterações no Git e gerar um release.
- Subir um proxy próprio (se você fornecer servidor/endereço) e integrar no script.
- Adicionar monitor simples que atualiza automaticamente o `data/blog-fallback.json` via CI quando o blog publica novo post.

Diga qual desses próximos passos você prefere e eu executo.

CI / Atualização automática
--------------------------------
Incluí um exemplo de workflow do GitHub Actions em `.github/workflows/update-fallback.yml` que roda diariamente e executa `scripts/update_fallback.py`.

Como funciona o CI
- O workflow obtém o último post via REST API ou RSS.
- Atualiza `data/blog-fallback.json` e, se houver mudanças, faz commit usando as credenciais do Actions (GITHUB_TOKEN), desde que o repositório permita pushes do workflow.

Executar manualmente (local)
--------------------------------
Instale dependências e execute:

```bash
pip install requests
python scripts/update_fallback.py
```

Para que o script comite automaticamente (útil em CI), exporte `COMMIT=true` e garanta que as credenciais git estejam configuradas.

Segurança / notas
- O workflow usa `actions/checkout` com `persist-credentials: true`, portanto o `GITHUB_TOKEN` padrão permite commit/push quando o repositório permitir.
- Para usar um proxy próprio em produção, substitua `fetchViaProxy` no `blog-featured.js` por seu endpoint seguro.
