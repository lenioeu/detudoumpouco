"""Ações coletivas (CNJ/CACOL) ajuizadas por sindicatos em face de grandes empresas.

Uso:
    python3 coletar.py --uf ES --autor SIND --min-processos 10 --saida acoes_sindicatos_ES.xlsx

Autor: Lenio Goularte
"""
import argparse, collections, json, re, csv
from cacol_api import fetch_all, eq, isin, contains

PUBLICO = re.compile(r'\b(MUNIC[IÍ]PIO|ESTADO DO|UNI[AÃ]O\b|PREFEITURA|INSTITUTO NACIONAL|INSS|FAZENDA|SECRETARIA|C[AÂ]MARA|'
                     r'ASSEMBLEIA|TRIBUNAL|MINIST[EÉ]RIO|AUTARQUIA|FUNDO MUNICIPAL|DEPARTAMENTO|IPAJM|DETRAN|'
                     r'UNIVERSIDADE FEDERAL|INSTITUTO FEDERAL|CONSELHO REGIONAL|SINDICATO|SIND\b|FEDERA[CÇ][AÃ]O|ASSOCIA)', re.I)
GRANDE = re.compile(r'(\bS\.?\s?/?\s?A\b|SOCIEDADE AN[OÔ]NIMA|PETROBRAS|\bVALE\b|BANCO|CAIXA ECON[OÔ]MICA|'
                    r'EMPRESA BRASILEIRA|COMPANHIA)', re.I)
LOTE = 400

def mes(v): return f"{str(v)[:4]}-{str(v)[4:]}" if v else ""

def coletar(uf, autor):
    ativos = fetch_all({"f": "tbl_fato", "p": "tbl_partes", "o": "tbl_oj"},
                       [("f", "numero_sigilo"), ("o", "sigla_tribunal"), ("o", "municipio_oj"), ("o", "nome"), ("p", "nome"), ("p", "cnpj")],
                       [eq("o", "uf_oj", uf), eq("p", "tipo", "A"), contains("p", "nome", autor)])
    nums = sorted({r[0] for r in ativos})
    print(f"{len(nums)} processos com '{autor}' no polo ativo em {uf}", flush=True)
    passivos, eventos = [], {}
    for i in range(0, len(nums), LOTE):
        lote = nums[i:i + LOTE]
        passivos += fetch_all({"f": "tbl_fato", "p": "tbl_partes", "c": "Classes"},
                              [("f", "numero_sigilo"), ("f", "tipo"), ("c", "classe"), ("p", "nome"), ("p", "cnpj")],
                              [isin("f", "numero_sigilo", lote), eq("p", "tipo", "P")])
        for flag in ("cn", "julgamento", "arquivamento"):
            for n, d in fetch_all({"f": "tbl_fato", "c": "tbl_calendario"}, [("f", "numero_sigilo"), ("c", "data")],
                                  [isin("f", "numero_sigilo", lote), eq("c", flag, 1)]):
                eventos.setdefault(n, {}).setdefault(flag, []).append(d)
        print(f"  {min(i + LOTE, len(nums))}/{len(nums)}", flush=True)
    return ativos, passivos, eventos

def montar(ativos, passivos, eventos, min_proc):
    proc = {}
    for n, trib, mun, vara, nome, cnpj in ativos:
        p = proc.setdefault(n, {"tribunal": trib, "municipio": mun, "orgao": vara, "autores": set()})
        p["autores"].add(nome)
    linhas = []
    for n, sigla, classe, nome, cnpj in passivos:
        cj = re.sub(r'\D', '', cnpj or '')
        if len(cj) != 14 or PUBLICO.search(nome or ''):
            continue
        p, e = proc[n], eventos.get(n, {})
        linhas.append({
            "numero": n, "ano_numero": n.split('.')[1], "tribunal": p["tribunal"], "orgao_julgador": p["orgao"],
            "municipio": p["municipio"], "tipo_acao": sigla, "classe": classe,
            "sindicato_autor": " | ".join(sorted(p["autores"])), "empresa_re": nome, "cnpj_re": cj, "raiz_cnpj": cj[:8],
            "mes_ajuizamento": mes(min(e["cn"])) if e.get("cn") else "",
            "mes_julgamento": mes(min(e["julgamento"])) if e.get("julgamento") else "",
            "mes_arquivamento": mes(max(e["arquivamento"])) if e.get("arquivamento") else "",
        })
    por_raiz = collections.defaultdict(set)
    for l in linhas: por_raiz[l["raiz_cnpj"]].add(l["numero"])
    for l in linhas:
        l["acoes_da_empresa"] = len(por_raiz[l["raiz_cnpj"]])
        l["criterio"] = ("S.A./estatal" if GRANDE.search(l["empresa_re"]) else "") + \
                        (" + " if GRANDE.search(l["empresa_re"]) and l["acoes_da_empresa"] >= min_proc else "") + \
                        (f">= {min_proc} ações" if l["acoes_da_empresa"] >= min_proc else "")
    return [l for l in linhas if l["criterio"]]

def salvar(linhas, saida, uf, autor, min_proc):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
    linhas.sort(key=lambda l: (-l["acoes_da_empresa"], l["raiz_cnpj"], l["numero"]))
    wb = Workbook(); wb.properties.creator = "Lenio Goularte"
    ws = wb.active; ws.title = "Resumo por empresa"
    emp = collections.OrderedDict()
    for l in linhas:
        g = emp.setdefault(l["raiz_cnpj"], {"nome": collections.Counter(), "proc": set(), "sind": collections.Counter(), "trib": collections.Counter(), "crit": l["criterio"], "anos": []})
        g["nome"][l["empresa_re"]] += 1; g["proc"].add(l["numero"]); g["trib"][l["tribunal"]] += 1
        for s in l["sindicato_autor"].split(" | "): g["sind"][s] += 1
        if l["mes_ajuizamento"]: g["anos"].append(l["numero"])
    cab = ["Empresa ré", "Raiz CNPJ", "Nº de ações", "Critério", "Tribunais", "Sindicato mais frequente", "Ajuizadas desde 2020"]
    ws.append(cab)
    for raiz, g in emp.items():
        ws.append([g["nome"].most_common(1)[0][0], raiz, len(g["proc"]), g["crit"],
                   ", ".join(f"{t} ({c})" for t, c in g["trib"].most_common()), g["sind"].most_common(1)[0][0], len(set(g["anos"]))])
    ws2 = wb.create_sheet("Processos")
    cols = list(linhas[0].keys()); ws2.append(cols)
    for l in linhas: ws2.append([l[c] for c in cols])
    ws3 = wb.create_sheet("Metodologia")
    for t in [f"Fonte: Painel CACOL/CNJ (Power BI público), extraído via API querydata.",
              f"Filtro: UF do órgão julgador = {uf}; polo ativo contém '{autor}'; polo passivo com CNPJ de 14 dígitos, excluídos entes públicos/associações.",
              f"Grande empresa: nome com S.A./estatal/banco/companhia OU >= {min_proc} ações sindicais no recorte (agregado pela raiz do CNPJ).",
              "Mês de ajuizamento/julgamento/arquivamento vem de tbl_calendario (série mensal a partir de 2020-01); processos anteriores ficam em branco.",
              "Autor: Lenio Goularte"]:
        ws3.append([t])
    for w in (ws, ws2):
        for c in w[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="0D3753")
        w.freeze_panes = "A2"; w.auto_filter.ref = w.dimensions
        for i, col in enumerate(w.columns, 1):
            w.column_dimensions[get_column_letter(i)].width = min(60, max(10, max(len(str(c.value or "")) for c in col) + 2))
    ws3.column_dimensions["A"].width = 140
    wb.save(saida)
    with open(saida.rsplit('.', 1)[0] + ".csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";"); w.writeheader(); w.writerows(linhas)
    return emp

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", default="ES"); ap.add_argument("--autor", default="SIND")
    ap.add_argument("--min-processos", type=int, default=10); ap.add_argument("--saida", default="acoes_sindicatos_ES.xlsx")
    a = ap.parse_args()
    linhas = montar(*coletar(a.uf, a.autor), a.min_processos)
    emp = salvar(linhas, a.saida, a.uf, a.autor, a.min_processos)
    print(f"{len({l['numero'] for l in linhas})} processos | {len(emp)} empresas | {a.saida}")
