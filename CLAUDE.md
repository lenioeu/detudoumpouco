# Família de jogos diários

Cinco sites de jogos diários, em português do Brasil, com a mesma identidade visual e monetizados com anúncios. Cada site tem domínio próprio; todos ficam neste repositório e compartilham uma base comum.

Protótipo visual aprovado (canvas): https://claude.ai/artifact/5wsDFRcTPaaGp9Zfr43jJc

## Os sites

| Jogo | Domínio | Cor principal | Mecânica |
|---|---|---|---|
| Dito e Feito | ditoefeito.app | Terracota `#C2410C` | Completar um ditado popular com palavras escondidas |
| Quanto Custava? | quantocustava.app | Verde `#15803D` | 10 rodadas: qual item era mais caro, em valores de hoje (corrigidos pelo IPCA) |
| Tá na Cara | tanacara.app | Roxo `#7C3AED` | "Quem sou eu?": 5 pistas progressivas sobre um brasileiro famoso |
| Bate e Volta | bateevolta.app | Azul `#1D4ED8` | Ir de uma cidade a outra passando só por municípios vizinhos |
| Escadinha | escadinha.app | Magenta `#BE185D` | Transformar uma palavra em outra trocando uma letra por vez |

Os nomes seguem o padrão de expressões populares brasileiras.

## Identidade visual

**Igual em todos os sites; só muda a cor principal.**

- Fontes: **Bricolage Grotesque** (títulos, nomes, números) e **Figtree** (textos e botões), pelo Google Fonts.
- Cores comuns: papel `#F7F4EE` (fundo), tinta `#1F2630` (texto, traços e sombras), grafite `#5C5A55` (texto secundário), linha `#E4DED3`.
- Estilo "menos IA", como cartaz impresso:
  - traço grosso de 2 px em tinta;
  - sombra chapada sem desfoque (`4px 4px 0 #1F2630`);
  - cantos quase retos (6 a 8 px);
  - ilustrações sólidas;
  - nada de rótulos miúdos em caixa alta com letras espaçadas, nem gradientes ou emoji.
- **Logos de cor única** (a cor do jogo). Os detalhes internos são vazados na cor do fundo. No favicon, simplificar até o rosto ou desenho continuar reconhecível em 32 px.
- Contraste mínimo de 4,5:1 nos textos; botões e áreas de toque com pelo menos 44 px.

Logos aprovadas em `marca/`:
- `marca/quanto-custava/`: moedas, seta subindo e etiqueta com "R$", em verde.
- `marca/ta-na-cara/`: mascote caricato com cabelo cacheado, cabeça inclinada, sobrancelhas grossas, narigão, bigodão e um "?" refletido em cada lente dos óculos escuros, em roxo.

Dito e Feito, Bate e Volta e Escadinha ainda não têm logo final; os selos provisórios estão no canvas.

## Estrutura das telas (comum aos 5 jogos)

- Cabeçalho: selo, nome do jogo, sequência atual (chama + número), ranking (fase 2) e "como jogar".
- Espaço de anúncio no topo, afastado dos botões.
- Jogo do dia, com número e data ("Jogo nº 12 · 19 de outubro").
- Botão "Ver uma dica · assistir anúncio".
- Rodapé "Outros jogos da família", com links para os outros quatro sites.
- Tela de resultado: placar, sequência ("12 dias seguidos", a semana marcada e o recorde), compartilhar, contagem para o próximo jogo e anúncio no fim da página.
- Painel "Seu progresso":
  - jogos jogados, média, dias seguidos (destacado) e melhor sequência;
  - gráfico de distribuição, com o resultado de hoje destacado.

## Regras do jogo

- Um desafio por dia, igual para todos, com a virada à meia-noite de Brasília (`America/Sao_Paulo`).
- **A sequência conta dias jogados** (não só os dias com bom resultado). Pular um dia zera a sequência.
- Dica por anúncio:
  - uma dica por rodada, sempre por escolha do jogador;
  - usar dica não zera a sequência, mas vale metade dos pontos;
  - se nenhum anúncio carregar, a dica é liberada mesmo assim.
- Ideia aprovada para depois: recuperar a sequência perdida assistindo a um anúncio.
- O compartilhamento gera um texto com o resultado e o link, sem revelar a resposta.

## Monetização (o site precisa estar adequado desde o início)

- AdSense para banners. Anúncios de recompensa (dica e sequência) via Google Ad Manager; alternativas: AdinPlay e Venatus.
- Regras que nunca podem ser quebradas:
  - nenhum anúncio colado em botões ou teclado;
  - nenhum anúncio dentro de janelas ou modais;
  - nunca pedir para clicar em anúncio.
- Cada site precisa ter:
  - páginas Sobre, Privacidade, Termos e Contato;
  - textos próprios de "como jogar" e curiosidades (o AdSense recusa sites só com jogo);
  - arquivo `ads.txt`;
  - aviso de cookies com CMP certificado (o "Privacidade e mensagens" do Google), por causa da LGPD.
- Tráfego orgânico: uma página por desafio passado ("resposta de hoje"), publicada depois que o dia vira.

## Arquitetura planejada

- Base compartilhada em `core/`: estilos, cabeçalho, rodapé, sequência e progresso, compartilhar, sorteio do desafio do dia, anúncios e aviso de cookies.
- Um diretório por site em `sites/<nome>/`, contendo só o jogo, a cor e o conteúdo.
- Sites estáticos publicados separadamente (Cloudflare Pages), cada um no seu domínio. Os domínios `.app` exigem HTTPS.
- **Ranking fica para a fase 2**, mas a base já deve prever um servidor:
  - Cloudflare Workers + D1;
  - a resposta fica no servidor, que confere o palpite, para evitar trapaça;
  - identificação por apelido sem cadastro e, depois, login opcional com Google;
  - ranking semanal (segunda a domingo, fechando às 23h59 de Brasília), mensal e geral, mais ligas de amigos;
  - primeiro um ranking por site; o ranking da família inteira vem depois.

## Ordem de trabalho

1. Montar a base compartilhada e o primeiro site.
2. Uma sessão nova para cada site seguinte, sempre neste repositório.

## Convenções

- Todo texto voltado ao jogador é em português do Brasil.
- Conteúdo factual (preços, pistas, cidades vizinhas) precisa de fonte verificável. Não inventar dados.
- O mascote do Tá na Cara é um "famoso genérico" e não deve lembrar uma pessoa real.
