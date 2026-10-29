"""Estandariza fotos de libros: 800x1200 (proporción 2:3), JPG ~85%, fondo color papel.
Uso: python tools/preparar_imagenes.py carpeta_con_fotos   -> guarda en static/libros/"""
import sys, re, unicodedata
from pathlib import Path
from PIL import Image, ImageOps

W, H, FONDO = 800, 1200, (246, 239, 227)
OUT = Path(__file__).resolve().parent.parent / "static" / "libros"

def slug(name):
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")

def procesar(src: Path):
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    img.thumbnail((W, H), Image.LANCZOS)          # cabe completo, sin recortar el libro
    lienzo = Image.new("RGB", (W, H), FONDO)
    lienzo.paste(img, ((W - img.width) // 2, (H - img.height) // 2))
    dest = OUT / f"{slug(src.stem)}.jpg"
    lienzo.save(dest, "JPEG", quality=85, optimize=True, progressive=True)
    return dest

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(Path(sys.argv[1]).iterdir()):
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".heic"):
            print("✓", procesar(f).name)
