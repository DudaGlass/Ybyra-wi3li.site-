#!/bin/bash

# Script para gerar config.production.json a partir do template e variáveis de ambiente

# Carregar variáveis de ambiente (suporta valores com espaços)
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
else
    echo "❌ Arquivo .env não encontrado!"
    exit 1
fi

# Gerar arquivo de configuração substituindo variáveis
envsubst < config.production.template.json > config.production.json

echo "✅ Arquivo config.production.json gerado com sucesso!"
echo "🔐 Dados sensíveis estão no .env"
echo "📁 Arquivo gerado: config.production.json"
