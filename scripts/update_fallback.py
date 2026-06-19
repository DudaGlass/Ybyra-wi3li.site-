#!/usr/bin/env python3
"""
scripts/update_fallback.py

Busca o post mais recente do blog (REST API WP ou RSS) e atualiza
`data/blog-fallback.json` com o conteúdo formatado.

Se executado em CI com a variável de ambiente `COMMIT=true` e
`GITHUB_TOKEN` disponível (ou credenciais de git configuradas),
o script adicionará e commitará o arquivo caso haja mudanças.
"""
import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_PATH = os.path.join(ROOT, 'data', 'blog-fallback.json')
BLOG_URL = os.environ.get('BLOG_URL', 'https://blog.ybyracasting.com')

def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        return json.loads(body.decode('utf-8'))

def fetch_text(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8')

def fetch_wp():
    url = BLOG_URL.rstrip('/') + '/wp-json/wp/v2/posts?per_page=1&_embed'
    arr = fetch_json(url)
    if not arr:
        return None
    return arr

def fetch_rss():
    url = BLOG_URL.rstrip('/') + '/feed/'
    body = fetch_text(url)
    xml = ET.fromstring(body)
    items = xml.findall('.//item')
    if not items:
        return None
    first = items[0]
    title = first.findtext('title') or ''
    link = first.findtext('link') or ''
    pubDate = first.findtext('pubDate') or ''
    description = first.findtext('description') or ''
    author = first.findtext('{http://purl.org/dc/elements/1.1/}creator') or ''
    enclosure = first.find('enclosure')
    featured = []
    if enclosure is not None:
        src = enclosure.get('url')
        if src:
            featured.append({'source_url': src, 'alt_text': ''})
    post = {
        'id': None,
        'title': {'rendered': title},
        'link': link,
        'date': pubDate,
        'excerpt': {'rendered': description},
        '_embedded': {'wp:featuredmedia': featured},
        'author': {'name': author}
    }
    return [post]

def write_json(posts):
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

def git_commit_if_changed():
    try:
        # check for changes
        out = subprocess.check_output(['git', 'status', '--porcelain', DATA_PATH], cwd=ROOT)
        if not out.strip():
            print('Nenhuma mudança no arquivo; nenhum commit necessário.')
            return
        subprocess.check_call(['git', 'add', DATA_PATH], cwd=ROOT)
        subprocess.check_call(['git', 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], cwd=ROOT)
        subprocess.check_call(['git', 'config', 'user.name', 'github-actions[bot]'], cwd=ROOT)
        subprocess.check_call(['git', 'commit', '-m', 'chore: atualizar fallback do blog (automático)'], cwd=ROOT)
        subprocess.check_call(['git', 'push'], cwd=ROOT)
        print('Arquivo comitado e enviado.')
    except subprocess.CalledProcessError as e:
        print('Git error:', e)

def main():
    posts = None
    try:
        posts = fetch_wp()
        print('Obtido via WordPress REST API')
    except Exception as e:
        print('WP API falhou:', e)
    if not posts:
        try:
            posts = fetch_rss()
            print('Obtido via RSS')
        except Exception as e:
            print('RSS falhou:', e)
    if not posts:
        if os.path.exists(DATA_PATH):
            print('Não foi possível obter conteúdo remoto. Mantendo fallback local existente.')
            sys.exit(0)
        print('Não foi possível obter conteúdo remoto e não há fallback local disponível. Saindo com erro.')
        sys.exit(1)

    # normalize: ensure _embedded exists and author embedded
    for p in posts:
        if '_embedded' not in p:
            p['_embedded'] = {'wp:featuredmedia': []}
        if 'author' not in p and p.get('_embedded') and p['_embedded'].get('author'):
            p['author'] = {'name': p['_embedded']['author'][0].get('name')}

    # write to file
    write_json(posts)
    print('Arquivo atualizado em', DATA_PATH)

    if os.environ.get('COMMIT', '').lower() in ('1', 'true', 'yes'):
        git_commit_if_changed()


if __name__ == '__main__':
    main()
