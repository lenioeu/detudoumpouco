// Desenha uma página de PDF num canvas que aceita transparência (para PNG com fundo transparente).
// O pdf.js cria o canvas sem canal alfa quando recebe só o elemento; aqui o contexto já vai pronto,
// com alfa, e o fundo pintado é invisível. Mesmo limite de memória de desenharPagina().
import { AREA_MAXIMA_CANVAS, type DocumentoPdfJs } from './pdf-navegador';

export async function desenharComTransparencia(
  doc: DocumentoPdfJs,
  numero: number,
  escala: number,
): Promise<{ canvas: HTMLCanvasElement; reduzida: boolean }> {
  const pagina = await doc.getPage(numero);
  let viewport = pagina.getViewport({ scale: escala });
  let reduzida = false;
  const area = Math.floor(viewport.width) * Math.floor(viewport.height);
  if (area > AREA_MAXIMA_CANVAS) {
    viewport = pagina.getViewport({ scale: escala * Math.sqrt(AREA_MAXIMA_CANVAS / area) * 0.99 });
    reduzida = true;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const canvasContext = canvas.getContext('2d', { alpha: true })!;
  await pagina.render({ canvas, canvasContext, viewport, background: 'rgba(0,0,0,0)' }).promise;
  pagina.cleanup();
  return { canvas, reduzida };
}
