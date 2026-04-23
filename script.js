/* =======================================================
   ARQUIVO: script.js
   FUNÇÃO: controlar interações do site e enviar métricas
   ======================================================= */


/* =======================================================
   CONTROLE DA NAVBAR AO ROLAR A PÁGINA
   A navbar desaparece ao descer e reaparece ao subir
   ======================================================= */

// Guarda posição anterior da rolagem
let lastScroll = 0;

// Evento disparado quando a página é rolada
window.addEventListener("scroll", function () {

    // Seleciona a navbar pelo ID
    const navbar = document.getElementById("navbar");

    // Posição atual do scroll
    const currentScroll = window.pageYOffset;

    // Se estiver descendo a página
    if (currentScroll > lastScroll) {

        // Adiciona classe que esconde a navbar
        navbar.classList.add("navbar-hidden");

    } else {

        // Remove a classe para mostrar novamente
        navbar.classList.remove("navbar-hidden");

    }

    // Atualiza posição anterior
    lastScroll = currentScroll;

});


/* =======================================================
   FUNÇÃO PARA ENVIAR MÉTRICAS PARA A API
   ======================================================= */

function enviarMetricas(tipoEvento, dadosExtra = {}) {

    // Estrutura de dados enviada para a API
    const dados = {
        evento: tipoEvento,                    // tipo de evento (visita, clique, etc.)
        pagina: window.location.pathname,      // página atual
        data: new Date().toISOString(),        // data e hora do evento
        navegador: navigator.userAgent,        // navegador utilizado
        larguraTela: window.innerWidth,        // largura da tela
        alturaTela: window.innerHeight,        // altura da tela
        ...dadosExtra                          // dados adicionais (ex: botão clicado)
    };

    // Envia os dados para a API
    fetch("https://api.ybyra.com/metrics", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(dados)
    })
    .catch(function (erro) {
        // Caso a API esteja offline, apenas registra erro no console
        console.log("Erro ao enviar métricas:", erro);
    });

}


/* =======================================================
   REGISTRO DE VISITA NA PÁGINA
   Executa quando o usuário abre o site
   ======================================================= */

document.addEventListener("DOMContentLoaded", function () {

    enviarMetricas("visita");

});


/* =======================================================
   REGISTRO DE CLIQUE NO BOTÃO DE CASTING
   ======================================================= */

document.querySelectorAll(".btn-casting").forEach(function (botao) {

    botao.addEventListener("click", function () {

        enviarMetricas("clique_casting");

    });

});


/* =======================================================
   REGISTRO DE CLIQUE DE PRODUTORES
   ======================================================= */

document.querySelectorAll(".btn-produtor").forEach(function (botao) {

    botao.addEventListener("click", function () {

        enviarMetricas("clique_produtor");

    });

});

/* =======================================================
   CONTROLE DO BLOCO DE BLOG E FILTROS DE CATEGORIA
   ======================================================= */

document.addEventListener("DOMContentLoaded", function () {
    const filterButtons = document.querySelectorAll(".blog-filter");
    const blogItems = document.querySelectorAll(".blog-card, .blog-featured");

    function setActiveFilter(button) {
        filterButtons.forEach(function (btn) {
            btn.classList.toggle("active", btn === button);
        });
    }

    function filterBlog(category) {
        blogItems.forEach(function (item) {
            if (category === "all" || item.dataset.category === category) {
                item.classList.remove("hidden");
            } else {
                item.classList.add("hidden");
            }
        });
    }

    filterButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            setActiveFilter(button);
            filterBlog(button.dataset.category);
        });
    });
});


/* =======================================================
   TEMPO DE PERMANÊNCIA NA PÁGINA
   Mede quanto tempo o usuário ficou no site
   ======================================================= */

// Marca o tempo inicial
const tempoInicio = Date.now();

    // Calcula tempo total em segundos
    const tempoTotal = Math.floor((Date.now() - tempoInicio) / 1000);

    // Envia para a API
    enviarMetricas("tempo_pagina", {
        tempo_segundos: tempoTotal
    });

});