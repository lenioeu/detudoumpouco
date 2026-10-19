// "Achatar" um PDF: o desenho dos campos de formulário e das anotações (comentários, marca-texto,
// carimbos, desenhos) passa a fazer parte da página, e os objetos editáveis são removidos.
// Recebe o módulo pdf-lib já carregado (ele é baixado só quando a pessoa usa a ferramenta).
// Funciona no navegador e no Node.
import type { PDFDocument, PDFPage } from 'pdf-lib';

type PdfLib = typeof import('pdf-lib');

export interface Analise {
  /** Campos de formulário (caixas de texto, marcações, listas, assinaturas). */
  campos: number;
  /** Campos de assinatura digital já assinados: a assinatura deixa de valer depois de achatar. */
  assinados: number;
  /** Comentários, marca-texto, carimbos, desenhos e outras anotações visíveis. */
  anotacoes: number;
  /** Links clicáveis. Eles ficam como estão. */
  links: number;
}

export interface Opcoes { formulario: boolean; anotacoes: boolean; }

export interface Resultado {
  /** Widgets (a parte visível de cada campo; um grupo de opções tem vários) achatados. */
  camposAchatados: number;
  /** Páginas que mudaram (começando em 1), para mostrar a prévia. */
  paginas: number[];
  anotacoesAchatadas: number;
  /** Anotações sem desenho próprio (o leitor de PDF é que desenha): ficaram como estavam. */
  semAparencia: number;
  /** Campos cujo desenho não pôde ser atualizado com o valor preenchido (letras fora do padrão). */
  camposSemAtualizar: number;
}

const OCULTA = 2, NAO_VER = 32; // bits do /F de uma anotação

function nomes(lib: PdfLib) {
  const N = (s: string) => lib.PDFName.of(s);
  return {
    Annots: N('Annots'), Subtype: N('Subtype'), AP: N('AP'), N: N('N'), AS: N('AS'), Rect: N('Rect'),
    BBox: N('BBox'), Matrix: N('Matrix'), F: N('F'), FT: N('FT'), V: N('V'), Type: N('Type'),
    XObject: N('XObject'), Form: N('Form'), AcroForm: N('AcroForm'), NeedAppearances: N('NeedAppearances'),
    Widget: N('Widget'), Link: N('Link'), Popup: N('Popup'), Sig: N('Sig'), Fields: N('Fields'), Kids: N('Kids'),
  };
}

function numeros(lib: PdfLib, doc: PDFDocument, arr: unknown): number[] | null {
  const a = doc.context.lookup(arr as never);
  if (!(a instanceof lib.PDFArray)) return null;
  const r: number[] = [];
  for (let i = 0; i < a.size(); i++) {
    const n = a.lookup(i);
    if (!(n instanceof lib.PDFNumber)) return null;
    r.push(n.asNumber());
  }
  return r;
}

/** Percorre as anotações de todas as páginas. */
function cadaAnotacao(lib: PdfLib, doc: PDFDocument, fn: (pagina: PDFPage, dict: InstanceType<PdfLib['PDFDict']>, tipo: string) => void) {
  const k = nomes(lib);
  for (const pagina of doc.getPages()) {
    const annots = pagina.node.lookupMaybe(k.Annots, lib.PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i);
      if (!(dict instanceof lib.PDFDict)) continue;
      const sub = dict.lookup(k.Subtype);
      fn(pagina, dict, sub instanceof lib.PDFName ? sub.decodeText() : '');
    }
  }
}

function formularioDoc(lib: PdfLib, doc: PDFDocument) {
  return doc.catalog.lookupMaybe(nomes(lib).AcroForm, lib.PDFDict);
}

export function analisar(lib: PdfLib, doc: PDFDocument): Analise {
  const k = nomes(lib);
  const r: Analise = { campos: 0, assinados: 0, anotacoes: 0, links: 0 };
  if (formularioDoc(lib, doc)) {
    try {
      const campos = doc.getForm().getFields();
      r.campos = campos.length;
      r.assinados = campos.filter((c) => {
        const d = c.acroField.dict;
        return d.lookup(k.FT) === k.Sig && d.lookup(k.V) !== undefined;
      }).length;
    } catch { /* formulário quebrado: conta pelos widgets abaixo */ }
  }
  let widgets = 0;
  cadaAnotacao(lib, doc, (_p, _d, tipo) => {
    if (tipo === 'Widget') widgets++;
    else if (tipo === 'Link') r.links++;
    else if (tipo !== 'Popup') r.anotacoes++;
  });
  if (!r.campos && widgets) r.campos = widgets;
  return r;
}

/** Regera o desenho dos campos que precisam (valor mudou ou o PDF pede para o leitor desenhar). */
async function atualizarAparencias(lib: PdfLib, doc: PDFDocument): Promise<number> {
  const k = nomes(lib);
  const acro = formularioDoc(lib, doc);
  if (!acro) return 0;
  let falhas = 0;
  try {
    const form = doc.getForm();
    const campos = form.getFields();
    const pedeLeitor = acro.lookup(k.NeedAppearances) === lib.PDFBool.True;
    if (pedeLeitor) campos.forEach((c) => form.markFieldAsDirty(c.ref));
    const precisam = campos.filter((c) => c.needsAppearancesUpdate());
    if (!precisam.length) return 0;
    const fonte = await doc.embedFont(lib.StandardFonts.Helvetica);
    for (const c of precisam) {
      try { (c as unknown as { defaultUpdateAppearances(f: unknown): void }).defaultUpdateAppearances(fonte); }
      catch { falhas++; }
    }
  } catch { /* sem formulário legível: usa o desenho que já existe */ }
  return falhas;
}

/** Desenho (XObject) que o leitor mostra para a anotação, ou null se não houver. */
function aparencia(lib: PdfLib, doc: PDFDocument, dict: InstanceType<PdfLib['PDFDict']>) {
  const k = nomes(lib);
  const ap = dict.lookupMaybe(k.AP, lib.PDFDict);
  if (!ap) return null;
  let bruto = ap.get(k.N);
  let n = doc.context.lookup(bruto);
  if (n instanceof lib.PDFDict) {
    // Caixa de marcar ou botão de opção: um desenho por estado; vale o do /AS.
    const estado = dict.lookup(k.AS);
    if (!(estado instanceof lib.PDFName)) return null;
    bruto = n.get(estado);
    n = doc.context.lookup(bruto);
  }
  if (!(n instanceof lib.PDFStream)) return null;
  const ref = bruto instanceof lib.PDFRef ? bruto : doc.context.register(n);
  return { ref, stream: n };
}

/** Desenha a aparência no lugar da anotação, seguindo a regra da especificação (BBox, Matrix e Rect). */
function desenharNaPagina(lib: PdfLib, doc: PDFDocument, pagina: PDFPage, dict: InstanceType<PdfLib['PDFDict']>): boolean {
  const k = nomes(lib);
  const ap = aparencia(lib, doc, dict);
  const rect = numeros(lib, doc, dict.get(k.Rect));
  if (!ap || !rect) return false;
  const bbox = numeros(lib, doc, ap.stream.dict.get(k.BBox));
  if (!bbox) return false;
  const m = numeros(lib, doc, ap.stream.dict.get(k.Matrix)) ?? [1, 0, 0, 1, 0, 0];
  const cantos = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]]
    .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = cantos.map((c) => c[0]), ys = cantos.map((c) => c[1]);
  const bx1 = Math.min(...xs), by1 = Math.min(...ys), bw = Math.max(...xs) - bx1, bh = Math.max(...ys) - by1;
  const rx1 = Math.min(rect[0], rect[2]), ry1 = Math.min(rect[1], rect[3]);
  const rw = Math.abs(rect[2] - rect[0]), rh = Math.abs(rect[3] - rect[1]);
  if (!(bw > 0 && bh > 0 && rw > 0 && rh > 0)) return false;
  const sx = rw / bw, sy = rh / bh;
  if (!ap.stream.dict.has(k.Subtype)) ap.stream.dict.set(k.Subtype, k.Form);
  if (!ap.stream.dict.has(k.Type)) ap.stream.dict.set(k.Type, k.XObject);
  pagina.node.normalize(); // põe o conteúdo original entre q/Q, para o desenho novo não herdar transformações
  const nome = pagina.node.newXObject('Achatado', ap.ref);
  pagina.pushOperators(
    lib.pushGraphicsState(),
    lib.concatTransformationMatrix(sx, 0, 0, sy, rx1 - sx * bx1, ry1 - sy * by1),
    lib.drawObject(nome),
    lib.popGraphicsState(),
  );
  return true;
}

export async function achatar(lib: PdfLib, doc: PDFDocument, opcoes: Opcoes): Promise<Resultado> {
  const k = nomes(lib);
  const r: Resultado = { camposAchatados: 0, paginas: [], anotacoesAchatadas: 0, semAparencia: 0, camposSemAtualizar: 0 };
  if (opcoes.formulario) r.camposSemAtualizar = await atualizarAparencias(lib, doc);

  for (const [indice, pagina] of doc.getPages().entries()) {
    const annots = pagina.node.lookupMaybe(k.Annots, lib.PDFArray);
    if (!annots) continue;
    const ficam: unknown[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const item = annots.get(i);
      const dict = annots.lookup(i);
      if (!(dict instanceof lib.PDFDict)) continue; // referência quebrada: some
      const sub = dict.lookup(k.Subtype);
      const tipo = sub instanceof lib.PDFName ? sub.decodeText() : '';
      const flags = (dict.lookup(k.F) as InstanceType<PdfLib['PDFNumber']> | undefined)?.asNumber?.() ?? 0;
      const escondida = (flags & OCULTA) !== 0 || (flags & NAO_VER) !== 0;
      const ehCampo = tipo === 'Widget';
      const alvo = ehCampo ? opcoes.formulario : opcoes.anotacoes && tipo !== 'Link';
      if (!alvo) { ficam.push(item); continue; }
      if (tipo === 'Popup') continue; // a janelinha do comentário: o comentário em si é achatado
      if (escondida) { if (ehCampo) r.camposAchatados++; continue; }
      const desenhou = desenharNaPagina(lib, doc, pagina, dict);
      if (ehCampo) r.camposAchatados++; // campo sem desenho (vazio) simplesmente some
      else if (desenhou) r.anotacoesAchatadas++;
      else { r.semAparencia++; ficam.push(item); }
    }
    if (ficam.length !== annots.size()) r.paginas.push(indice + 1);
    if (ficam.length) pagina.node.set(k.Annots, doc.context.obj(ficam as never[]));
    else pagina.node.delete(k.Annots);
  }
  if (opcoes.formulario) doc.catalog.delete(k.AcroForm);
  return r;
}
