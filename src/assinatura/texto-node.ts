// Leitor de texto do PDF no servidor, com o pdf.js (versão "legacy", feita para o Node).
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { criarLeitorDeTexto, type PdfJs } from "./linhas.js";

export const lerTextoDoPdf = criarLeitorDeTexto(pdfjs as unknown as PdfJs);
