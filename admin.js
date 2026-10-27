(function(){
'use strict';
let reservasCache={}, numerosCache={}, linksCache={}, usuarioAtual=null, configRifa={precoNumero:20,quantidadeNumeros:100,vendasAbertas:true}, ouvindo=false, primeiraLeituraReservas=true, resumoAnterior={total:0,pagamentos:0};
const $=id=>document.getElementById(id), moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const secoes=['barraAdmin','perfilAdmin','dashboard','visitasAdmin','novosAdmins','configRifa','configPagamento','configPix','sorteioAdmin','resultadosSorteioAdmin','afiliadosAdmin','pixAutomaticoAdmin','painel'];
function mensagem(t,erro=false){const el=$('adminMensagem');el.textContent=t||'';el.style.color=erro?'#b00020':'';}
async function adminRef(uid){
  if(!uid)return false;
  try{
    if(auth.currentUser)await auth.currentUser.getIdToken(true);
    const s=await db.ref('admins/'+uid).once('value');
    return s.val()===true;
  }catch(e){
    console.error('Falha ao verificar administrador:',e);
    return false;
  }
}
function proteger(msg,frase){if(!confirm(msg+'\n\nEsta ação não poderá ser desfeita.'))return false;if(frase&&prompt('Digite exatamente: '+frase)!==frase){alert('Confirmação incorreta.');return false;}return true;}
function statusNome(s){return ['aguardando_confirmacao','aguardando_pagamento','reservado'].includes(s)?'reservado — aguardando Pix':s==='pagamento_informado'?'pagamento informado':s==='confirmado'?'confirmado':s==='cancelado'?'cancelado':String(s||'desconhecido');}
function formatarDataSorteio(ts){return ts?new Date(ts).toLocaleString('pt-BR'):'data não informada';}
function normalizarResultado(r){return r&&typeof r==='object'?r:null;}
function desenharResultadoAtual(resultado){
  const box=$('resultadoAtualAdmin'),btn=$('btnApagarResultadoAtual');
  resultado=normalizarResultado(resultado);
  if(!resultado){box.className='resultado-admin-vazio';box.textContent='Nenhum resultado publicado.';btn.disabled=true;return;}
  btn.disabled=false;box.className='resultado-atual-card';
  box.innerHTML='<strong>🏆 Número '+esc(String(resultado.numero||'—').padStart(2,'0'))+'</strong>'+
    '<p><b>Vencedor:</b> '+esc(resultado.nome||'Não informado')+'</p>'+
    '<p><b>Telefone:</b> '+esc(resultado.telefone||'Não informado')+'</p>'+
    '<p><b>Reserva:</b> '+esc(resultado.reservaId||'Não informada')+'</p>'+
    '<p><b>Publicado:</b> '+esc(formatarDataSorteio(resultado.publicadoEm))+'</p>';
}
function desenharHistoricoSorteios(dados){historicoSorteiosCache=dados||{};
  const lista=$('listaHistoricoSorteios'),contador=$('contadorHistoricoSorteios'),btnTudo=$('btnApagarTodoHistorico');
  lista.innerHTML='';
  const itens=Object.entries(dados||{}).map(([id,r])=>({id,...(r||{})})).filter(r=>!ocultoAdmin('sorteios',r.id)).sort((a,b)=>(b.publicadoEm||0)-(a.publicadoEm||0));
  contador.textContent=itens.length+' resultado(s)';btnTudo.disabled=!itens.length;
  if(!itens.length){lista.innerHTML='<p class="texto-apoio">Nenhum sorteio salvo no histórico.</p>';return;}
  itens.forEach(r=>{
    const card=document.createElement('article');card.className='historico-sorteio-item';
    card.innerHTML='<strong>🎟️ Número '+esc(String(r.numero||'—').padStart(2,'0'))+'</strong>'+
      '<p><b>Vencedor:</b> '+esc(r.nome||'Não informado')+'</p>'+
      '<p><b>Reserva:</b> '+esc(r.reservaId||'Não informada')+'</p>'+
      '<p><b>Data:</b> '+esc(formatarDataSorteio(r.publicadoEm))+'</p><div class="linha-botoes"></div>';
    const botao=document.createElement('button');botao.type='button';botao.className='botao excluir';botao.textContent='🔒 Apagar este histórico';
    botao.onclick=()=>apagarHistoricoSorteio(r.id,r.numero);
    card.querySelector('.linha-botoes').appendChild(botao);botaoExcluirVisual(card.querySelector('.linha-botoes'),'sorteios',r.id,'sorteio '+r.numero);lista.appendChild(card);
  });
}
function statusResultado(t,erro=false){const el=$('statusResultadosSorteio');if(!el)return;el.textContent=t||'';el.className='status-operacao '+(erro?'erro':t?'sucesso':'');}
async function apagarResultadoAtual(){
  if(!proteger('Apagar o resultado atual da página pública?','APAGAR RESULTADO'))return;
  try{statusResultado('Apagando resultado atual…');await db.ref('rifa/resultadoAtual').remove();statusResultado('Resultado atual apagado. O histórico foi mantido.');}
  catch(e){statusResultado('Erro ao apagar resultado: '+e.message,true);}
}
async function apagarHistoricoSorteio(id,numero){
  if(!id||!proteger('Apagar do histórico o sorteio do número '+numero+'?'))return;
  try{statusResultado('Apagando item do histórico…');await db.ref('rifa/historicoSorteios/'+id).remove();statusResultado('Item removido do histórico.');}
  catch(e){statusResultado('Erro ao apagar histórico: '+e.message,true);}
}
async function apagarTodoHistorico(){
  if(!proteger('Apagar TODOS os resultados do histórico de sorteios?','LIMPAR HISTORICO'))return;
  try{statusResultado('Limpando histórico…');await db.ref('rifa/historicoSorteios').remove();statusResultado('Todo o histórico foi apagado. O resultado atual foi mantido.');}
  catch(e){statusResultado('Erro ao limpar histórico: '+e.message,true);}
}
function trocarAba(tipo){const cadastro=tipo==='cadastro';$('loginForm').classList.toggle('oculto',cadastro);$('cadastroForm').classList.toggle('oculto',!cadastro);$('abaLogin').classList.toggle('ativa',!cadastro);$('abaCadastro').classList.toggle('ativa',cadastro);mensagem('');}
function esconderTudo(){secoes.forEach(id=>$(id).classList.add('oculto'));$('acessoBox').classList.add('oculto');$('aguardandoBox').classList.add('oculto');}
function mostrarAcesso(){esconderTudo();$('acessoBox').classList.remove('oculto');}
function mostrarAguardando(){esconderTudo();$('aguardandoBox').classList.remove('oculto');}
async function entrar(){const email=$('adminEmail').value.trim(),senha=$('adminSenha').value;if(!email||!senha)return mensagem('Preencha e-mail e senha.',true);try{mensagem('Entrando...');await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);await auth.signInWithEmailAndPassword(email,senha);}catch(e){mensagem(traduzErro(e),true);}}
async function cadastrar(){const nome=$('cadNome').value.trim(),telefone=$('cadTelefone').value.replace(/\D/g,''),email=$('cadEmail').value.trim(),senha=$('cadSenha').value,conf=$('cadConfirmarSenha').value;if(nome.length<3)return mensagem('Digite o nome completo.',true);if(telefone.length<10)return mensagem('Digite um telefone válido.',true);if(!email)return mensagem('Digite o e-mail.',true);if(senha.length<6)return mensagem('A senha precisa ter pelo menos 6 caracteres.',true);if(senha!==conf)return mensagem('As senhas não são iguais.',true);try{mensagem('Criando cadastro...');await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);const c=await auth.createUserWithEmailAndPassword(email,senha);await c.user.updateProfile({displayName:nome});const autorizado=await adminRef(c.user.uid);await db.ref('rifa/administradores/'+c.user.uid).set({uid:c.user.uid,nome,telefone,email,foto:'',status:autorizado?'ativo':'pendente',criadoEm:firebase.database.ServerValue.TIMESTAMP,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP,online:true});if(autorizado)await abrirPainel(c.user);else mostrarAguardando();}catch(e){mensagem(traduzErro(e),true);}}
function traduzErro(e){const c=e&&e.code||'';if(c.includes('email-already-in-use'))return 'Este e-mail já possui cadastro.';if(c.includes('wrong-password')||c.includes('invalid-credential'))return 'E-mail ou senha incorretos.';if(c.includes('user-not-found'))return 'Usuário não encontrado.';if(c.includes('invalid-email'))return 'E-mail inválido.';if(c.includes('weak-password'))return 'A senha precisa ter pelo menos 6 caracteres.';if(c.includes('too-many-requests'))return 'Muitas tentativas. Aguarde e tente novamente.';return e.message||'Não foi possível concluir.';}
async function esqueciSenha(){const email=$('adminEmail').value.trim()||prompt('Digite o e-mail cadastrado:');if(!email)return;try{await auth.sendPasswordResetEmail(email);alert('O link para redefinir a senha foi enviado para '+email+'.');}catch(e){alert(traduzErro(e));}}
async function verificarAprovacao(){
  if(!auth.currentUser)return mostrarAcesso();
  mensagemAguardando('Verificando autorização…');
  if(await adminRef(auth.currentUser.uid)){await abrirPainel(auth.currentUser);}
  else mensagemAguardando('Ainda não foi encontrada autorização para este UID. Não é necessário sair: esta tela verifica automaticamente.');
}
function mensagemAguardando(t){const el=$('aguardandoMensagem');if(el)el.textContent=t||'';}
async function garantirPerfil(u){const ref=db.ref('rifa/administradores/'+u.uid),s=await ref.once('value');if(!s.exists())await ref.set({uid:u.uid,nome:u.displayName||'Administrador',telefone:'',email:u.email||'',foto:u.photoURL||'',status:'ativo',criadoEm:firebase.database.ServerValue.TIMESTAMP});await ref.update({status:'ativo',email:u.email||'',ultimoAcesso:firebase.database.ServerValue.TIMESTAMP,online:true});const conectado=db.ref('.info/connected');conectado.on('value',snap=>{if(snap.val()===true){ref.child('online').onDisconnect().set(false);ref.child('ultimoAcesso').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);ref.update({online:true,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP});}});}
async function abrirPainel(u){usuarioAtual=u;esconderTudo();secoes.forEach(id=>$(id).classList.remove('oculto'));await garantirPerfil(u);carregarPerfil();ouvirPendentes();if(!ouvindo){ouvirTudo();ouvindo=true;}aplicarTema(localStorage.getItem('rifaAdminTema')==='escuro');}
function carregarPerfil(){db.ref('rifa/administradores/'+usuarioAtual.uid).on('value',s=>{const p=s.val()||{};$('adminLogado').textContent=p.nome||usuarioAtual.displayName||usuarioAtual.email||'Administrador';$('perfilNome').value=p.nome||'';$('perfilTelefone').value=p.telefone||'';$('perfilEmail').value=usuarioAtual.email||p.email||'';$('perfilFoto').value=p.foto||'';$('perfilUltimoAcesso').textContent='Último acesso: '+(p.ultimoAcesso?new Date(p.ultimoAcesso).toLocaleString('pt-BR'):'primeiro acesso');$('adminStatus').innerHTML='<span class="status-online">● Online</span> • sessão permanece conectada até apertar Sair';const avatar=$('avatarAdmin');if(p.foto){avatar.style.backgroundImage='url("'+String(p.foto).replace(/"/g,'')+'")';avatar.textContent='';}else{avatar.style.backgroundImage='';avatar.textContent=(p.nome||'A').charAt(0).toUpperCase();}});}
async function salvarPerfil(){const nome=$('perfilNome').value.trim(),telefone=$('perfilTelefone').value.replace(/\D/g,''),email=$('perfilEmail').value.trim(),foto=$('perfilFoto').value.trim();if(nome.length<3)return alert('Digite o nome.');if(telefone&&telefone.length<10)return alert('Telefone inválido.');try{if(email&&email!==usuarioAtual.email)await usuarioAtual.updateEmail(email);await usuarioAtual.updateProfile({displayName:nome,photoURL:foto||null});await db.ref('rifa/administradores/'+usuarioAtual.uid).update({nome,telefone,email:usuarioAtual.email,foto,atualizadoEm:firebase.database.ServerValue.TIMESTAMP});alert('Perfil atualizado.');}catch(e){alert(traduzErro(e)+'\nPara alterar o e-mail, talvez seja necessário sair e entrar novamente.');}}
async function alterarSenha(){const nova=prompt('Digite a nova senha (mínimo 6 caracteres):');if(!nova)return;if(nova.length<6)return alert('Senha muito curta.');const conf=prompt('Digite a nova senha novamente:');if(nova!==conf)return alert('As senhas não são iguais.');try{await usuarioAtual.updatePassword(nova);alert('Senha alterada com sucesso.');}catch(e){alert(traduzErro(e)+'\nSaia, entre novamente e tente alterar.');}}
let listenerPendentesAtivo=false;
function renderizarPendentes(dados){
  const c=$('listaAdminsPendentes'),status=$('statusPendentes');
  c.innerHTML='';
  const lista=Object.values(dados||{}).filter(p=>p&&p.status==='pendente').sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  status.textContent='Verificação concluída em '+new Date().toLocaleTimeString('pt-BR')+' • '+lista.length+' pendente(s).';
  status.className='status-operacao sucesso';
  if(!lista.length){c.innerHTML='<p class="texto-apoio">Nenhum cadastro aguardando aprovação.</p>';return;}
  lista.forEach(p=>{const d=document.createElement('article');d.className='admin-pendente';d.innerHTML='<strong>'+esc(p.nome||'Sem nome')+'</strong><p>'+esc(p.email||'')+'</p><p>'+esc(p.telefone||'')+'</p><p class="texto-apoio">Cadastro: '+(p.criadoEm?new Date(p.criadoEm).toLocaleString('pt-BR'):'data não informada')+'</p><div class="linha-botoes"></div>';const a=d.querySelector('.linha-botoes');const ok=document.createElement('button');ok.className='botao confirmar';ok.textContent='✓ Aprovar';ok.onclick=()=>aprovarAdmin(p.uid,true);const no=document.createElement('button');no.className='botao excluir';no.textContent='Recusar';no.onclick=()=>aprovarAdmin(p.uid,false);a.append(ok,no);c.appendChild(d);});
}
async function recarregarPendentes(){const status=$('statusPendentes');status.textContent='Consultando cadastros no Firebase…';status.className='status-operacao';try{const snap=await db.ref('rifa/administradores').once('value');renderizarPendentes(snap.val()||{});}catch(e){console.error(e);status.textContent='Erro ao verificar cadastros: '+e.message;status.className='status-operacao erro';}}
function ouvirPendentes(){if(listenerPendentesAtivo)return;listenerPendentesAtivo=true;db.ref('rifa/administradores').on('value',snap=>renderizarPendentes(snap.val()||{}),e=>{const status=$('statusPendentes');status.textContent='A atualização automática falhou. Aperte “Verificar novamente”. '+e.message;status.className='status-operacao erro';});recarregarPendentes();}
async function aprovarAdmin(uid,aprovar){if(aprovar){if(!confirm('Autorizar este usuário como administrador?'))return;const u={};u['admins/'+uid]=true;u['rifa/administradores/'+uid+'/status']='ativo';u['rifa/administradores/'+uid+'/aprovadoEm']=firebase.database.ServerValue.TIMESTAMP;u['rifa/administradores/'+uid+'/aprovadoPor']=usuarioAtual.uid;await db.ref().update(u);alert('Administrador aprovado.');}else{if(!proteger('Recusar este cadastro?'))return;await db.ref('rifa/administradores/'+uid).update({status:'recusado',recusadoEm:firebase.database.ServerValue.TIMESTAMP,recusadoPor:usuarioAtual.uid});}}
function aplicarTema(escuro){document.body.classList.toggle('tema-escuro',escuro);localStorage.setItem('rifaAdminTema',escuro?'escuro':'claro');$('btnTema').textContent=escuro?'☀️ Modo claro':'🌙 Modo escuro';}
function tocarAviso(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;osc.start();setTimeout(()=>{osc.stop();ctx.close();},220);}catch(_){}}
function avisoInterno(titulo,corpo){let box=document.getElementById('avisoInterno');if(!box){box=document.createElement('div');box.id='avisoInterno';box.className='aviso-interno';document.body.appendChild(box);}box.innerHTML='<strong>'+esc(titulo)+'</strong><span>'+esc(corpo)+'</span>';box.classList.add('mostrar');setTimeout(()=>box.classList.remove('mostrar'),6000);}
async function mostrarNotificacaoSistema(titulo,corpo){if(!('Notification'in window)||Notification.permission!=='granted')return false;try{if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.ready;await reg.showNotification(titulo,{body:corpo,icon:'icon-192.png',badge:'icon-192.png',tag:'rifa-'+titulo,renotify:true});return true;}new Notification(titulo,{body:corpo,icon:'icon-192.png'});return true;}catch(e){console.warn('Notificação do sistema falhou:',e);return false;}}
async function ativarNotificacoes(){const b=$('btnNotificacoes');if(!window.isSecureContext){b.textContent='🔔 Avisos internos ativos';avisoInterno('Avisos ativados','Nesta visualização, os avisos aparecerão dentro do painel. Notificações do Android exigem site HTTPS instalado.');tocarAviso();return;}if(!('Notification'in window)){b.textContent='🔔 Avisos internos ativos';avisoInterno('Avisos ativados','Seu navegador não oferece notificações do sistema, mas os avisos internos funcionarão.');return;}const p=await Notification.requestPermission();b.textContent=p==='granted'?'🔔 Avisos ativados':'🔔 Avisos internos ativos';avisoInterno('Painel da rifa',p==='granted'?'Notificações do sistema ativadas.':'Permissão do sistema bloqueada; os avisos internos continuarão funcionando.');tocarAviso();if(p==='granted')await mostrarNotificacaoSistema('Painel da rifa','Notificações ativadas com sucesso.');}
function avisar(titulo,corpo){avisoInterno(titulo,corpo);tocarAviso();mostrarNotificacaoSistema(titulo,corpo);}
function desenharLinks(m){linksCache=m||{};const l=$('listaLinks');l.innerHTML='';const qs=Object.keys(linksCache).sort((a,b)=>a-b);if(!qs.length){l.innerHTML='<p class="texto-apoio">Nenhum link configurado.</p>';return;}qs.forEach(q=>{const d=document.createElement('div');d.className='link-item';d.innerHTML='<div><strong>'+q+' número(s) — '+moeda(Number(q)*Number(configRifa.precoNumero||20))+'</strong><small>'+esc(linksCache[q])+'</small></div>';const b=document.createElement('button');b.className='botao cancelar';b.textContent='🔒 Excluir';b.onclick=()=>{if(proteger('Excluir este link?'))db.ref('rifa/configPublica/pagamentos/links/'+q).remove();};d.appendChild(b);l.appendChild(d);});}
async function salvarLink(){const q=Number($('quantidadeLink').value),u=$('urlLink').value.trim();if(!Number.isInteger(q)||q<1||q>Number(configRifa.quantidadeNumeros||1000))return alert('Quantidade inválida.');try{const url=new URL(u);if(url.protocol!=='https:')throw 0;}catch(e){return alert('Link HTTPS inválido.');}await db.ref('rifa/configPublica/pagamentos/links/'+q).set(u);$('quantidadeLink').value='';$('urlLink').value='';}
async function salvarPix(){const chave=$('chavePix').value.trim(),nome=$('nomeRecebedorPix').value.trim();if(chave.length<4)return alert('Digite uma chave válida.');await db.ref('rifa/configPublica/pagamentos/pix').set({chave,nome,atualizadoEm:Date.now()});alert('Pix salvo.');}


// Contato via WhatsApp normal ou Business (Android Chrome).
function abrirWhatsAppTipo(pessoa,tipo,afiliado=false){
  let telefone=String(pessoa.telefone||pessoa.celular||'').replace(/\D/g,'');
  if(telefone.length===10||telefone.length===11)telefone='55'+telefone;
  if(!/^55\d{10,11}$/.test(telefone)){
    alert('Telefone inválido ou não informado.');return;
  }
  const nome=String(pessoa.nome||'cliente');
  const numeros=Array.isArray(pessoa.numeros)?pessoa.numeros.join(', '):'';
  const msg=afiliado
    ?'Olá, '+nome+'! Seu saldo de indicações é '+moeda(pessoa.saldoDisponivel||0)+'.'
    :'Olá, '+nome+'! Estou entrando em contato sobre sua reserva da rifa'+(numeros?' (números: '+numeros+')':'')+'.';
  const query='phone='+encodeURIComponent(telefone)+'&text='+encodeURIComponent(msg);
  const url='https://api.whatsapp.com/send?'+query;
  const pacote=tipo==='business'?'com.whatsapp.w4b':'com.whatsapp';
  // O intent seleciona o aplicativo no Android; fallback web se indisponível.
  const intent='intent://api.whatsapp.com/send?'+query+'#Intent;scheme=https;package='+pacote+';S.browser_fallback_url='+encodeURIComponent(url)+';end';
  window.location.href=/Android/i.test(navigator.userAgent)?intent:url;
}
function adicionarBotoesWhatsApp(container,pessoa,afiliado=false){
  [['normal','💬 WhatsApp Normal'],['business','💼 WhatsApp Business']].forEach(([tipo,titulo])=>{
    const botao=document.createElement('button');
    botao.type='button';botao.className='botao whatsapp';botao.textContent=titulo;
    botao.onclick=()=>abrirWhatsAppTipo(pessoa,tipo,afiliado);
    container.appendChild(botao);
  });
}

let configAfiliados={ativo:true,valorPorNumero:0.20,minimoSaque:10},afiliadosCache={},comissoesCache={},pagamentosAfiliadosCache={};
async function carregarAfiliados(){
  try{
    const [cfg,afs,coms,pags]=await Promise.all([
      db.ref('rifa/configPublica/afiliados').once('value'),
      db.ref('rifa/afiliadosPorCpf').once('value'),
      db.ref('rifa/comissoes').once('value'),
      db.ref('rifa/pagamentosAfiliados').once('value')
    ]);
    configAfiliados=Object.assign({ativo:true,valorPorNumero:0.20,minimoSaque:10},cfg.val()||{});
    afiliadosCache=afs.val()||{};
    comissoesCache=coms.val()||{};
    pagamentosAfiliadosCache=pags.val()||{};
    $('cfgComissaoNumero').value=Number(configAfiliados.valorPorNumero||0.20);
    $('cfgMinimoSaque').value=Number(configAfiliados.minimoSaque||10);
    $('cfgAfiliadosAtivo').checked=configAfiliados.ativo!==false;
    desenharAfiliados();
  }catch(e){
    $('msgConfigAfiliados').textContent='Erro ao carregar: '+e.message;
    $('msgConfigAfiliados').className='status-operacao erro';
  }
}
async function salvarConfigAfiliados(){const valor=Number($('cfgComissaoNumero').value),minimo=Number($('cfgMinimoSaque').value);if(!Number.isFinite(valor)||valor<0)return alert('Comissão inválida.');if(!Number.isFinite(minimo)||minimo<0)return alert('Valor mínimo inválido.');await db.ref('rifa/configPublica/afiliados').set({ativo:$('cfgAfiliadosAtivo').checked,valorPorNumero:valor,minimoSaque:minimo,atualizadoEm:firebase.database.ServerValue.TIMESTAMP});$('msgConfigAfiliados').textContent='Configuração salva.';$('msgConfigAfiliados').className='status-operacao sucesso';await carregarAfiliados();}
function atualizarResumoAfiliados(lista){
  const saldo=lista.reduce((t,a)=>t+Number(a.saldoDisponivel||0),0);
  const ganhos=lista.reduce((t,a)=>t+Number(a.totalGanhos||0),0);
  const indicacoes=lista.reduce((t,a)=>t+Number(a.totalIndicacoes||0),0);
  const pago=lista.reduce((t,a)=>t+Number(a.totalPago||0),0);
  if($('afiliadosSaldoTotal'))$('afiliadosSaldoTotal').textContent=moeda(saldo);
  if($('afiliadosGanhosTotal'))$('afiliadosGanhosTotal').textContent=moeda(ganhos);
  if($('afiliadosIndicacoesTotal'))$('afiliadosIndicacoesTotal').textContent=String(indicacoes);
  if($('afiliadosPagoTotal'))$('afiliadosPagoTotal').textContent=moeda(pago);
}
function copiarTextoSeguro(texto,mensagem){
  const t=String(texto||'').trim();if(!t)return alert('Nenhum dado cadastrado.');
  if(navigator.clipboard&&location.protocol==='https:')navigator.clipboard.writeText(t).then(()=>alert(mensagem||'Copiado.')).catch(()=>prompt('Copie:',t));else prompt('Copie:',t);
}
async function prepararPixAfiliado(a){
  const saldo=Number(a.saldoDisponivel||0),pix=String(a.pix||'').trim();
  if(saldo<=0)return alert('Este indicador não possui saldo disponível.');
  if(!pix)return alert('Este indicador não cadastrou uma chave Pix.');
  const texto='Pagamento de comissão da rifa\nBeneficiário: '+(a.nome||'')+'\nCPF: '+(a.cpf||'')+'\nValor: '+moeda(saldo)+'\nChave Pix: '+pix;
  try{await navigator.clipboard.writeText(pix);}catch(_){ }
  if(navigator.share){try{await navigator.share({title:'Pagamento Pix de comissão',text:texto});return;}catch(_){ }}
  alert('Chave Pix copiada.\n\nValor para pagar: '+moeda(saldo)+'\nChave: '+pix+'\n\nAbra seu banco, faça o Pix e depois toque em “Confirmar Pix enviado”.');
}
// Arquivamento administrativo: nao altera pagamentos, numeros nem saldos.
let itensOcultosAdmin={};
function ocultoAdmin(tipo,id){return !!(itensOcultosAdmin[tipo]&&itensOcultosAdmin[tipo][String(id)]);}
async function arquivarItemAdmin(tipo,id,nome,confirmada=false){
 if(!usuarioAtual||!await adminRef(usuarioAtual.uid))return alert('Apenas administradores autorizados.');
 if(confirmada){
  const [fim,resultado,historico]=await Promise.all([db.ref('rifa/encerramento/finalizada').once('value'),db.ref('rifa/resultadoAtual').once('value'),db.ref('rifa/historicoSorteios').once('value')]);
  if(fim.val()!==true||(!resultado.exists()&&!historico.exists()))return alert('Reservas confirmadas somente podem ser retiradas da lista depois do encerramento oficial da rifa e publicacao de resultados.');
 }
 if(!confirm('Retirar da tela do administrador: '+nome+'?\n\nOs registros no Firebase e os comprovantes financeiros serao preservados.'))return;
 try{
  await db.ref('rifa/adminItensOcultos/'+tipo+'/'+String(id)).set({oculto:true,em:firebase.database.ServerValue.TIMESTAMP,por:usuarioAtual.uid});
  await db.ref('rifa/auditoriaAdmin').push().set({acao:'exclusao_visual_'+tipo,registroId:String(id),uid:usuarioAtual.uid,em:firebase.database.ServerValue.TIMESTAMP});
 }catch(e){alert('Nao foi possivel retirar: '+e.message);}
}
function botaoExcluirVisual(container,tipo,id,nome,confirmada=false){
 if(!id||!container)return;
 const b=document.createElement('button');b.type='button';b.className='botao excluir';b.textContent='🗑️ Excluir da lista';
 b.onclick=()=>arquivarItemAdmin(tipo,id,nome,confirmada);container.appendChild(b);
}
function atualizarListasArquivadas(){desenharReservas();desenharAfiliados();desenharHistoricoSorteios(historicoSorteiosCache);}
let historicoSorteiosCache={};
function desenharComissoes(){
  const box=$('listaComissoes');if(!box)return;
  const lista=Object.entries(comissoesCache||{}).filter(([id])=>!ocultoAdmin('comissoes',id)).map(([id,v])=>({...v,_id:id})).sort((a,b)=>Number(b.confirmadoEm||0)-Number(a.confirmadoEm||0));
  $('contadorComissoes').textContent=lista.length+' registro(s)';
  if(!lista.length){box.innerHTML='<p class="texto-apoio">Nenhuma indicação confirmada.</p>';return;}
  box.innerHTML='';
  lista.forEach(c=>{
    const af=afiliadosCache[c.afiliadoCpf]||{};
    const d=document.createElement('article');d.className='registro-comissao';
    d.innerHTML='<div><strong>'+esc(af.nome||c.afiliadoCpf||'Indicador')+'</strong> <span class="tag-comissao '+esc(c.status||'disponivel')+'">'+esc(c.status==='paga'?'Paga':c.status==='cancelada'?'Cancelada':'Disponível')+'</span></div><p><b>Reserva:</b> '+esc(c.reservaId||'-')+'</p><p><b>Quantidade:</b> '+Number(c.quantidade||0)+' número(s) • <b>Comissão:</b> '+moeda(c.valor||0)+'</p><p><b>CPF do indicador:</b> '+esc(c.afiliadoCpf||'-')+'</p><p><b>Confirmada em:</b> '+(c.confirmadoEm?new Date(c.confirmadoEm).toLocaleString('pt-BR'):'-')+'</p>';
    botaoExcluirVisual(d,'comissoes',c._id,'comissao '+(c.reservaId||c._id));box.appendChild(d);
  });
}
function desenharPagamentosAfiliados(){
  const box=$('listaPagamentosAfiliados');if(!box)return;
  const lista=Object.entries(pagamentosAfiliadosCache||{}).filter(([id])=>!ocultoAdmin('pagamentos',id)).map(([id,v])=>({...v,_id:id})).sort((a,b)=>Number(b.pagoEm||0)-Number(a.pagoEm||0));
  $('contadorPagamentosAfiliados').textContent=lista.length+' pagamento(s)';
  if(!lista.length){box.innerHTML='<p class="texto-apoio">Nenhum pagamento registrado.</p>';return;}
  box.innerHTML='';
  lista.forEach(p=>{
    const d=document.createElement('article');d.className='registro-pagamento-afiliado';
    d.innerHTML='<strong>'+esc(p.nome||'Indicador')+'</strong><p><b>Valor:</b> '+moeda(p.valor||0)+'</p><p><b>CPF:</b> '+esc(p.cpf||'-')+' • <b>Pix:</b> '+esc(p.pix||'-')+'</p><p><b>Pago em:</b> '+(p.pagoEm?new Date(p.pagoEm).toLocaleString('pt-BR'):'-')+'</p>';
    botaoExcluirVisual(d,'pagamentos',p._id,'pagamento '+p._id);box.appendChild(d);
  });
}
function desenharAfiliados(){
  const box=$('listaAfiliados'),lista=Object.values(afiliadosCache||{}).filter(a=>!ocultoAdmin('afiliados',a.cpf)).sort((a,b)=>Number(b.saldoDisponivel||0)-Number(a.saldoDisponivel||0));
  $('contadorAfiliados').textContent=lista.length+' cadastro(s)';
  atualizarResumoAfiliados(lista);desenharComissoes();desenharPagamentosAfiliados();
  if(!lista.length){box.innerHTML='<p class="texto-apoio">Nenhum afiliado cadastrado.</p>';return;}
  box.innerHTML='';
  lista.forEach(a=>{
    const d=document.createElement('article');d.className='reserva-admin';
    d.innerHTML='<div><strong>'+esc(a.nome||'Sem nome')+'</strong><p>CPF: '+esc(a.cpf||'')+' • Telefone: '+esc(a.telefone||'')+'</p><p>Pix: '+esc(a.pix||'Não cadastrada')+'</p><p>Código: '+esc(a.codigo||'')+'</p><div class="grade-resumo-indicacoes"><article><span>Saldo disponível</span><strong>'+moeda(a.saldoDisponivel||0)+'</strong></article><article><span>Total ganho</span><strong>'+moeda(a.totalGanhos||0)+'</strong></article><article><span>Indicações</span><strong>'+Number(a.totalIndicacoes||0)+'</strong></article><article><span>Total já pago</span><strong>'+moeda(a.totalPago||0)+'</strong></article></div></div>';
    const row=document.createElement('div');row.className='afiliado-acoes';
    adicionarBotoesWhatsApp(row,a,true);
    const cp=document.createElement('button');cp.className='botao secundario';cp.textContent='📋 Copiar chave Pix';cp.onclick=()=>copiarTextoSeguro(a.pix,'Chave Pix copiada.');
    const px=document.createElement('button');px.className='botao pix-pagar';px.textContent='💠 Preparar Pix';px.onclick=()=>prepararPixAfiliado(a);
    const pg=document.createElement('button');pg.className='botao confirmar';pg.textContent='✅ Confirmar Pix enviado';pg.onclick=()=>pagarAfiliado(a);
    const auto=document.createElement('button');auto.className='botao payout-bloqueado';auto.type='button';auto.disabled=true;auto.textContent='🏦 Enviar Pix automático — aguardando habilitação';auto.title='API Payouts ainda não habilitada pelo Mercado Pago';
    const info=document.createElement('div');info.className='payout-pendente-info';
    info.innerHTML='<strong>🏦 Mercado Pago Payouts</strong><p>Status: aguardando autorização da API para sua conta.</p><p>Destinatário: '+esc(a.nome||'Não informado')+' • Valor: '+moeda(a.saldoDisponivel||0)+'</p><p>A transferência automática não está ativa. Nenhum saldo será movimentado por este botão.</p>';
    row.append(cp,px,pg,auto);botaoExcluirVisual(row,'afiliados',a.cpf,'afiliado '+(a.nome||a.cpf));d.appendChild(row);d.appendChild(info);box.appendChild(d);
  });
}
async function pagarAfiliado(a){
  const saldo=Number(a.saldoDisponivel||0);if(saldo<=0)return alert('Este indicador não possui saldo disponível.');
  if(!proteger('Você já enviou o Pix de '+moeda(saldo)+' para '+a.nome+' e quer registrar como pago?'))return;
  const cpf=a.cpf,pagRef=db.ref('rifa/pagamentosAfiliados').push(),updates={};
  updates['rifa/afiliadosPorCpf/'+cpf+'/saldoDisponivel']=0;
  updates['rifa/afiliadosPorCpf/'+cpf+'/totalPago']=Number(a.totalPago||0)+saldo;
  updates['rifa/afiliadosPorCpf/'+cpf+'/ultimoPagamentoEm']=firebase.database.ServerValue.TIMESTAMP;
  updates['rifa/pagamentosAfiliados/'+pagRef.key]={pagamentoId:pagRef.key,cpf,nome:a.nome||'',telefone:a.telefone||'',pix:a.pix||'',valor:saldo,status:'pago',pagoEm:firebase.database.ServerValue.TIMESTAMP,pagoPor:usuarioAtual?usuarioAtual.uid:''};
  const cs=await db.ref('rifa/comissoes').orderByChild('afiliadoCpf').equalTo(cpf).once('value');
  cs.forEach(c=>{if((c.val()||{}).status==='disponivel'){updates['rifa/comissoes/'+c.key+'/status']='paga';updates['rifa/comissoes/'+c.key+'/pagoEm']=firebase.database.ServerValue.TIMESTAMP;updates['rifa/comissoes/'+c.key+'/pagamentoId']=pagRef.key;}});
  await db.ref().update(updates);await carregarAfiliados();alert('Pagamento registrado no histórico.');
}
async function creditarComissao(r){
  if(configAfiliados.ativo===false)return;
  let codigo=String(r.indicadorCodigo||'').trim().toUpperCase(),cpf=String(r.indicadorCpf||'');
  if(codigo&&!cpf){const s=await db.ref('rifa/codigosAfiliados/'+codigo).once('value');cpf=String(s.val()||'');}
  if(!codigo||!cpf||cpf===String(r.cpf||''))return;
  const afSnap=await db.ref('rifa/afiliadosPorCpf/'+cpf).once('value');
  if(!afSnap.exists())return;
  const qtd=Number((r.numeros||[]).length),valor=Number(configAfiliados.valorPorNumero||0)*qtd;
  if(valor<=0||qtd<=0)return;
  const cRef=db.ref('rifa/comissoes/'+r.reservaId);
  const existe=await cRef.once('value');
  if(existe.exists()&&existe.child('creditado').val()===true)return;
  await cRef.set({reservaId:r.reservaId,afiliadoCpf:cpf,codigo,compradorCpf:r.cpf||'',quantidade:qtd,valor,status:'disponivel',confirmadoEm:firebase.database.ServerValue.TIMESTAMP,creditado:true});
  await db.ref('rifa/afiliadosPorCpf/'+cpf).transaction(x=>{if(!x)return x;x.saldoDisponivel=Number(x.saldoDisponivel||0)+valor;x.totalGanhos=Number(x.totalGanhos||0)+valor;x.totalIndicacoes=Number(x.totalIndicacoes||0)+1;x.atualizadoEm=Date.now();return x;});
  await db.ref('rifa/reservas/'+r.reservaId).update({indicadorCpf:cpf,indicadorCodigo:codigo,comissaoValor:valor,comissaoCreditada:true});
}
// Operacoes manuais exclusivas de reservas sem pagamento Mercado Pago.
// IMPORTANT: as regras do Firebase devem exigir administrador autenticado.
async function validarReservaManual(r){
 if(!usuarioAtual||!auth.currentUser||auth.currentUser.uid!==usuarioAtual.uid)throw Error('Entre na conta do administrador.');
 const atual=(await db.ref('rifa/reservas/'+r.reservaId).get()).val();
 if(!atual)throw Error('Reserva nao encontrada. Atualize o painel.');
 if(atual.mpPaymentId)throw Error('Esta reserva usa Pix automatico e so pode ser alterada pelo servidor.');
 for(const n of atual.numeros||[]){
  const lock=(await db.ref('rifa/numeros/'+n).get()).val();
  if(lock&&lock.reservaId!==r.reservaId)throw Error('Numero '+n+' ja pertence a outra reserva. Operacao interrompida.');
 }
 return atual;
}
async function mudar(r,status){
 try{
  const atual=await validarReservaManual(r);
  if(!['confirmado','cancelado'].includes(status))throw Error('Status invalido.');
  if(atual.status==='confirmado'&&status==='cancelado')throw Error('Venda confirmada: use um processo de estorno/auditoria antes de liberar numeros.');
  if(atual.status==='cancelado'&&status==='confirmado')throw Error('Reserva cancelada. Crie uma nova venda para confirmar.');
  const now=Date.now(),updates={};
  updates['rifa/reservas/'+r.reservaId+'/status']=status;
  updates['rifa/reservas/'+r.reservaId+'/atualizadoEm']=now;
  if(status==='confirmado'){
   updates['rifa/reservas/'+r.reservaId+'/formaPagamento']='dinheiro';
   updates['rifa/reservas/'+r.reservaId+'/confirmadoManualmentePor']=usuarioAtual.uid;
   updates['rifa/reservas/'+r.reservaId+'/confirmadoManualmenteEm']=now;
  }
  if(r.cpf)updates['rifa/reservasPorCpf/'+r.cpf+'/'+r.reservaId+'/status']=status;
  for(const n of atual.numeros||[]){
   if(status==='confirmado')updates['rifa/numeros/'+n]={status:'confirmado',reservaId:r.reservaId,ownerUid:atual.ownerUid||'',atualizadoEm:now};
   else updates['rifa/numeros/'+n]=null;
  }
  const audit=db.ref('rifa/auditoriaAdmin').push().key;
  updates['rifa/auditoriaAdmin/'+audit]={acao:status==='confirmado'?'confirmacao_dinheiro':'cancelamento_manual',reservaId:r.reservaId,uid:usuarioAtual.uid,em:now,statusAnterior:atual.status};
  await db.ref().update(updates);
  if(status==='confirmado')await creditarComissao({...atual,status:'confirmado'});
  await carregarAfiliados();
  alert(status==='confirmado'?'Pagamento em dinheiro confirmado e salvo.':'Reserva cancelada e numeros liberados.');
 }catch(e){alert('Nao foi possivel atualizar: '+e.message);}
}
async function excluirPixCancelado(r){
 try{
  if(!usuarioAtual||!auth.currentUser)throw Error('Entre como administrador.');
  if(!await adminRef(usuarioAtual.uid))throw Error('Acesso de administrador necessario.');
  if(!confirm('Excluir esta reserva Pix CANCELADA da lista? A operacao ficara registrada no historico.'))return;
  const token=await auth.currentUser.getIdToken(true);
  const response=await fetch('https://rifa-pix-render-backend-v1.onrender.com/api/admin/reservas/'+encodeURIComponent(r.reservaId)+'/excluir-cancelada',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Servidor recusou a exclusao.');
  alert('Reserva cancelada excluida com seguranca.');
 }catch(e){alert('Nao foi possivel excluir: '+e.message)}
}
async function excluirReserva(r){
 try{
  const atual=await validarReservaManual(r);
  if(atual.status==='confirmado')return alert('Venda confirmada nao pode ser apagada. Preserve o historico financeiro.');
  if(!proteger('Excluir a reserva manual de '+(atual.nome||'cliente')+'?'))return;
  const updates={};updates['rifa/reservas/'+r.reservaId]=null;
  if(atual.cpf)updates['rifa/reservasPorCpf/'+atual.cpf+'/'+r.reservaId]=null;
  for(const n of atual.numeros||[])updates['rifa/numeros/'+n]=null;
  const audit=db.ref('rifa/auditoriaAdmin').push().key;
  updates['rifa/auditoriaAdmin/'+audit]={acao:'exclusao_manual',reservaId:r.reservaId,uid:usuarioAtual.uid,em:Date.now()};
  await db.ref().update(updates);
  alert('Reserva manual excluida.');
 }catch(e){alert('Nao foi possivel excluir: '+e.message);}
}

let auditoriaExclusoesCache={};
function desenharHistoricoExclusoes(){
 const el=$('listaHistoricoExclusoes');if(!el)return;
 const termo=String($('pesquisaHistoricoExclusoes')?.value||'').toLowerCase().trim();
 const itens=Object.entries(auditoriaExclusoesCache).filter(([,r])=>r&&String(r.acao||'').startsWith('exclusao_')).sort((a,b)=>Number(b[1].em||0)-Number(a[1].em||0));
 const filtrados=itens.filter(([,r])=>!termo||[r.reservaId,r.mpPaymentId,r.uid,r.nome,(r.numeros||[]).join(' '),r.acao].join(' ').toLowerCase().includes(termo));
 $('contadorHistoricoExclusoes').textContent=filtrados.length+' registro(s) encontrado(s)';el.replaceChildren();
 if(!filtrados.length){el.textContent='Nenhuma exclusão registrada com esses critérios.';return;}
 filtrados.forEach(([,r])=>{const card=document.createElement('article');card.className='reserva-card';
 const data=Number(r.em)?new Date(Number(r.em)).toLocaleString('pt-BR'):'Data não registrada';
 const tipo=r.acao==='exclusao_pix_cancelado'?'Pix cancelado':r.acao==='exclusao_manual'?'Reserva manual':'Exclusão';
 card.innerHTML='<strong>'+esc(tipo)+'</strong><p><b>Data:</b> '+esc(data)+'</p><p><b>Reserva:</b> '+esc(r.reservaId||'-')+'</p><p><b>Números:</b> '+esc((r.numeros||[]).join(', ')||'Não registrados')+'</p><p><b>Cliente:</b> '+esc(r.nome||'Não registrado')+'</p><p><b>Pagamento MP:</b> '+esc(r.mpPaymentId||'-')+'</p><p><b>Administrador UID:</b> '+esc(r.uid||'-')+'</p>';
 el.appendChild(card);});
}
function desenharReservas(){const termo=$('pesquisa').value.toLowerCase().trim(),lista=Object.values(reservasCache).filter(r=>!ocultoAdmin('reservas',r.reservaId)).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)).filter(r=>!termo||[r.nome,r.telefone,r.cpf,r.reservaId,(r.numeros||[]).join(' ')].join(' ').toLowerCase().includes(termo)),q={aguardando_confirmacao:0,aguardando_pagamento:0,reservado:0,pagamento_informado:0,confirmado:0,cancelado:0};Object.values(reservasCache).forEach(r=>q[r.status]=(q[r.status]||0)+1);$('contadorReservas').textContent=Object.keys(reservasCache).length+' total • '+(q.aguardando_confirmacao+q.aguardando_pagamento+q.reservado)+' reservadas • '+q.pagamento_informado+' pagamentos informados • '+q.confirmado+' confirmadas • '+q.cancelado+' canceladas';const c=$('listaReservas');if(!lista.length){c.innerHTML='<p class="texto-apoio">Nenhuma reserva encontrada.</p>';return;}c.innerHTML='';lista.forEach(r=>{const a=document.createElement('article');a.className='reserva-card'+(r.mpPaymentId?'<p><b>Pagamento MP:</b> '+esc(r.mpPaymentId)+' • '+esc(r.status==='confirmado'?'aprovado':r.mpStatus||'pendente')+'</p>':'')+(r.expiraEm&&r.status!=='confirmado'?'<p><b>Reserva expira:</b> '+esc(new Date(r.expiraEm).toLocaleString('pt-BR'))+'</p>':'')+(r.status==='pagamento_informado'?' pagamento-destaque':'');a.innerHTML='<div class="reserva-topo"><strong>'+esc(r.nome)+'</strong><span class="status-tag '+esc(r.status)+'">'+esc(statusNome(r.status))+'</span></div><p><b>Código:</b> '+esc(r.reservaId)+'</p><p><b>Números:</b> '+esc((r.numeros||[]).join(', '))+'</p><p><b>Total:</b> '+moeda(r.valor)+'</p><p><b>Telefone:</b> '+esc(r.telefone||'-')+'</p><p><b>CPF:</b> '+esc(r.cpf||'-')+'</p><p><b>E-mail:</b> '+esc(r.email||'-')+'</p>'+(r.mpPaymentId?'<p><b>Pagamento MP:</b> '+esc(r.mpPaymentId)+' • '+esc(r.status==='confirmado'?'aprovado':r.mpStatus||'pendente')+'</p>':'')+(r.expiraEm&&r.status!=='confirmado'?'<p><b>Reserva expira:</b> '+esc(new Date(r.expiraEm).toLocaleString('pt-BR'))+'</p>':'')+(r.status==='pagamento_informado'?'<div class="pagamento-informado-box"><b>✅ Cliente informou pagamento</b><br>Nome no pagamento: '+esc(r.nomePagador||'não informado')+'</div>':'')+'<div class="acoes-admin"></div>';const x=a.querySelector('.acoes-admin');adicionarBotoesWhatsApp(x,r,false);botaoExcluirVisual(x,'reservas',r.reservaId,'reserva '+r.reservaId,r.status==='confirmado');if(['aguardando_confirmacao','pagamento_informado','reservado','aguardando_pagamento'].includes(r.status)&&!r.mpPaymentId){const ok=document.createElement('button');ok.className='botao confirmar';ok.textContent='💵 Confirmar dinheiro';ok.onclick=()=>confirm('Voce RECEBEU o dinheiro desta venda? Confirmar e registrar no Firebase?')&&mudar(r,'confirmado');const no=document.createElement('button');no.className='botao cancelar';no.textContent='Cancelar';no.onclick=()=>confirm('Cancelar e liberar números?')&&mudar(r,'cancelado');x.append(ok,no);}if(r.status==='cancelado'&&r.mpPaymentId){const del=document.createElement('button');del.className='botao excluir';del.textContent='🗑️ Excluir cancelada';del.onclick=()=>excluirPixCancelado(r);x.appendChild(del);}else if(!r.mpPaymentId&&r.status!=='confirmado'){const del=document.createElement('button');del.className='botao excluir';del.textContent='🗑️ Excluir reserva';del.onclick=()=>excluirReserva(r);x.appendChild(del);}else{const hint=document.createElement('small');hint.textContent='Pix automático: confirmação e cancelamento exclusivos do servidor';x.appendChild(hint);}c.appendChild(a);});}
async function excluirStatus(status){if(status==='confirmado')return alert('Nao e permitido excluir em massa vendas confirmadas. Preserve o historico financeiro.');if(Object.values(reservasCache).some(r=>r.mpPaymentId && (status==='reservado'?['aguardando_confirmacao','aguardando_pagamento','reservado','pagamento_informado'].includes(r.status):r.status===status)))return alert('Existem reservas Pix protegidas. A exclusão em massa foi bloqueada para evitar perda de pagamentos.');const alvos=Object.values(reservasCache).filter(r=>status==='reservado'?['aguardando_confirmacao','pagamento_informado'].includes(r.status)&&!r.mpPaymentId:r.status===status);if(!alvos.length)return alert('Nada para excluir.');const frase=status==='confirmado'?'EXCLUIR CONFIRMADOS':'EXCLUIR '+status.toUpperCase();if(!proteger('Excluir '+alvos.length+' registros?',frase))return;const u={};for(const r of alvos){u['rifa/reservas/'+r.reservaId]=null;if(r.cpf)u['rifa/reservasPorCpf/'+r.cpf+'/'+r.reservaId]=null;for(const n of r.numeros||[])u['rifa/numeros/'+n]=null;}await db.ref().update(u);}

function atualizarDashboard(){
  const lista=Object.values(reservasCache||{}), numeros=Object.values(numerosCache||{});
  const reservados=numeros.filter(n=>n&&n.status==='reservado').length;
  const confirmados=numeros.filter(n=>n&&n.status==='confirmado').length;
  const livres=Math.max(0,Number(configRifa.quantidadeNumeros||100)-reservados-confirmados);
  const ativos=lista.filter(r=>['aguardando_confirmacao','aguardando_pagamento','reservado','pagamento_informado','confirmado'].includes(r.status));
  const participantes=new Set(ativos.map(r=>String(r.cpf||r.telefone||r.ownerUid||r.reservaId))).size;
  const arrecadado=lista.filter(r=>r.status==='confirmado').reduce((t,r)=>t+Number(r.valor||0),0);
  $('dashLivres').textContent=String(livres);
  $('dashReservados').textContent=String(reservados);
  $('dashConfirmados').textContent=String(confirmados);
  $('dashParticipantes').textContent=String(participantes);
  $('dashArrecadado').textContent=moeda(arrecadado);
  db.ref('rifa/estatisticasPublicas').set({livres,reservados,confirmados,participantes,arrecadado,atualizadoEm:firebase.database.ServerValue.TIMESTAMP}).catch(e=>console.warn('Falha ao publicar estatísticas:',e));
}
function statusFerramenta(texto,tipo=''){const el=$('statusFerramentas');if(!el)return;el.textContent=texto;el.className='status-operacao'+(tipo?' '+tipo:'');}

function baixar(nome,conteudo,tipo){const blob=new Blob([conteudo],{type:tipo}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportarCsv(){
  try{
    statusFerramenta('Preparando arquivo CSV…');
    const dados=Object.values(reservasCache||{}).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
    const linhas=[['Código','Nome','Telefone','CPF','E-mail','Números','Valor','Status','Data']];
    dados.forEach(r=>linhas.push([r.reservaId||'',r.nome||'',r.telefone||'',r.cpf||'',r.email||'',(r.numeros||[]).join(' '),Number(r.valor||0).toFixed(2).replace('.',','),statusNome(r.status),new Date(r.criadoEm||0).toLocaleString('pt-BR')]));
    const csv='\ufeff'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
    baixar('reservas-rifa-'+new Date().toISOString().slice(0,10)+'.csv',csv,'text/csv;charset=utf-8');
    statusFerramenta('CSV exportado com '+dados.length+' reserva(s).','sucesso');
  }catch(e){console.error(e);statusFerramenta('Erro ao exportar CSV: '+e.message,'erro');alert('Não foi possível exportar o CSV.');}
}
async function baixarBackup(){
  try{
    statusFerramenta('Lendo os dados do Firebase…');
    const s=await db.ref('rifa').once('value');
    const pacote={versao:15,criadoEm:Date.now(),projeto:'rifa-firebase',rifa:s.val()||{}};
    baixar('backup-rifa-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',JSON.stringify(pacote,null,2),'application/json');
    statusFerramenta('Backup baixado com sucesso. Guarde o arquivo em local seguro.','sucesso');
  }catch(e){console.error(e);statusFerramenta('Erro ao baixar backup: '+e.message,'erro');alert('Não foi possível baixar o backup.');}
}
async function restaurarBackup(arquivo){
  if(!arquivo)return;
  try{
    statusFerramenta('Verificando o arquivo de backup…');
    if(arquivo.size>10*1024*1024)throw new Error('Arquivo maior que 10 MB.');
    const txt=await arquivo.text(),obj=JSON.parse(txt),dados=obj.rifa||obj;
    if(!dados||typeof dados!=='object'||Array.isArray(dados))throw new Error('Arquivo inválido.');
    if(!proteger('Restaurar este backup e substituir todos os dados atuais da rifa?','RESTAURAR BACKUP')){statusFerramenta('Restauração cancelada.');return;}
    const seguranca=await db.ref('rifa').once('value');
    localStorage.setItem('rifaBackupAntesRestaurar',JSON.stringify({criadoEm:Date.now(),rifa:seguranca.val()||{}}));
    await db.ref('rifa').set(dados);
    statusFerramenta('Backup restaurado com sucesso.','sucesso');
    alert('Backup restaurado com sucesso.');
  }catch(e){console.error(e);statusFerramenta('Erro ao restaurar: '+e.message,'erro');alert('Não foi possível restaurar: '+e.message);}finally{$('arquivoBackup').value='';}
}


async function carregarConfigRifa(){
  const msg=$('configRifaMensagem');
  try{
    if(msg){msg.textContent='Carregando configurações…';msg.className='status-operacao';}
    const snap=await db.ref('rifa/configPublica/rifa').once('value');
    configRifa=Object.assign({nomeRifa:'Rifa Online',precoNumero:20,quantidadeNumeros:100,premio:'',descricao:'',dataSorteio:'',horaSorteio:'',banner:'',regulamento:'',whatsapp:'',vendasAbertas:true},snap.val()||{});
    $('cfgNomeRifa').value=configRifa.nomeRifa||'Rifa Online';
    $('cfgPrecoNumero').value=Number(configRifa.precoNumero||20);
    $('cfgQuantidadeNumeros').value=Number(configRifa.quantidadeNumeros||100);
    $('cfgPremio').value=configRifa.premio||'';
    $('cfgDescricao').value=configRifa.descricao||'';
    $('cfgDataSorteio').value=configRifa.dataSorteio||'';
    $('cfgHoraSorteio').value=configRifa.horaSorteio||'';
    $('cfgBanner').value=configRifa.banner||'';
    $('cfgRegulamento').value=configRifa.regulamento||'';
    $('cfgWhatsapp').value=configRifa.whatsapp||'';$('cfgUrlPublica').value=configRifa.urlPublica||'';
    $('cfgVendasAbertas').checked=configRifa.vendasAbertas!==false;
    if(msg){msg.textContent='Configurações carregadas.';msg.className='status-operacao sucesso';}
    atualizarDashboard();
  }catch(e){if(msg){msg.textContent='Erro ao carregar: '+e.message;msg.className='status-operacao erro';}}
}
async function salvarConfigRifa(){
  const nome=$('cfgNomeRifa').value.trim()||'Rifa Online';
  const preco=Number(String($('cfgPrecoNumero').value).replace(',','.'));
  const quantidade=Number($('cfgQuantidadeNumeros').value);
  if(!Number.isFinite(preco)||preco<=0)return alert('Digite um valor válido para cada número.');
  if(!Number.isInteger(quantidade)||quantidade<1||quantidade>1000)return alert('A quantidade deve ficar entre 1 e 1000.');
  const acima=Object.keys(numerosCache||{}).map(Number).filter(n=>n>quantidade && numerosCache[n] && ['reservado','confirmado'].includes(numerosCache[n].status));
  if(acima.length)return alert('Não é possível reduzir para '+quantidade+' porque existem números reservados/confirmados acima desse limite: '+acima.slice(0,10).join(', '));
  const dados={nomeRifa:nome,precoNumero:preco,quantidadeNumeros:quantidade,premio:$('cfgPremio').value.trim(),descricao:$('cfgDescricao').value.trim(),dataSorteio:$('cfgDataSorteio').value,horaSorteio:$('cfgHoraSorteio').value,banner:$('cfgBanner').value.trim(),regulamento:$('cfgRegulamento').value.trim(),whatsapp:$('cfgWhatsapp').value.replace(/\D/g,''),urlPublica:$('cfgUrlPublica').value.trim(),vendasAbertas:$('cfgVendasAbertas').checked,atualizadoEm:firebase.database.ServerValue.TIMESTAMP,atualizadoPor:usuarioAtual?usuarioAtual.uid:''};
  if(!confirm('Salvar estas configurações e atualizar a página dos clientes em tempo real?'))return;
  const msg=$('configRifaMensagem');msg.textContent='Salvando no Firebase…';msg.className='status-operacao';
  try{await db.ref('rifa/configPublica/rifa').set(dados);configRifa=Object.assign({},dados,{atualizadoEm:Date.now()});msg.textContent='Configurações salvas com sucesso.';msg.className='status-operacao sucesso';desenharLinks(((await db.ref('rifa/configPublica/pagamentos/links').once('value')).val())||{});atualizarDashboard();}
  catch(e){msg.textContent='Erro ao salvar: '+e.message;msg.className='status-operacao erro';}
}
function chaveHojeVisitas(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function ouvirVisualizacoes(){
  const hoje=chaveHojeVisitas();
  db.ref('rifa/visitas').on('value',snap=>{
    const dados=snap.val()||{};
    const total=Number(dados.total||0);
    const unicos=dados.visitantes&&typeof dados.visitantes==='object'?Object.keys(dados.visitantes).length:0;
    const hojeTotal=Number((dados.porDia&&dados.porDia[hoje])||0);
    if($('visitasTotal'))$('visitasTotal').textContent=String(total);
    if($('visitasUnicos'))$('visitasUnicos').textContent=String(unicos);
    if($('visitasHoje'))$('visitasHoje').textContent=String(hojeTotal);
    if($('visitasUltimaAtualizacao'))$('visitasUltimaAtualizacao').textContent='Atualizado em '+new Date().toLocaleTimeString('pt-BR')+'.';
  },e=>{
    if($('visitasUltimaAtualizacao')){
      $('visitasUltimaAtualizacao').textContent='Erro ao carregar visualizações: '+e.message;
      $('visitasUltimaAtualizacao').className='status-operacao erro';
    }
  });
}
function ouvirTudo(){db.ref('rifa/adminItensOcultos').on('value',snap=>{itensOcultosAdmin={};const d=snap.val()||{};for(const [tipo,items] of Object.entries(d)){itensOcultosAdmin[tipo]={};for(const [id,v] of Object.entries(items||{}))if(v&&v.oculto===true)itensOcultosAdmin[tipo][id]=true;}atualizarListasArquivadas();},e=>console.warn('Arquivamento indisponivel:',e));ouvirVisualizacoes();db.ref('rifa/auditoriaAdmin').limitToLast(1000).on('value',snap=>{auditoriaExclusoesCache=snap.val()||{};desenharHistoricoExclusoes();},e=>{if($('contadorHistoricoExclusoes'))$('contadorHistoricoExclusoes').textContent='Erro ao carregar histórico: '+e.message;});db.ref('rifa/resultadoAtual').on('value',s=>desenharResultadoAtual(s.val()),e=>statusResultado('Erro ao ler resultado atual: '+e.message,true));db.ref('rifa/historicoSorteios').on('value',s=>desenharHistoricoSorteios(s.val()||{}),e=>statusResultado('Erro ao ler histórico: '+e.message,true));db.ref('rifa/configPublica/afiliados').on('value',snap=>{configAfiliados=Object.assign({ativo:true,valorPorNumero:0.20,minimoSaque:10},snap.val()||{});if($('cfgComissaoNumero')){$('cfgComissaoNumero').value=Number(configAfiliados.valorPorNumero||0.20);$('cfgMinimoSaque').value=Number(configAfiliados.minimoSaque||10);$('cfgAfiliadosAtivo').checked=configAfiliados.ativo!==false;}});db.ref('rifa/afiliadosPorCpf').on('value',snap=>{afiliadosCache=snap.val()||{};if($('listaAfiliados'))desenharAfiliados();});db.ref('rifa/comissoes').on('value',snap=>{comissoesCache=snap.val()||{};if($('listaComissoes'))desenharAfiliados();});db.ref('rifa/pagamentosAfiliados').on('value',snap=>{pagamentosAfiliadosCache=snap.val()||{};if($('listaPagamentosAfiliados'))desenharAfiliados();});db.ref('rifa/configPublica/rifa').on('value',snap=>{configRifa=Object.assign({precoNumero:20,quantidadeNumeros:100,vendasAbertas:true},snap.val()||{});carregarConfigRifa();desenharLinks(linksCache);atualizarDashboard();});db.ref('rifa/configPublica/pagamentos').on('value',s=>{const p=s.val()||{},links=p.links||{},pix=p.pix||{};$('chavePix').value=pix.chave||'';$('nomeRecebedorPix').value=pix.nome||'';$('pixAdminMensagem').textContent=pix.chave?'Chave cadastrada: '+pix.chave:'Nenhuma chave cadastrada.';desenharLinks(links);});db.ref('rifa/numeros').on('value',s=>{numerosCache=s.val()||{};atualizarDashboard();},e=>statusFerramenta('Erro ao ler números: '+e.message,'erro'));db.ref('rifa/reservas').on('value',s=>{reservasCache=s.val()||{};const vals=Object.values(reservasCache),resumo={total:vals.length,pagamentos:vals.filter(r=>r.status==='pagamento_informado').length};if(!primeiraLeituraReservas){if(resumo.total>resumoAnterior.total)avisar('Nova reserva','Uma nova reserva foi registrada.');if(resumo.pagamentos>resumoAnterior.pagamentos)avisar('Pagamento informado','Um cliente informou que realizou o pagamento.');}primeiraLeituraReservas=false;resumoAnterior=resumo;desenharReservas();atualizarDashboard();statusFerramenta('Painel atualizado em '+new Date().toLocaleTimeString('pt-BR')+'.','sucesso');},e=>statusFerramenta('Erro ao ler reservas: '+e.message,'erro'));}

let recarregouPorAtualizacao=false;
async function registrarServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('service-worker.js?v=15.14',{updateViaCache:'none'});
    await reg.update().catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(recarregouPorAtualizacao)return;
      recarregouPorAtualizacao=true;
      location.reload();
    });
    setInterval(()=>reg.update().catch(()=>{}),5*60*1000);
  }catch(_){ }
}


const RIFA_BACKEND='https://rifa-pix-render-backend-v1.onrender.com';
async function verificarBackendPix(){
 const el=$('pixBackendStatus');if(!el)return;
 el.textContent='Consultando servidor Render…';el.className='status-operacao';
 try{
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
  let response;try{response=await fetch(RIFA_BACKEND+'/api/diagnostico',{signal:ctrl.signal,cache:'no-store'});}finally{clearTimeout(timer)}
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  const version=String(data.version||data.versao||'versão não informada');
  el.textContent='Servidor Render online • versão '+version+' • reservas Pix sincronizadas pelo Firebase. A confirmação depende de aprovação e gravação no servidor.';
  el.className='status-operacao sucesso';
 }catch(e){el.textContent='Não foi possível consultar o servidor: '+e.message+'. Verifique Render e a conexão.';el.className='status-operacao erro';}
}

function init(){auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});$('abaLogin').onclick=()=>trocarAba('login');$('abaCadastro').onclick=()=>trocarAba('cadastro');$('btnEntrar').onclick=entrar;$('btnCadastrar').onclick=cadastrar;$('btnEsqueciSenha').onclick=esqueciSenha;$('btnAtualizarAprovacao').onclick=verificarAprovacao;$('btnSairAguardando').onclick=()=>auth.signOut();$('btnSair').onclick=async()=>{if(usuarioAtual)await db.ref('rifa/administradores/'+usuarioAtual.uid).update({online:false,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP});await auth.signOut();};$('btnSalvarPerfil').onclick=salvarPerfil;$('btnAlterarSenha').onclick=alterarSenha;$('btnTema').onclick=()=>aplicarTema(!document.body.classList.contains('tema-escuro'));$('btnNotificacoes').onclick=ativarNotificacoes;$('btnRecarregarPendentes').onclick=recarregarPendentes;$('btnSalvarConfigRifa').onclick=salvarConfigRifa;$('btnRecarregarConfigRifa').onclick=carregarConfigRifa;$('btnSalvarLink').onclick=salvarLink;$('btnSalvarPix').onclick=salvarPix;$('btnSalvarConfigAfiliados').onclick=salvarConfigAfiliados;$('btnAtualizarAfiliados').onclick=carregarAfiliados;$('btnExcluirPix').onclick=()=>proteger('Excluir chave Pix?')&&db.ref('rifa/configPublica/pagamentos/pix').remove();$('btnApagarResultadoAtual').onclick=apagarResultadoAtual;$('btnApagarTodoHistorico').onclick=apagarTodoHistorico;$('pesquisa').oninput=desenharReservas;$('btnHistoricoExclusoes').onclick=()=>{$('historicoExclusoes').classList.toggle('oculto');desenharHistoricoExclusoes();};$('btnFecharHistoricoExclusoes').onclick=()=>$('historicoExclusoes').classList.add('oculto');$('pesquisaHistoricoExclusoes').oninput=desenharHistoricoExclusoes;$('btnExcluirCanceladas').onclick=()=>excluirStatus('cancelado');$('btnExcluirReservadas').onclick=()=>excluirStatus('reservado');$('btnExcluirConfirmadas').onclick=()=>excluirStatus('confirmado');$('btnExportarCsv').onclick=exportarCsv;$('btnBackup').onclick=baixarBackup;$('arquivoBackup').onchange=e=>restaurarBackup(e.target.files[0]);$('adminSenha').addEventListener('keydown',e=>{if(e.key==='Enter')entrar();});if('serviceWorker'in navigator)registrarServiceWorker();if($('btnVerificarBackend'))$('btnVerificarBackend').onclick=verificarBackendPix;verificarBackendPix();auth.onAuthStateChanged(async u=>{
  usuarioAtual=u;
  if(!u)return mostrarAcesso();
  mensagemAguardando('Verificando autorização…');
  if(await adminRef(u.uid)){await abrirPainel(u);return;}
  mostrarAguardando();
  mensagemAguardando('Conta conectada. Aguardando autorização no Firebase…');
  db.ref('admins/'+u.uid).on('value',async snap=>{
    if(auth.currentUser&&auth.currentUser.uid===u.uid&&snap.val()===true)await abrirPainel(auth.currentUser);
  });
});}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
