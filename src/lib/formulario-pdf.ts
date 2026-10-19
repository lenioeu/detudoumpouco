// Contas e gravação do "Criar formulário PDF". Sem nada do navegador: as funções recebem o
// pdf-lib já carregado, para que a página só baixe a biblioteca quando a pessoa salvar.
// Coordenadas "de tela" em pontos, com origem no canto superior esquerdo da página como aparece
// (as mesmas do Editar PDF, veja src/lib/editor-pdf.ts).
import type { PDFDocument, PDFField, PDFFont, PDFPage } from 'pdf-lib';
import { ENTRELINHA, FONTES, normalizarGiro, retanguloParaPdf, telaParaPdf, textoSuportado, type GeometriaPagina } from './editor-pdf';

type PdfLib = typeof import('pdf-lib');

export type TipoCampo = 'texto' | 'marcar' | 'opcao' | 'lista' | 'data' | 'rotulo';

/** Um item colocado na página. Todos os tipos usam o mesmo formato; cada um usa só o que precisa. */
export interface Campo {
  id: number;
  tipo: TipoCampo;
  pagina: number;
  x: number; y: number; w: number; h: number;
  /** Nome do campo no PDF (no grupo de opções, o nome do grupo). O rótulo não tem nome. */
  nome: string;
  obrigatorio: boolean;
  /** Tamanho da letra; 0 = automático (o leitor de PDF ajusta à caixa). */
  tamanho: number;
  /** Texto já preenchido (texto e data), opção já escolhida (lista) ou o texto do rótulo. */
  valor: string;
  multilinha: boolean;
  /** Máximo de caracteres; 0 = sem limite. */
  limite: number;
  /** Caixa de marcar ou opção já marcada. */
  marcado: boolean;
  /** Opções da lista. */
  opcoes: string[];
  /** Valor desta opção dentro do grupo. */
  opcao: string;
  /** Opções com o mesmo grupo formam um só campo (só uma pode ser marcada). */
  grupo: number;
  /** Texto escrito ao lado da caixa de marcar. */
  legenda: string;
  /** Opção: escreve o valor ao lado da bolinha. Data: escreve "dd/mm/aaaa" embaixo. */
  escrever: boolean;
  negrito: boolean;
}

export const NOMES_TIPO: Record<TipoCampo, string> = {
  texto: 'Texto', marcar: 'Caixa de marcar', opcao: 'Opções', lista: 'Lista', data: 'Data', rotulo: 'Rótulo',
};

/** Primeira palavra dos nomes criados automaticamente ("Texto 1", "Caixa 2"...). */
const BASE_NOME: Record<TipoCampo, string> = {
  texto: 'Texto', marcar: 'Caixa', opcao: 'Escolha', lista: 'Lista', data: 'Data', rotulo: '',
};

export const DICA_DATA = 'dd/mm/aaaa';
export const LIMITE_NOME = 60;
/** Lado da caixa de marcar e da bolinha das opções, em pontos. */
export const LADO_MARCAR = 14;
/** Distância entre as opções de um grupo, uma embaixo da outra. */
export const PASSO_OPCAO = 22;

/** Tamanho padrão de cada tipo quando a pessoa só toca na página (sem arrastar). */
export function tamanhoPadrao(tipo: TipoCampo, multilinha = false): { w: number; h: number } {
  switch (tipo) {
    case 'texto': return multilinha ? { w: 260, h: 72 } : { w: 200, h: 22 };
    case 'data': return { w: 90, h: 22 };
    case 'lista': return { w: 160, h: 22 };
    case 'marcar': case 'opcao': return { w: LADO_MARCAR, h: LADO_MARCAR };
    case 'rotulo': return { w: 60, h: 14 };
  }
}

/**
 * Limpa o nome digitado: sem espaços sobrando, sem ponto (no PDF o ponto separa "pai.filho"
 * e criaria um campo dentro de outro) e com no máximo LIMITE_NOME caracteres.
 */
export function limparNome(nome: string): string {
  return nome.replace(/[.\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME).trim();
}

/** Compara nomes como os leitores de PDF: sem diferença de maiúsculas e espaços nas pontas. */
export const chaveNome = (nome: string) => nome.trim().toLowerCase();

/** Próximo nome livre do tipo: "Texto 1", "Texto 2"... */
export function proximoNome(tipo: TipoCampo, usados: Iterable<string>): string {
  const base = BASE_NOME[tipo] || 'Campo';
  const set = new Set(Array.from(usados, chaveNome));
  let n = 1;
  while (set.has(chaveNome(`${base} ${n}`))) n++;
  return `${base} ${n}`;
}

/** Nome livre a partir de um nome que já existe: "Nome" vira "Nome 2", "Nome 2" vira "Nome 3". */
export function nomeDaCopia(nome: string, usados: Iterable<string>): string {
  const set = new Set(Array.from(usados, chaveNome));
  const m = /^(.*?)\s*(\d+)$/.exec(nome.trim());
  const base = (m ? m[1] : nome.trim()) || 'Campo';
  let n = m ? Number(m[2]) + 1 : 2;
  while (set.has(chaveNome(`${base} ${n}`))) n++;
  return limparNome(`${base} ${n}`);
}

/** Valor livre para uma opção nova num grupo: "Opção 3". */
export function proximaOpcao(valores: Iterable<string>): string {
  const set = new Set(Array.from(valores, chaveNome));
  let n = 1;
  while (set.has(chaveNome(`Opção ${n}`))) n++;
  return `Opção ${n}`;
}

/** Opções da lista digitadas uma por linha: sem linhas vazias e sem repetir. */
export function lerOpcoes(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const o = linha.replace(/\s+/g, ' ').trim();
    if (!o || vistas.has(o)) continue;
    vistas.add(o);
    saida.push(o);
  }
  return saida;
}

/**
 * Problemas que impedem salvar, por id do campo: nome vazio, nome repetido (entre os campos novos
 * ou com um campo que o PDF já tinha), opção repetida num grupo e lista sem opções.
 * As opções de um mesmo grupo dividem o nome de propósito e não contam como repetidas.
 */
export function problemasDosCampos(campos: Campo[], nomesExistentes: Iterable<string>): Map<number, string> {
  const problemas = new Map<number, string>();
  const existentes = new Set(Array.from(nomesExistentes, chaveNome));
  // Um "dono" por nome: o id do campo ou "g<grupo>" para as opções.
  const donos = new Map<string, Set<string>>();
  for (const c of campos) {
    if (c.tipo === 'rotulo') continue;
    const k = chaveNome(c.nome);
    if (!k) continue;
    const dono = c.tipo === 'opcao' ? `g${c.grupo}` : `c${c.id}`;
    if (!donos.has(k)) donos.set(k, new Set());
    donos.get(k)!.add(dono);
  }
  const opcoesPorGrupo = new Map<number, Map<string, number>>();
  for (const c of campos) {
    if (c.tipo === 'rotulo') {
      if (!c.valor.trim()) problemas.set(c.id, 'O rótulo está sem texto.');
      continue;
    }
    const k = chaveNome(c.nome);
    if (!k) { problemas.set(c.id, 'Dê um nome a este campo.'); continue; }
    if (existentes.has(k)) { problemas.set(c.id, `O PDF já tem um campo chamado "${c.nome.trim()}". Escolha outro nome.`); continue; }
    if ((donos.get(k)?.size ?? 0) > 1) { problemas.set(c.id, `Há mais de um campo chamado "${c.nome.trim()}". Cada campo precisa de um nome só dele.`); continue; }
    if (c.tipo === 'lista' && !c.opcoes.length) { problemas.set(c.id, 'Escreva pelo menos uma opção para a lista.'); continue; }
    if (c.tipo === 'opcao') {
      const v = chaveNome(c.opcao);
      if (!v) { problemas.set(c.id, 'Dê um nome a esta opção.'); continue; }
      if (!opcoesPorGrupo.has(c.grupo)) opcoesPorGrupo.set(c.grupo, new Map());
      const m = opcoesPorGrupo.get(c.grupo)!;
      if (m.has(v)) {
        problemas.set(c.id, `Este grupo já tem uma opção "${c.opcao.trim()}".`);
        problemas.set(m.get(v)!, `Este grupo já tem uma opção "${c.opcao.trim()}".`);
      } else m.set(v, c.id);
    }
  }
  return problemas;
}

/**
 * O pdf-lib recebe x, y, largura e altura "antes do giro" e soma a espessura da borda.
 * Esta conta faz o contrário: a partir do retângulo que a caixa deve ocupar no PDF
 * (`r`, já com a borda), devolve as opções que levam exatamente a ele.
 */
export function opcoesDoWidget(r: { x: number; y: number; largura: number; altura: number }, borda: number, giro: number) {
  const b = borda / 2;
  const W = r.largura, H = r.altura;
  switch (normalizarGiro(giro)) {
    case 90: return { x: r.x + W - b, y: r.y + b, width: H - borda, height: W - borda };
    case 180: return { x: r.x + W - b, y: r.y + H - b, width: W - borda, height: H - borda };
    case 270: return { x: r.x + b, y: r.y + H - b, width: H - borda, height: W - borda };
    default: return { x: r.x + b, y: r.y + b, width: W - borda, height: H - borda };
  }
}

/** Tamanho da letra do texto escrito ao lado das caixas e opções. */
export const tamanhoLegenda = (h: number) => Math.round(Math.min(Math.max(h * 0.8, 8), 14) * 2) / 2;
/** Tamanho da letra da dica "dd/mm/aaaa" embaixo da data. */
export const TAMANHO_DICA = 7;

/** Texto desenhado na página (rótulos, legendas e a dica da data), em coordenadas de tela. */
export interface TextoNaPagina { pagina: number; x: number; y: number; texto: string; tamanho: number; negrito: boolean; cinza: boolean; }

/** Tudo o que é escrito na página além dos campos. `y` é o topo da primeira linha. */
export function textosDaPagina(campos: Campo[]): TextoNaPagina[] {
  const saida: TextoNaPagina[] = [];
  for (const c of campos) {
    if (c.tipo === 'rotulo') {
      if (c.valor.trim()) saida.push({ pagina: c.pagina, x: c.x, y: c.y, texto: c.valor, tamanho: c.tamanho || 12, negrito: c.negrito, cinza: false });
    } else if ((c.tipo === 'marcar' && c.legenda.trim()) || (c.tipo === 'opcao' && c.escrever && c.opcao.trim())) {
      const t = tamanhoLegenda(c.h);
      const texto = (c.tipo === 'marcar' ? c.legenda : c.opcao).replace(/\s+/g, ' ').trim();
      saida.push({ pagina: c.pagina, x: c.x + c.w + 4, y: c.y + c.h / 2 - (t * ENTRELINHA) / 2, texto, tamanho: t, negrito: false, cinza: false });
    } else if (c.tipo === 'data' && c.escrever) {
      saida.push({ pagina: c.pagina, x: c.x + 1, y: c.y + c.h + 1, texto: DICA_DATA, tamanho: TAMANHO_DICA, negrito: false, cinza: true });
    }
  }
  return saida;
}

export interface OpcoesGravar {
  /** Borda cinza nos campos de texto, data e lista (caixas e opções sempre têm borda). */
  borda: boolean;
}

/**
 * Cria os campos no PDF com o pdf-lib, já com as aparências desenhadas (assim o formulário
 * aparece igual no Chrome, no Acrobat, no Visualizador do Mac e nos leitores de celular).
 * `geometrias` tem uma entrada por página do `doc`. Devolve quantos caracteres que a fonte
 * padrão não tem foram trocados. Salve depois com `doc.save({ updateFieldAppearances: false })`. Os nomes precisam ter sido conferidos com problemasDosCampos.
 */
export async function gravarCampos(lib: PdfLib, doc: PDFDocument, geometrias: GeometriaPagina[], campos: Campo[], op: OpcoesGravar): Promise<{ trocados: number; campos: number }> {
  const { rgb, degrees, grayscale, PDFName, PDFString, PDFHexString, StandardFonts, pushGraphicsState, popGraphicsState } = lib;
  const form = doc.getForm();
  const paginas = doc.getPages();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  let negrito: PDFFont | null = null;
  const tem = new Set(fonte.getCharacterSet());
  let trocados = 0;
  const limpo = (s: string) => { const r = textoSuportado(s, (cp) => tem.has(cp)); trocados += r.trocados; return r.texto; };
  const umaLinha = (s: string) => limpo(s).replace(/\n+/g, ' ');

  const cinza = rgb(0.45, 0.47, 0.52);
  const preto = rgb(0, 0, 0);
  const aparencia = (c: Campo, comBorda: boolean) => {
    const g = geometrias[c.pagina];
    const bw = comBorda ? 1 : 0;
    const r = retanguloParaPdf(g, c.x, c.y, c.w, c.h);
    return {
      ...opcoesDoWidget(r, bw, g.giro),
      rotate: degrees(normalizarGiro(g.giro)),
      borderWidth: bw,
      borderColor: comBorda ? cinza : undefined,
      backgroundColor: undefined,
      textColor: preto,
      font: fonte,
    };
  };
  const dica = (nome: string) => PDFHexString.fromText(nome);
  const padrao = (campo: PDFField, valor: string) => {
    if (valor) campo.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText(valor));
  };
  const criados: { needsAppearancesUpdate(): boolean; defaultUpdateAppearances(f: PDFFont): void }[] = [];

  // Opções do mesmo grupo viram um só campo, na ordem em que aparecem.
  const grupos = new Map<number, Campo[]>();
  for (const c of campos) {
    if (c.tipo !== 'opcao') continue;
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo)!.push(c);
  }

  for (const c of campos) {
    const pg = paginas[c.pagina];
    if (!pg || !geometrias[c.pagina]) continue;
    const nome = limparNome(c.nome);
    if (c.tipo === 'texto' || c.tipo === 'data') {
      const t = form.createTextField(nome);
      const data = c.tipo === 'data';
      if (c.multilinha && !data) t.enableMultiline();
      const limite = data ? 10 : c.limite;
      if (limite > 0) t.setMaxLength(limite);
      if (c.obrigatorio) t.enableRequired();
      t.addToPage(pg, aparencia(c, op.borda));
      if (c.tamanho > 0) t.setFontSize(c.tamanho);
      let v = c.multilinha && !data ? limpo(c.valor) : umaLinha(c.valor);
      if (limite > 0) v = v.slice(0, limite);
      if (v) { t.setText(v); padrao(t, v); }
      t.acroField.dict.set(PDFName.of('TU'), dica(data ? `${nome} (${DICA_DATA})` : nome));
      if (data) {
        // Acrobat e Foxit formatam e conferem a data; os outros leitores ignoram e aceitam o texto.
        const js = (s: string) => doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of(s) });
        t.acroField.dict.set(PDFName.of('AA'), doc.context.obj({
          K: js('AFDate_KeystrokeEx("dd/mm/yyyy");'),
          F: js('AFDate_FormatEx("dd/mm/yyyy");'),
        }));
      }
      criados.push(t);
    } else if (c.tipo === 'marcar') {
      const cb = form.createCheckBox(nome);
      if (c.obrigatorio) cb.enableRequired();
      cb.addToPage(pg, aparencia(c, true));
      if (c.marcado) cb.check();
      cb.acroField.dict.set(PDFName.of('TU'), dica(c.legenda.trim() || nome));
      criados.push(cb);
    } else if (c.tipo === 'lista') {
      const d = form.createDropdown(nome);
      const opcoes = Array.from(new Set(c.opcoes.map(umaLinha).map((s) => s.trim()).filter(Boolean)));
      d.addOptions(opcoes);
      if (c.obrigatorio) d.enableRequired();
      d.addToPage(pg, aparencia(c, op.borda));
      if (c.tamanho > 0) d.setFontSize(c.tamanho);
      const v = umaLinha(c.valor).trim();
      if (v && opcoes.includes(v)) d.select(v);
      d.acroField.dict.set(PDFName.of('TU'), dica(nome));
      criados.push(d);
    } else if (c.tipo === 'opcao') {
      const membros = grupos.get(c.grupo);
      if (!membros || membros[0] !== c) continue; // o grupo é criado na primeira opção
      const rg = form.createRadioGroup(nome);
      let marcada = '';
      for (const m of membros) {
        if (!paginas[m.pagina] || !geometrias[m.pagina]) continue;
        const valor = umaLinha(m.opcao).trim();
        rg.addOptionToPage(valor, paginas[m.pagina], aparencia(m, true));
        if (m.marcado && !marcada) marcada = valor;
      }
      if (membros.some((m) => m.obrigatorio)) rg.enableRequired();
      if (marcada) rg.select(marcada);
      rg.acroField.dict.set(PDFName.of('TU'), dica(nome));
      criados.push(rg);
    }
  }

  // Rótulos, legendas e a dica da data: texto comum desenhado na página.
  const textos = textosDaPagina(campos);
  const isoladas = new Set<number>();
  const isolar = (pg: PDFPage, i: number) => {
    // O conteúdo original vai entre q e Q: um ajuste de posição esquecido no PDF não desloca o texto novo.
    if (isoladas.has(i)) return;
    isoladas.add(i);
    const p = pg as unknown as { createContentStream: (...ops: unknown[]) => unknown };
    pg.node.normalize();
    const ini = doc.context.register(p.createContentStream(pushGraphicsState()) as never);
    const fim = doc.context.register(p.createContentStream(popGraphicsState()) as never);
    pg.node.wrapContentStreams(ini, fim);
  };
  for (const t of textos) {
    const pg = paginas[t.pagina];
    const g = geometrias[t.pagina];
    if (!pg || !g) continue;
    isolar(pg, t.pagina);
    let f = fonte;
    if (t.negrito) f = negrito ??= await doc.embedFont(StandardFonts.HelveticaBold);
    const texto = limpo(t.texto);
    texto.split('\n').forEach((linha, n) => {
      if (!linha.trim()) return;
      const [x, y] = telaParaPdf(g, t.x, t.y + t.tamanho * (FONTES.helvetica.base + n * ENTRELINHA));
      pg.drawText(linha, { x, y, size: t.tamanho, font: f, color: t.cinza ? grayscale(0.45) : preto, rotate: degrees(normalizarGiro(g.giro)) });
    });
  }
  // Redesenha só os campos novos, com a fonte já embutida. Os campos que o PDF já tinha ficam
  // como vieram: salve com { updateFieldAppearances: false } para o pdf-lib não mexer neles.
  for (const f of criados) if (f.needsAppearancesUpdate()) f.defaultUpdateAppearances(fonte);
  return { trocados, campos: criados.length };
}
