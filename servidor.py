"""Servidor del prototipo para la red local (Wi-Fi).

Sirve la app y hace de intermediario con LeyChile (BCN), que no permite consultas directas desde el navegador (CORS):
  /api/estado                 → {"ok": true}
  /api/norma?ley=19496        → la ley convertida al formato del prototipo (se guarda en datos/cache por 1 día)
  /api/norma?id=61438         → lo mismo, por idNorma
  /api/buscar?q=consumidor    → normas que coinciden en el buscador de LeyChile

Uso (desde esta carpeta):  python -I servidor.py [puerto]      (por defecto 8766, en todas las interfaces)
"""
import functools
import json
import os
import re
import sys
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "herramientas"))
import descargar_bcn as bcn  # noqa: E402

CACHE = os.path.join(AQUI, "datos", "cache")
VIGENCIA_CACHE = 24 * 3600
os.makedirs(CACHE, exist_ok=True)


def con_puntos(numero):
    return f"{int(numero):,}".replace(",", ".") if str(numero).isdigit() else str(numero)


def obtener_norma(ley=None, id_norma=None):
    clave = f"ley{ley}" if ley else f"n{id_norma}"
    ruta = os.path.join(CACHE, f"{clave}.json")
    if os.path.exists(ruta) and time.time() - os.path.getmtime(ruta) < VIGENCIA_CACHE:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    if ley:
        datos, refundida = bcn.resolver_ley(ley)   # usa el texto refundido vigente si existe
    else:
        datos, refundida = bcn.bajar(id_norma=id_norma), None
    nombre = f"Ley {con_puntos(ley)}" if ley else ""
    norma, _ = bcn.convertir(datos, clave, nombre)
    if refundida:
        norma["refundida"] = refundida
    if not norma["nombre"]:
        norma["nombre"] = norma["identificacion"].title() or f"Norma {id_norma}"
    norma["nombreLargo"] = norma["titulo"].capitalize()
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(norma, f, ensure_ascii=False, separators=(",", ":"))
    return norma


class Manejador(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # en la prueba, siempre la última versión
        super().end_headers()

    def responder_json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if not url.path.startswith("/api/"):
            return super().do_GET()
        q = urllib.parse.parse_qs(url.query)
        try:
            if url.path == "/api/estado":
                return self.responder_json(200, {"ok": True})
            if url.path == "/api/norma":
                ley = (q.get("ley") or [""])[0].replace(".", "")
                id_norma = (q.get("id") or [""])[0]
                if ley and re.fullmatch(r"\d{1,6}", ley):
                    return self.responder_json(200, obtener_norma(ley=ley))
                if id_norma and re.fullmatch(r"\d{1,9}", id_norma):
                    return self.responder_json(200, obtener_norma(id_norma=id_norma))
                return self.responder_json(400, {"error": "Falta ?ley=N o ?id=N"})
            if url.path == "/api/buscar":
                texto = (q.get("q") or [""])[0].strip()[:120]
                if len(texto) < 3:
                    return self.responder_json(200, [])
                return self.responder_json(200, bcn.buscar_bcn(texto, n=8))
            return self.responder_json(404, {"error": "No existe"})
        except Exception as e:  # la BCN no respondió o la norma no existe
            return self.responder_json(502, {"error": f"No se pudo consultar la BCN: {type(e).__name__}"})

    def log_message(self, formato, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(formato, *args)


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    servidor = ThreadingHTTPServer(("0.0.0.0", puerto), functools.partial(Manejador, directory=AQUI))
    print(f"Al Artículo en http://0.0.0.0:{puerto}  (Ctrl+C para detener)")
    servidor.serve_forever()


if __name__ == "__main__":
    main()
