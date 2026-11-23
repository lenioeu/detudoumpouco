"""Cliente da API pública (Power BI "publicar na web") do Painel CACOL/CNJ.

Painel: https://justica-em-numeros.cnj.jus.br/painel-cacol/
Autor: Lenio Goularte
"""
import json, urllib.request, gzip
BASE="https://wabi-us-east-a-primary-api.analysis.windows.net/public/reports"
KEY="e22eb4f9-1361-4989-a8ec-47829641f410"; MODEL=4419008
DS="98b7933f-1a49-4b33-be55-5be6a58fc427"; REPORT="944470ff-3098-4a16-b6e6-e6647366b178"

def col(alias, prop): return {"Column":{"Expression":{"SourceRef":{"Source":alias}},"Property":prop}}
def lit(v): return {"Literal":{"Value":"'"+v.replace("'","''")+"'" if isinstance(v,str) else (str(v)+"L" if isinstance(v,int) else str(v))}}
def eq(alias,prop,v): return {"Condition":{"Comparison":{"ComparisonKind":0,"Left":col(alias,prop),"Right":lit(v)}}}
def isin(alias,prop,vals): return {"Condition":{"In":{"Expressions":[col(alias,prop)],"Values":[[lit(v)] for v in vals]}}}
def contains(alias,prop,v): return {"Condition":{"Contains":{"Left":col(alias,prop),"Right":lit(v)}}}
def anyof(*conds): # OR de várias Conditions
    c=conds[0]["Condition"]
    for x in conds[1:]: c={"Or":{"Left":c,"Right":x["Condition"]}}
    return {"Condition":c}

def query(frm, cols, where=(), top=30000, restart=None):
    """frm: {alias: entity}; cols: [(alias, prop)]"""
    sel=[dict(col(a,p), Name=f"{frm[a]}.{p}") for a,p in cols]
    q={"Version":2,"From":[{"Name":a,"Entity":e,"Type":0} for a,e in frm.items()],"Select":sel,"Where":list(where)}
    win={"Count":top}
    if restart: win["RestartTokens"]=restart
    cmd={"SemanticQueryDataShapeCommand":{"Query":q,"Binding":{"Primary":{"Groupings":[{"Projections":list(range(len(cols)))}]},"DataReduction":{"DataVolume":4,"Primary":{"Window":win}},"Version":1}}}
    body={"version":"1.0.0","queries":[{"Query":{"Commands":[cmd]},"QueryId":"","ApplicationContext":{"DatasetId":DS,"Sources":[{"ReportId":REPORT}]}}],"cancelQueries":[],"modelId":MODEL}
    req=urllib.request.Request(BASE+"/querydata?synchronous=true",data=json.dumps(body).encode(),
        headers={"Content-Type":"application/json","X-PowerBI-ResourceKey":KEY,"Accept-Encoding":"gzip"})
    r=urllib.request.urlopen(req,timeout=120); raw=r.read()
    if r.headers.get("Content-Encoding")=="gzip": raw=gzip.decompress(raw)
    return json.loads(raw)

def decode(resp, ncols):
    """Decodifica o formato DSR comprimido (R = bitmask de repetição, Ø = nulos, ValueDicts)."""
    res=resp["results"][0]["result"]["data"]
    if "dsr" not in res: raise RuntimeError(json.dumps(res)[:1500])
    ds=res["dsr"]["DS"][0]; dicts=ds.get("ValueDicts",{})
    rows=[]; prev=[None]*ncols; schema=None
    for ph in ds["PH"]:
        for k,items in ph.items():
            for it in items:
                if "S" in it: schema=it["S"]
                C=it.get("C") if "C" in it else [it[x["N"]] for x in schema if x["N"] in it]
                R=it.get("R",0); N=it.get("Ø",0); ci=0; row=[]
                for i in range(ncols):
                    if R>>i & 1: v=prev[i]
                    elif N>>i & 1: v=None
                    else:
                        v=C[ci]; ci+=1
                        dn=schema[i].get("DN") if schema and i<len(schema) else None
                        if dn and isinstance(v,int): v=dicts[dn][v]
                    row.append(v)
                prev=row; rows.append(row)
    return rows, ds.get("RT"), ds.get("IC")

def fetch_all(frm, cols, where=(), page=30000):
    out=[]; rt=None
    while True:
        rows, rt2, ic = decode(query(frm, cols, where, page, rt), len(cols))
        out+=rows
        if not rt2 or rt2==rt: break
        rt=rt2
        if len(rows)<page: break
    return out
