"""
Herencia de papel — tienda de libros
Servidor Flask que lee el catálogo desde Google Sheets (llave API)
y lo entrega a la página como JSON. La llave NUNCA llega al navegador.
"""
import os
import re
import csv
import time
import threading
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# ---------- Configuración (variables de entorno en Render) ----------
SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "").strip()
API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
SHEET_RANGE = os.environ.get("SHEET_RANGE", "Libros").strip()   # nombre de la pestaña
WHATSAPP = os.environ.get("WHATSAPP_NUMBER", "").strip()        # ej. 5214611234567 (opcional)
INSTAGRAM = os.environ.get("INSTAGRAM_USER", "manuel_solis30").strip().lstrip("@")
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "15"))      # cada cuánto se relee la hoja

_cache = {"t": 0.0, "data": None}
_lock = threading.Lock()

# Catálogo de ejemplo: se muestra solo si aún no configuras Google Sheets
DEMO = [
    {"id": "1", "titulo": "Cien años de soledad", "autor": "Gabriel García Márquez", "precio": 180, "stock": 2,
     "imagen": "", "descripcion": "Edición de bolsillo, buen estado.", "categoria": "Novela", "estado": "Usado"},
    {"id": "2", "titulo": "Pedro Páramo", "autor": "Juan Rulfo", "precio": 120, "stock": 1,
     "imagen": "", "descripcion": "Con subrayados a lápiz.", "categoria": "Novela", "estado": "Usado"},
    {"id": "3", "titulo": "El laberinto de la soledad", "autor": "Octavio Paz", "precio": 150, "stock": 3,
     "imagen": "", "descripcion": "Ensayo clásico.", "categoria": "Ensayo", "estado": "Como nuevo"},
    {"id": "4", "titulo": "Rayuela", "autor": "Julio Cortázar", "precio": 210, "stock": 0,
     "imagen": "", "descripcion": "Pasta dura.", "categoria": "Novela", "estado": "Usado"},
    {"id": "5", "titulo": "Breve historia del tiempo", "autor": "Stephen Hawking", "precio": 160, "stock": 1,
     "imagen": "", "descripcion": "Divulgación científica.", "categoria": "Ciencia", "estado": "Usado"},
    {"id": "6", "titulo": "Aura", "autor": "Carlos Fuentes", "precio": 90, "stock": 4,
     "imagen": "", "descripcion": "Novela corta.", "categoria": "Novela", "estado": "Nuevo"},
]


def _key(text: str) -> str:
    """'Título' -> 'titulo', 'Categoría ' -> 'categoria'"""
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    return text.strip().lower().replace(" ", "_")


def _num(value, default=0.0) -> float:
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def _estado_desde_obs(texto: str) -> str:
    """'Estado 4.5/5. Muy buen estado...' -> '4.5'"""
    m = re.match(r"\s*estado\s*:?\s*(\d(?:[.,]5)?)\s*/\s*5", texto or "", re.I)
    return m.group(1).replace(",", ".") if m else ""


def _normalize(rec: dict, idx: int) -> dict | None:
    if not rec.get("titulo"):
        return None
    if rec.get("visible", "si").lower() in ("no", "0", "false", "oculto"):
        return None
    stock_raw = rec.get("stock", "")
    stock = int(_num(stock_raw, 1)) if stock_raw != "" else 1
    return {
        "id": rec.get("id") or str(idx),
        "titulo": rec.get("titulo", ""),
        "autor": rec.get("autor", ""),
        "precio": _num(rec.get("precio")),
        # Precio de referencia tachado (precio de nuevo). Acepta "Precio antes" o "Precio original".
        "precio_antes": _num(rec.get("precio_antes") or rec.get("precio_original")),
        "stock": max(stock, 0),
        "imagen": rec.get("imagen", ""),
        "descripcion": re.sub(r"^\s*estado\s*:?\s*\d(?:[.,]5)?\s*/\s*5\.?\s*", "",
                              rec.get("descripcion") or rec.get("observaciones", ""), flags=re.I),
        "paginas": rec.get("paginas", ""),
        "categoria": rec.get("categoria", ""),
        "estado": rec.get("estado") or _estado_desde_obs(rec.get("observaciones") or rec.get("descripcion", "")),
    }


def _fetch_from_sheets() -> list[dict]:
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
           f"/values/{quote(SHEET_RANGE, safe='')}")
    resp = requests.get(url, params={"key": API_KEY}, timeout=10)
    resp.raise_for_status()
    return _rows_to_books(resp.json().get("values", []))


LOCAL_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plantilla-libros.csv")


def _rows_to_books(rows: list[list[str]]) -> list[dict]:
    if not rows:
        return []
    headers = [_key(h) for h in rows[0]]
    books = []
    for idx, row in enumerate(rows[1:], start=2):
        rec = {h: (row[i].strip() if i < len(row) else "") for i, h in enumerate(headers)}
        book = _normalize(rec, idx)
        if book:
            books.append(book)
    return books


def _read_local_csv() -> list[dict]:
    """Sin Google Sheets: lee plantilla-libros.csv (se relee en cada visita).
    Acepta archivos guardados desde Excel o el Bloc de notas: UTF-8 o ANSI,
    separados por coma, punto y coma o tabulador (incluso mezclados)."""
    raw = open(LOCAL_CSV, "rb").read()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        counts = {d: line.count(d) for d in ("\t", ";", ",")}
        delim = "\t" if counts["\t"] >= 3 else (";" if counts[";"] >= 3 and counts[";"] >= counts[","] // 3 else ",")
        rows.extend(csv.reader([line], delimiter=delim))
    return _rows_to_books(rows)


def get_books() -> dict:
    if not SHEET_ID or not API_KEY:
        if os.path.exists(LOCAL_CSV):
            try:
                return {"libros": _read_local_csv(), "fuente": "csv", "actualizado": _now()}
            except Exception as exc:
                app.logger.error("No pude leer plantilla-libros.csv: %s", exc)
                raise
        return {"libros": DEMO, "fuente": "demo", "actualizado": _now()}

    with _lock:
        fresh = time.time() - _cache["t"] < CACHE_SECONDS
        if fresh and _cache["data"]:
            return _cache["data"]
        try:
            data = {"libros": _fetch_from_sheets(), "fuente": "sheets", "actualizado": _now()}
            _cache.update(t=time.time(), data=data)
            return data
        except Exception as exc:  # si Google falla, servimos lo último que tengamos
            app.logger.warning("Error leyendo Google Sheets: %s", exc)
            if _cache["data"]:
                return {**_cache["data"], "aviso": "Mostrando la última versión guardada"}
            raise


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Rutas ----------
@app.route("/")
def index():
    return render_template("index.html", whatsapp=WHATSAPP, instagram=INSTAGRAM)


@app.route("/api/libros")
def api_libros():
    try:
        data = get_books()
    except Exception:
        return jsonify({"error": "No se pudo leer el catálogo"}), 502
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)