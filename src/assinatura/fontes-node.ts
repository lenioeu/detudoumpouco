import { readFileSync } from "node:fs";
import type { FontesDaMarca } from "./pagina.js";

/** Lê do disco as fontes da marca (Newsreader e IBM Plex Mono, licença OFL) usadas nos PDFs. */
export function carregarFontesDaMarca(): FontesDaMarca {
  const ler = (nome: string) => new Uint8Array(readFileSync(new URL(`./fontes/${nome}`, import.meta.url)));
  return {
    texto: ler("Newsreader_400Regular.ttf"),
    negrito: ler("Newsreader_600SemiBold.ttf"),
    italico: ler("Newsreader_600SemiBold_Italic.ttf"),
    mono: ler("IBMPlexMono_500Medium.ttf"),
  };
}
