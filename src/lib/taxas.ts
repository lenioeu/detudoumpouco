// Taxas oficiais do dia, buscadas no navegador de quem usa a calculadora.
// Nenhum dado da pessoa é enviado: só pedimos as séries públicas.
//
// Fonte principal: SGS do Banco Central (api.bcb.gov.br)
//   432  = Selic meta (% ao ano)
//   4389 = CDI anualizado base 252 (% ao ano)
//   226  = TR (% ao mês)
// Reserva para Selic e CDI: BrasilAPI (brasilapi.com.br/api/taxas/v1)

export interface Taxas {
  selicMeta?: number;
  cdi?: number;
  tr?: number;
  /** Data mais recente entre as séries lidas, como veio da fonte ("16/10/2026"). */
  data?: string;
  fonte: string;
}

export interface PontoSgs { data: string; valor: string; datafim?: string }

/** Lê a resposta do SGS (lista de pontos) e devolve o último valor numérico. */
export function lerSgs(json: unknown): { valor: number; data: string } | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const p = json[json.length - 1] as PontoSgs;
  const valor = Number(String(p?.valor).replace(',', '.'));
  if (!Number.isFinite(valor) || typeof p?.data !== 'string') return null;
  return { valor, data: p.data };
}

/** Lê a resposta da BrasilAPI ({ nome, valor }). */
export function lerBrasilApi(json: unknown): number | null {
  const v = Number((json as { valor?: unknown })?.valor);
  return Number.isFinite(v) ? v : null;
}

/** Confere se o valor está numa faixa plausível, para não usar lixo de uma API com problema. */
export const plausivel = {
  selic: (v: number) => v > 0 && v < 50,
  cdi: (v: number) => v > 0 && v < 50,
  tr: (v: number) => v >= 0 && v < 2,
};

async function pegar(url: string, ms = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const sgs = (serie: number) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`;

const CHAVE = 'qg-taxas-v1';
const VALIDADE = 6 * 60 * 60 * 1000; // 6 horas

/** Busca as taxas do dia. Usa cache de 6 horas no navegador. Nunca lança erro: devolve null se nada deu certo. */
export async function buscarTaxas(): Promise<Taxas | null> {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (c && Date.now() - c.em < VALIDADE) return c.taxas as Taxas;
  } catch { /* sem cache */ }

  const [selic, cdi, tr] = await Promise.allSettled([pegar(sgs(432)), pegar(sgs(4389)), pegar(sgs(226))]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  const s = lerSgs(ok(selic)), c = lerSgs(ok(cdi)), t = lerSgs(ok(tr));

  const taxas: Taxas = { fonte: 'Banco Central do Brasil' };
  if (s && plausivel.selic(s.valor)) { taxas.selicMeta = s.valor; taxas.data = s.data; }
  if (c && plausivel.cdi(c.valor)) { taxas.cdi = c.valor; taxas.data ??= c.data; }
  if (t && plausivel.tr(t.valor)) { taxas.tr = t.valor; taxas.data ??= t.data; }

  // Reserva para Selic e CDI
  if (taxas.selicMeta === undefined || taxas.cdi === undefined) {
    const [bs, bc] = await Promise.allSettled([
      pegar('https://brasilapi.com.br/api/taxas/v1/selic'),
      pegar('https://brasilapi.com.br/api/taxas/v1/cdi'),
    ]);
    const vs = lerBrasilApi(ok(bs)), vc = lerBrasilApi(ok(bc));
    let usou = false;
    if (taxas.selicMeta === undefined && vs !== null && plausivel.selic(vs)) { taxas.selicMeta = vs; usou = true; }
    if (taxas.cdi === undefined && vc !== null && plausivel.cdi(vc)) { taxas.cdi = vc; usou = true; }
    if (usou) taxas.fonte = taxas.data ? 'Banco Central do Brasil e BrasilAPI' : 'BrasilAPI (dados do Banco Central)';
  }

  if (taxas.selicMeta === undefined && taxas.cdi === undefined && taxas.tr === undefined) return null;
  try { localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), taxas })); } catch { /* sem cache */ }
  return taxas;
}
