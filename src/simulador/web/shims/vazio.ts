// node:fs e node:path não existem no navegador; o simulador web nunca usa estas funções.
const indisponivel = () => {
  throw new Error("Indisponível no navegador");
};
export const existsSync = indisponivel;
export const mkdirSync = indisponivel;
export const readFileSync = indisponivel;
export const writeFileSync = indisponivel;
export const dirname = indisponivel;
export default {};
