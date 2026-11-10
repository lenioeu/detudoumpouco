# Fontes da marca nos PDFs

Newsreader (400, 600 e 600 itálico) e IBM Plex Mono (500), do design system do DeAcordo, em TTF.
Licença SIL Open Font License 1.1 (arquivos `OFL-*.txt`).

O `IBMPlexMono_500Medium.ttf` foi regravado com o fontTools (`TTFont(...).save(...)`, sem mudar os desenhos):
o arquivo original guarda o espaço de um jeito que faz o `@pdf-lib/fontkit` falhar ao embutir a fonte.
