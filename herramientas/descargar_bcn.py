"""Descarga los códigos desde LeyChile (BCN) y los deja como JSON livianos para el prototipo.

Uso:  python -I herramientas/descargar_bcn.py            (desde prototipos/codigo-anotado)

Fuente: servicio público de LeyChile que usa su propio visor (get_norma_json). Texto de dominio público;
el prototipo siempre enlaza a la versión oficial en bcn.cl.
"""
import ast
import datetime
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "..", "datos")
URL = "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma={}"

CODIGOS = [
    # sigla, idNorma, nombre corto, alias para el buscador (sin tildes, minúsculas)
    ("cpr", 242302, "Constitución Política", ["cpr", "constitucion", "const", "cpe", "carta fundamental"]),
    ("cc", 172986, "Código Civil", ["cc", "civil", "codigo civil", "cod civil"], "del Código Civil"),
    ("cpc", 22740, "Código de Procedimiento Civil", ["cpc", "procedimiento civil", "proc civil", "pc"]),
    ("cp", 1984, "Código Penal", ["cp", "penal", "codigo penal"]),
    ("cpp", 176595, "Código Procesal Penal", ["cpp", "procesal penal", "cpop", "proc penal"]),
    ("ct", 207436, "Código del Trabajo", ["ct", "trabajo", "laboral", "codigo del trabajo", "cdt", "ctrab"]),
    ("ccom", 1974, "Código de Comercio", ["ccom", "comercio", "cdc", "codigo de comercio", "cco"]),
    ("cot", 25563, "Código Orgánico de Tribunales", ["cot", "organico de tribunales", "tribunales", "organico"]),
    ("ctrib", 6374, "Código Tributario", ["ctrib", "tributario", "codigo tributario", "ctb"]),
    ("cag", 5605, "Código de Aguas", ["cag", "aguas", "codigo de aguas", "ca"]),
    ("cmin", "ley:18248", "Código de Minería", ["cmin", "mineria", "codigo de mineria", "cm"]),
    ("csan", 5595, "Código Sanitario", ["csan", "sanitario", "codigo sanitario", "cs"]),
    ("caer", 30287, "Código Aeronáutico", ["caer", "aeronautico", "codigo aeronautico"]),
    ("cjm", 18914, "Código de Justicia Militar", ["cjm", "justicia militar"]),
    ("cprp", 22960, "Código de Procedimiento Penal (antiguo)", ["cprp", "procedimiento penal", "cdpp"]),
]

SUFIJOS = r"bis|ter|qu[aá]ter|quinquies|sexies|septies|octies|nonies|novies|decies|undecies|duodecies"


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def a_texto(fragmento):
    s = re.sub(r"<br\s*/?>", "\n", fragmento)
    s = re.sub(r"</div>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    lineas = [re.sub(r"[ \t]+", " ", l).strip() for l in s.split("\n")]
    return "\n".join(l for l in lineas if l)


def separar_notas(fragmento):
    """Las notas de modificación vienen en <span class="n">; se separan del cuerpo del artículo."""
    notas = [a_texto(m).replace("\n", " ") for m in re.findall(r'<span class="n"[^>]*>(.*?)</span>', fragmento, re.S)]
    cuerpo = re.sub(r'<span class="n"[^>]*>.*?</span>', "", fragmento, flags=re.S)
    return a_texto(cuerpo), notas


UNIDADES = ["primer", "segund", "tercer", "cuart", "quint", "sext", "septim", "octav", "noven"]
DECENAS = [("decim", 10), ("vigesim", 20), ("trigesim", 30), ("cuadragesim", 40), ("quincuagesim", 50),
           ("sexagesim", 60), ("septuagesim", 70)]


def numero_ordinal(palabra):
    """'primera' → 1, 'decimoprimera' → 11, 'VIGÉSIMO OCTAVA' → 28, 'trigésima' → 30."""
    p = sin_tildes(palabra.lower()).replace(" ", "")
    p = re.sub(r"[oa]$", "", p)
    if p in ("undecim",):
        return 11
    if p in ("duodecim",):
        return 12
    base = 0
    for prefijo, valor in DECENAS:
        if p.startswith(prefijo):
            base, p = valor, re.sub(r"^[oa]", "", p[len(prefijo):])
            break
    if not p:
        return base or None
    if p in UNIDADES:
        return base + UNIDADES.index(p) + 1
    return None


def numero_articulo(texto, ruta):
    """Devuelve (numero_normalizado, encabezado) o (None, None) si el fragmento no es un artículo."""
    t = texto.strip()
    transitorio = any("transitori" in sin_tildes(r.lower()) for r in ruta) or bool(
        re.match(r"^\s*Art[íi]culo\s+\S+\s+transitori", t, re.I))
    m = re.match(
        r"^(?:Art[íi]culo|ART[ÍI]CULO|Art\.?|ART\.?)\s*(\d+)\s*[°º]?\.?"       # número
        r"(?:\s*-\s*(\d+|[A-Z])(?![a-záéíóú]))?"                             # 548-1, 161-A
        r"(?:\s*(?i:(" + SUFIJOS + r"))\b)?"                                  # bis, ter...
        r"(?:\s*([A-ZÑ](?=[\s\.\-\):,]|$)|[a-zñ](?=[\.\)]|\s+[A-ZÁÉÍÓÚ])))?"  # 152 bis A, 313 a.
        r"(?:\s*(?i:(" + SUFIJOS + r"))\b)?",                                 # 152 quáter O bis
        t)
    if m and m.group(2) and "." in t[m.end(1):m.start(2)]:
        # "Artículo 1.- A la presente ley": el guion es puntuación, no parte del número (a diferencia de "161 - A.")
        m = re.match(r"^(?:Art[íi]culo|ART[ÍI]CULO|Art\.?|ART\.?)\s*(\d+)()()()()", t)
    if m:
        n = m.group(1)
        if m.group(2):
            n += "-" + m.group(2).upper()
        if m.group(3):
            n += " " + sin_tildes(m.group(3).lower())
        if m.group(4):
            n += " " + m.group(4).upper()
        if m.group(5):
            n += " " + sin_tildes(m.group(5).lower())
        if transitorio:
            n += " transitorio"
        return n, t[: m.end()].strip()
    m = re.match(r"^(Art[íi]culo)\s+([a-záéíóúñ]+)\s*(transitori[oa])?", t, re.I)
    if m:
        palabra = m.group(2)
        num = numero_ordinal(palabra)
        if num:
            return f"{num} transitorio" if (transitorio or m.group(3)) else str(num), t[: m.end()].strip()
        if sin_tildes(palabra.lower()) in ("final", "unico"):
            return sin_tildes(palabra.lower()), t[: m.end()].strip()
    # Constitución: "PRIMERA.- ..." dentro de disposiciones transitorias
    m = re.match(r"^([A-ZÁÉÍÓÚa-záéíóú]+(?: [A-ZÁÉÍÓÚ]+)?)\.-?\s", t)
    if m and transitorio:
        num = numero_ordinal(m.group(1))
        if num:
            return f"{num} transitorio", t[: m.end()].strip()
    return None, None


def limpiar_ruta(texto):
    t = separar_notas(texto)[0].replace("\n", " · ")
    t = re.sub(r"(·\s*)?\bNOTA\b(\s*\d+)?", "", t)
    t = re.sub(r"\s*·\s*NOTA\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip(" ·")
    return t[:140]


URL_LEY = "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idLey={}"
URL_BUSCAR = ("https://nuevo.leychile.cl/servicios/Consulta/listaresultadosimple?cadena={}&exacta=0&orden=2"
              "&tipoviene=1&totalitems={n}&seleccionado=0&npagina=1&itemsporpagina={n}")


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (prototipo laboratorio-ideas)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def bajar(id_norma=None, id_ley=None):
    """JSON crudo de LeyChile, por idNorma o por número de ley."""
    return _get_json(URL.format(id_norma) if id_norma else URL_LEY.format(id_ley))


def buscar_bcn(texto, n=8):
    """Normas que coinciden con un texto en el buscador de LeyChile: [{idNorma, norma, titulo, ...}]."""
    datos = _get_json(URL_BUSCAR.format(urllib.parse.quote(texto), n=n))
    salida = []
    for x in datos[0]:
        salida.append({
            "idNorma": int(x["IDNORMA"]),
            "norma": x.get("NORMA", ""),
            "numero": x.get("NUMERO", ""),
            "tipo": x.get("DESCRIPCION", ""),
            "titulo": (x.get("TITULO_NORMA") or "").strip(),
            "comun": x.get("NOMBRES_USO_COMUN", ""),
            "publicacion": x.get("FECHA_PUBLICACION", ""),
            "derogada": bool(x.get("FECHA_DEROGACION")),
            # [[idNorma, tipo, número, fecha, título], ...] si un texto refundido reemplaza a esta norma
            "refundidaEn": _lista(x.get("datos_refundidas")),
        })
    return salida


def _lista(valor):
    try:
        return ast.literal_eval(valor) if isinstance(valor, str) else (valor or [])
    except (ValueError, SyntaxError):
        return []


def convertir(datos, sigla, nombre, raiz=None):
    """Convierte el JSON de LeyChile al formato liviano del prototipo. Devuelve (norma, fragmentos_omitidos).
    raiz: el DFL del Código Civil fija también otras leyes; solo se toma el subárbol cuyo encabezado lo contiene."""
    meta = datos["metadatos"]
    articulos, vistos, omitidos = [], {}, 0

    def recorrer(nodo, ruta):
        nonlocal omitidos
        if "h" in nodo:
            encabezado = limpiar_ruta(nodo["t"])
            if raiz and not ruta and raiz.lower() not in encabezado.lower():
                return  # otra ley incluida en el mismo decreto
            nueva = ruta + [encabezado]
            for hijo in nodo["h"]:
                recorrer(hijo, nueva)
            return
        if raiz and not ruta:
            return  # artículos del decreto que envuelve al código
        cuerpo, notas = separar_notas(nodo["t"])
        n, encabezado = numero_articulo(cuerpo, ruta)
        if not n:
            omitidos += 1
            return
        clave = n
        if clave in vistos:  # numeración repetida (p. ej. un libro con numeración propia): se desambigua
            vistos[n] += 1
            libro = None
            for x in ruta:
                libro = re.search(r"(?:LIBRO|Libro)\s+([IVXLC]+|[A-ZÁÉÍÓÚ]{4,})", x)
                if libro:
                    break
            etiqueta = ("Libro " + libro.group(1).upper()) if libro else str(vistos[n])
            clave = f"{n} ({etiqueta})"
            if clave in vistos:
                clave = f"{n} ({etiqueta}, {vistos[n]})"
        vistos.setdefault(clave, 1)
        ruta_visible = [x for x in ruta if x and not re.match(r"(?i)art[ií]culo\s", x)]
        art = {"n": clave, "e": encabezado, "r": ruta_visible, "t": cuerpo, "m": notas, "i": nodo["i"]}
        if "MODIFICACION" in (nodo.get("v") or []):
            art["mod"] = 1
        articulos.append(art)

    for nodo in datos["html"]:
        recorrer(nodo, [])

    tipos = _lista(meta.get("tipos_numeros"))
    identificacion = " ".join(f"{t.get('descripcion', '')} {t.get('numero', '')}".strip() for t in tipos[:1])
    versiones = _lista(meta.get("vigencias"))
    norma = {
        "sigla": sigla,
        "nombre": nombre,
        "titulo": meta.get("titulo_norma", ""),
        "identificacion": identificacion,
        "idNorma": int(meta.get("id_norma") or 0),
        "publicacion": meta.get("fecha_publicacion", ""),
        "vigenteDesde": (_lista(meta.get("vigencia")) or {}).get("inicio_vigencia", "")
                        if isinstance(_lista(meta.get("vigencia")), dict) else "",
        "versiones": len(versiones),
        "derogada": str(meta.get("derogado")) == "True",
        "descargado": datetime.date.today().isoformat(),
        "articulos": articulos,
    }
    return norma, omitidos


def con_puntos(numero):
    return f"{int(numero):,}".replace(",", ".") if str(numero).isdigit() else str(numero)


def resolver_ley(numero):
    """Datos de LeyChile de una ley por su número. Si la ley tiene texto refundido (p. ej. la 19.496 en el DFL 3
    de 2021), LeyChile deja de actualizar la original: se usa el refundido más reciente.
    Devuelve (datos, refundida o None)."""
    for x in buscar_bcn(f"ley {numero}", n=10):
        if x["numero"] == str(numero) and x["tipo"].lower() == "ley" and x["refundidaEn"]:
            ultimo = sorted(x["refundidaEn"], key=lambda r: "-".join(reversed(str(r[3]).split("-"))))[-1]
            refundida = {"idNorma": int(ultimo[0]), "norma": f"{ultimo[1]} {ultimo[2]}", "fecha": ultimo[3]}
            return bajar(id_norma=refundida["idNorma"]), refundida
    return bajar(id_ley=numero), None


def guardar_si_cambio(ruta, norma):
    """Escribe la norma solo si su contenido cambió (sin contar la fecha de descarga), para que el robot nocturno
    no haga commits cuando la BCN no cambió nada. Devuelve la norma tal como quedó en disco."""
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            anterior = json.load(f)
        sin_fecha = lambda d: {k: v for k, v in d.items() if k != "descargado"}  # noqa: E731
        if sin_fecha(anterior) == sin_fecha(norma):
            return anterior
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(norma, f, ensure_ascii=False, separators=(",", ":"))
    return norma


def procesar(sigla, id_norma, nombre, alias, raiz=None, ley=None, tema="", dentro_de=None):
    refundida = None
    if ley and dentro_de:  # ley cuyo texto vigente está dentro de otro decreto (p. ej. el DFL 1 de 2000)
        datos = bajar(id_norma=dentro_de["id"])
        raiz = dentro_de["raiz"]
        refundida = {"idNorma": dentro_de["id"], "norma": dentro_de["norma"], "fecha": dentro_de["fecha"]}
    elif ley:
        datos, refundida = resolver_ley(ley)
    elif isinstance(id_norma, str) and id_norma.startswith("ley:"):
        datos = bajar(id_ley=id_norma[4:])
    else:
        datos = bajar(id_norma=id_norma)
    norma, omitidos = convertir(datos, sigla, nombre, raiz)
    if refundida:
        norma["refundida"] = refundida
    if ley:
        norma["nombreLargo"] = tema or norma["titulo"].capitalize()
    norma = guardar_si_cambio(os.path.join(SALIDA, f"{sigla}.json"), norma)
    print(f"{sigla:9} {len(norma['articulos']):5} artículos · {omitidos:3} omitidos · {norma['identificacion']:16} · "
          f"vigente desde {norma['vigenteDesde']} · {norma['titulo'][:45]}")
    entrada = {"sigla": sigla, "nombre": nombre, "alias": alias, "idNorma": norma["idNorma"],
               "identificacion": norma["identificacion"], "vigenteDesde": norma["vigenteDesde"],
               "articulos": len(norma["articulos"]), "descargado": norma["descargado"]}
    if ley:
        entrada.update({"tipo": "ley", "tema": tema})
    return entrada


# El DFL 1 de 2000 (Justicia) fija el texto vigente del Código Civil y de otras cinco leyes
DFL1_2000 = {"id": 172986, "norma": "DFL 1", "fecha": "30-05-2000"}

# Leyes de uso frecuente que se precargan (para cuando no hay servidor intermediario, p. ej. en GitHub Pages)
# (número, tema, alias[, dentro_de])
LEYES = [
    ("19496", "Protección de los derechos de los consumidores", ["ley del consumidor", "consumidor"]),
    ("18101", "Arrendamiento de predios urbanos", ["arriendo", "arrendamiento urbano"]),
    ("19947", "Matrimonio civil", ["matrimonio civil"]),
    ("19968", "Tribunales de familia", ["tribunales de familia"]),
    ("14908", "Abandono de familia y pago de pensiones alimenticias", ["pensiones de alimentos"], DFL1_2000 | {"raiz": "14.908"}),
    ("16618", "Ley de Menores", ["ley de menores"], DFL1_2000 | {"raiz": "16.618"}),
    ("4808", "Registro Civil", ["registro civil"], DFL1_2000 | {"raiz": "Registro Civil"}),
    ("17344", "Cambio de nombres y apellidos", ["cambio de nombre"], DFL1_2000 | {"raiz": "17.344"}),
    ("16271", "Impuesto a las herencias, asignaciones y donaciones", ["impuesto a las herencias", "herencias"], DFL1_2000 | {"raiz": "16.271"}),
    ("21389", "Registro Nacional de Deudores de Pensiones de Alimentos", ["registro de deudores"]),
    ("20830", "Acuerdo de unión civil", ["union civil", "auc"]),
    ("19620", "Adopción de menores", ["adopcion"]),
    ("20066", "Violencia intrafamiliar", ["vif", "violencia intrafamiliar"]),
    ("20720", "Insolvencia y reemprendimiento", ["insolvencia", "quiebras"]),
    ("19880", "Bases de los procedimientos administrativos", ["procedimiento administrativo"]),
    ("18575", "Bases generales de la Administración del Estado", ["bases generales de la administracion", "locbgae"]),
    ("20285", "Acceso a la información pública", ["transparencia"]),
    ("19886", "Compras públicas", ["compras publicas"]),
    ("18010", "Operaciones de crédito de dinero", ["operaciones de credito"]),
    ("18092", "Letra de cambio y pagaré", ["letra de cambio", "pagare"]),
    ("19983", "Factura (transferencia y mérito ejecutivo)", ["factura"]),
    ("18046", "Sociedades anónimas", ["sociedades anonimas"]),
    ("19628", "Protección de la vida privada (datos personales)", ["datos personales", "vida privada"]),
    ("17336", "Propiedad intelectual", ["propiedad intelectual"]),
    ("16744", "Accidentes del trabajo y enfermedades profesionales", ["accidentes del trabajo"]),
    ("21643", "Ley Karin (acoso laboral y sexual)", ["ley karin", "acoso laboral"]),
    ("20609", "Antidiscriminación (Ley Zamudio)", ["ley zamudio", "antidiscriminacion"]),
    ("20000", "Tráfico ilícito de estupefacientes", ["ley de drogas", "drogas"]),
    ("20084", "Responsabilidad penal adolescente", ["rpa", "responsabilidad penal adolescente"]),
    ("18216", "Penas sustitutivas", ["penas sustitutivas"]),
    ("20393", "Responsabilidad penal de las personas jurídicas", ["personas juridicas"]),
    ("19913", "Unidad de Análisis Financiero y lavado de activos", ["lavado de activos", "uaf"]),
    ("18290", "Ley de Tránsito", ["transito", "ley de transito"]),
    ("21442", "Copropiedad inmobiliaria", ["copropiedad"]),
]


def entrada_anterior(sigla):
    """Entrada del índice existente, para conservarla si la descarga de hoy falló."""
    ruta = os.path.join(SALIDA, "indice.json")
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8") as f:
        ind = json.load(f)
    return {x["sigla"]: x for x in ind.get("codigos", []) + ind.get("leyes", [])}.get(sigla)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    indice, fallas = [], []
    tareas = [(s, i, n, a, {"raiz": r[0] if r else None}) for s, i, n, a, *r in CODIGOS]
    tareas += [(f"ley{num}", None, f"Ley {con_puntos(num)}", al, {"ley": num, "tema": tema, "dentro_de": (d or [None])[0]})
               for num, tema, al, *d in LEYES]
    for sigla, id_norma, nombre, alias, extra in tareas:
        try:
            indice.append(procesar(sigla, id_norma, nombre, alias, **extra))
        except Exception as e:  # una norma que falla no detiene las demás; se conserva la versión anterior
            fallas.append(f"{sigla}: {type(e).__name__}: {e}")
            indice.append(entrada_anterior(sigla))
        time.sleep(1)  # amable con el servidor de la BCN
    indice = [x for x in indice if x]
    actualizado = max((x.get("descargado", "") for x in indice), default=datetime.date.today().isoformat())
    nuevo = {"actualizado": actualizado,
             "codigos": [x for x in indice if x.get("tipo") != "ley"],
             "leyes": [x for x in indice if x.get("tipo") == "ley"]}
    with open(os.path.join(SALIDA, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(nuevo, f, ensure_ascii=False, indent=1)
    if fallas:
        print("\nNo se pudieron actualizar (se mantiene la versión anterior):\n  " + "\n  ".join(fallas))
        if len(fallas) == len(tareas):
            return 1  # la BCN no respondió a nada: el robot debe marcar error
    return 0


if __name__ == "__main__":
    sys.exit(main())
