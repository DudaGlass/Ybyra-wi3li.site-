#!/bin/bash

# Script para gerar config.production.json a partir do template e variáveis de ambiente

# Carregar variáveis de ambiente
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ Arquivo .env não encontrado!"
    exit 1
fi

# Gerar arquivo de configuração substituindo variáveis
envsubst < config.production.template.json > config.production.json

echo "✅ Arquivo config.production.json gerado com sucesso!"
echo "🔐 Dados sensíveis estão no .env"
echo "📁 Arquivo gerado: config.production.json"
