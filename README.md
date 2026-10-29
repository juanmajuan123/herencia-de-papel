# Herencia de papel 📚

Tienda de libros en Flask (Python) + HTML/CSS/JS. El catálogo se lee de **Google Sheets** con una llave API y se actualiza solo: cambias la hoja y en ~20 segundos se ve en la página. Los pedidos se mandan por **WhatsApp**.

```
herencia-de-papel/
├── app.py               ← servidor (lee la hoja y la sirve en /api/libros)
├── templates/index.html ← la página
├── static/style.css     ← diseño
├── static/app.js        ← catálogo, filtros, carrito, WhatsApp
├── requirements.txt
├── render.yaml          ← configuración para Render
└── plantilla-libros.csv ← para importar a tu hoja
```

## 1. Prepara tu Google Sheet
1. Crea una hoja nueva y llama a la pestaña **Libros**.
2. Importa `plantilla-libros.csv` (Archivo → Importar) o escribe estos encabezados en la fila 1:
   `Titulo | Autor | Precio | Stock | Imagen | Descripcion | Categoria | Estado | Visible`
   - **Imagen**: enlace a una foto (sirve un enlace de Google Drive compartido como "Cualquiera con el enlace").
   - **Stock**: pon `0` cuando lo vendas y saldrá como *Agotado*.
   - **Visible**: escribe `no` para ocultar un libro sin borrarlo.
3. Botón **Compartir** → Acceso general → **Cualquier persona con el enlace · Lector**. (Necesario para que la llave API pueda leerla.)
4. Copia el **ID** de la hoja: es lo que va entre `/d/` y `/edit` en la URL.

## 2. Crea la llave API de Google
1. Entra a <https://console.cloud.google.com>, crea un proyecto.
2. *APIs y servicios → Biblioteca* → busca **Google Sheets API** → **Habilitar**.
3. *Credenciales → Crear credenciales → Clave de API*.
4. Edítala y en *Restricciones de API* elige solo **Google Sheets API** (más seguro).

La llave vive solo en el servidor; nunca se envía al navegador.

## 3. Sube a GitHub y publica en Render
1. Sube esta carpeta a un repositorio de GitHub.
2. En <https://render.com> → **New → Blueprint** → elige tu repo (usa `render.yaml`).
   *(O New → Web Service con: Build `pip install -r requirements.txt`, Start `gunicorn app:app`.)*
3. Llena las variables de entorno:

| Variable | Ejemplo |
|---|---|
| `GOOGLE_SHEET_ID` | `1AbC…xyz` |
| `GOOGLE_API_KEY` | `AIza…` |
| `INSTAGRAM_USER` | `herenciadepapel` (tu usuario, sin @) — los pedidos llegan a tus mensajes |
| `WHATSAPP_NUMBER` | *(opcional)* `5214611234567` — si lo pones, aparece también el botón de WhatsApp |
| `SHEET_RANGE` | `Libros` (nombre de la pestaña) |

Sin `GOOGLE_SHEET_ID` / `GOOGLE_API_KEY` la página funciona en **modo demostración** con libros de ejemplo.

> En el plan gratis de Render el servidor se duerme tras un rato sin visitas; la primera carga puede tardar ~30-50 s.

## Probar en tu computadora
```bash
pip install -r requirements.txt
python app.py        # abre http://localhost:5000
```
