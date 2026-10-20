// Aviso de cookies (LGPD) e Modo de Consentimento do Google.
//
// Para visitantes do Brasil, este aviso registra a escolha e informa o Google
// pelo Consent Mode v2. Para visitantes da Europa e do Reino Unido, o Google
// exige uma CMP certificada: ative a mensagem de GDPR em AdSense >
// Privacidade e mensagens. Ela aparece sozinha nesses países.

const CHAVE = 'cookies:escolha';

export function consentimento() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function informarGoogle(escolha) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const valor = escolha === 'aceito' ? 'granted' : 'denied';
  window.gtag('consent', escolha ? 'update' : 'default', {
    ad_storage: valor,
    ad_user_data: valor,
    ad_personalization: valor,
    analytics_storage: valor,
    ...(escolha ? {} : { wait_for_update: 500 }),
  });
}

/** Deve rodar antes de qualquer script do Google. */
export function iniciarConsentimento() {
  informarGoogle(null);
  const escolha = consentimento();
  if (escolha) {
    informarGoogle(escolha);
    return;
  }

  const aviso = document.createElement('div');
  aviso.className = 'aviso-cookies';
  aviso.setAttribute('role', 'region');
  aviso.setAttribute('aria-label', 'Aviso de cookies');
  aviso.innerHTML = `
    <div class="aviso-cookies__interno">
      <p>Usamos cookies para mostrar anúncios, que mantêm o jogo gratuito, e para entender o uso do site.
      Saiba mais na <a href="/privacidade">política de privacidade</a>.</p>
      <div class="aviso-cookies__botoes">
        <button type="button" class="botao botao--secundario" data-escolha="recusado">Recusar</button>
        <button type="button" class="botao" data-escolha="aceito">Aceitar</button>
      </div>
    </div>`;
  aviso.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-escolha]');
    if (!botao) return;
    try { localStorage.setItem(CHAVE, botao.dataset.escolha); } catch { /* segue sem guardar */ }
    informarGoogle(botao.dataset.escolha);
    aviso.remove();
  });
  document.body.append(aviso);
}

/** Permite rever a escolha (link na política de privacidade). */
export function reverConsentimento() {
  try { localStorage.removeItem(CHAVE); } catch { /* nada a fazer */ }
  location.reload();
}
