/* Instalação PWA do painel administrativo. Não interfere em autenticação, Pix ou Firebase. */
(() => {
  'use strict';
  let promptInstalacao = null;
  const botao = document.getElementById('btnInstalarAdmin');
  const ajuda = document.getElementById('instalacaoAdminAjuda');
  if (!botao || !ajuda) return;
  const iphone = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
  const textoManual = () => iphone
    ? 'No iPhone: abra este site no Safari, toque em Compartilhar (quadrado com seta) e depois em Adicionar à Tela de Início.'
    : 'No Android: abra este site no Chrome, toque no menu ⋮ e escolha Instalar app ou Adicionar à tela inicial.';
  const atualizar = () => {
    if (standalone()) {
      botao.hidden = true;
      ajuda.textContent = 'O painel já está aberto como aplicativo.';
    } else {
      botao.hidden = false;
      ajuda.textContent = promptInstalacao ? 'Toque no botão para confirmar a instalação.' : textoManual();
    }
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptInstalacao = event;
    atualizar();
  });
  window.addEventListener('appinstalled', () => {
    promptInstalacao = null;
    atualizar();
  });
  botao.addEventListener('click', async () => {
    if (standalone()) return atualizar();
    if (promptInstalacao) {
      const evento = promptInstalacao;
      promptInstalacao = null;
      try {
        await evento.prompt();
        const escolha = await evento.userChoice;
        ajuda.textContent = escolha.outcome === 'accepted'
          ? 'Instalação solicitada. Confira a tela inicial do celular.'
          : textoManual();
      } catch (_) { ajuda.textContent = textoManual(); }
    } else { ajuda.textContent = textoManual(); }
  });
  atualizar();
})();
