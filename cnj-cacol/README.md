# Painel CACOL/CNJ — engenharia reversa da API

Autor: Lenio Goularte

O painel <https://justica-em-numeros.cnj.jus.br/painel-cacol/> é só um `<iframe>` de um relatório
Power BI "publicar na web". Os dados vêm de uma API pública, sem login.

## Identificadores

| Item | Valor |
|---|---|
| Resource key (`k`) | `e22eb4f9-1361-4989-a8ec-47829641f410` |
| Tenant (`t`) | `ad9190e6-c45d-4600-bc5c-eca554ccf497` |
| Cluster | `https://wabi-us-east-a-primary-api.analysis.windows.net` |
| modelId | `4419008` |
| DatasetId | `98b7933f-1a49-4b33-be55-5be6a58fc427` |
| ReportId | `944470ff-3098-4a16-b6e6-e6647366b178` |

Todos os pedidos levam o cabeçalho `X-PowerBI-ResourceKey: <k>`.

## Endpoints

- `GET  /public/reports/{k}/modelsAndExploration?preferReadOnlySession=true`: metadados, páginas, IDs.
- `POST /public/reports/conceptualschema` `{"modelIds":[4419008]}`: tabelas e colunas.
- `POST /public/reports/querydata?synchronous=true`: consulta (SemanticQuery → DSR comprimido).

## Tabelas úteis (aba "Ações Coletivas (CNJ)")

| Tabela | Campos |
|---|---|
| `tbl_fato` | `numero_sigilo` (nº CNJ), `tipo` (ACP, ACC, ACUMPR, AP, MSC, Outros), `procedimento`, `formato`, `sigla_grau` |
| `tbl_partes` | `tipo` (`A` ativo / `P` passivo), `nome`, `cnpj` |
| `tbl_oj` | `uf_oj`, `sigla_tribunal`, `ramo_justica`, `municipio_oj`, `nome` (órgão julgador) |
| `Classes` / `Assuntos` | classe e árvore de assuntos (TPU) |
| `tbl_calendario` | série mensal desde 2020-01 por processo: `data` (AAAAMM), `cn` (caso novo), `julgamento`, `arquivamento`, `pend` |

As relações já existem no modelo: basta pôr as tabelas no `From` e filtrar no `Where`.
Literais: texto `'ES'`, inteiro `1L`.

## Uso

```bash
python3 coletar.py --uf ES --autor SIND --min-processos 10 --saida acoes_sindicatos_ES.xlsx
```

Parâmetros:
- `--uf`: UF do órgão julgador.
- `--autor`: trecho do nome no polo ativo.
- `--min-processos`: limite de ações para considerar "grande empresa" quando o nome não indica S.A./estatal.

Critério de "grande empresa": réu com CNPJ de 14 dígitos que não seja ente público nem associação, **e**
(nome com S.A./estatal/banco/companhia **ou** pelo menos N ações sindicais no recorte, agregadas pela raiz do CNPJ).
O painel não informa o porte pela Receita.
