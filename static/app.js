// Herencia de papel — catálogo en vivo + carrito + pedido por Instagram (y WhatsApp opcional)
(() => {
  const REFRESH_MS = 20000; // cada cuánto se vuelve a pedir el catálogo
  const WHATSAPP = document.body.dataset.whatsapp || "";
  const INSTAGRAM = document.body.dataset.instagram || "";
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), statusEl = $("status");
  const search = $("search"), category = $("category"), onlyAvailable = $("onlyAvailable");

  let books = [];
  let cart = loadCart(); // { id: cantidad }

  // ---------- Utilidades ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function norm(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  // Acepta enlaces de Google Drive y los convierte en imagen directa
  function imageUrl(url) {
    if (!url) return "";
    // Solo el nombre del archivo (ej. pedro-paramo.jpg) -> carpeta static/libros
    if (!/^(https?:)?\/\//.test(url) && !url.startsWith("/")) return `/static/libros/${encodeURIComponent(url)}`;
    const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w600` : url;
  }
  // Precio con descuento: tachado + precio de venta + % OFF
  function off(b) {
    return b.precio_antes > b.precio && b.precio > 0 ? Math.round((1 - b.precio / b.precio_antes) * 100) : 0;
  }
  function priceBlock(b) {
    const pct = off(b);
    if (!pct) return `<span class="price">${money.format(b.precio)}</span>`;
    return `<span class="prices">
        <span class="was-row"><s class="was" aria-label="Precio anterior">${money.format(b.precio_antes)}</s><span class="off-badge">-${pct}% OFF</span></span>
        <span class="price">${money.format(b.precio)}</span>
      </span>`;
  }

  // Estado del 1 al 5 -> "Estado ★★★★★ 5/5"; si es texto, se muestra tal cual
  function estadoTag(v) {
    const n = Math.round(Number(String(v).replace(",", ".")) * 2) / 2; // admite 4.5
    if (n >= 1 && n <= 5) {
      const full = Math.floor(n), half = n % 1 ? 1 : 0;
      return `Estado ${"★".repeat(full)}${half ? "⯪" : ""}${"☆".repeat(5 - full - half)} ${n}/5`;
    }
    return esc(v);
  }
  function loadCart() {
    try { return JSON.parse(localStorage.getItem("hdp-cart")) || {}; } catch { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem("hdp-cart", JSON.stringify(cart)); } catch { /* sin almacenamiento */ }
  }

  // ---------- Catálogo ----------
  async function loadBooks(first = false) {
    try {
      const res = await fetch("/api/libros", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      books = data.libros || [];
      fillCategories();
      render();
      syncCart();
      const hora = new Date(data.actualizado).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      statusEl.textContent =
        data.fuente === "demo"
          ? "Modo demostración: conecta tu Google Sheet para ver tus libros."
          : data.fuente === "csv"
          ? `${books.length} libros · leyendo plantilla-libros.csv (modo local)`
          : `${books.length} libros · actualizado ${hora}${data.aviso ? " · " + data.aviso : ""}`;
    } catch (e) {
      if (first) {
        statusEl.textContent = "No se pudo cargar el catálogo. Intenta de nuevo en un momento.";
        grid.innerHTML = "";
      }
    }
  }

  function fillCategories() {
    const current = category.value;
    const cats = [...new Set(books.map((b) => b.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    category.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map((c) => `<option ${c === current ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  function render() {
    const q = norm(search.value.trim());
    const cat = category.value;
    const list = books.filter((b) =>
      (!q || norm(b.titulo + " " + b.autor).includes(q)) &&
      (!cat || b.categoria === cat) &&
      (!onlyAvailable.checked || b.stock > 0));

    if (!list.length) {
      grid.innerHTML = '<p class="empty">No encontré libros con esos filtros.</p>';
      return;
    }

    grid.innerHTML = list.map((b) => {
      const soldout = b.stock <= 0;
      const inCart = cart[b.id] || 0;
      const full = inCart >= b.stock;
      const img = imageUrl(b.imagen);
      return `
        <article class="card ${soldout ? "soldout" : ""}">
          <div class="cover">
            ${img
              ? `<img src="${esc(img)}" alt="Portada de ${esc(b.titulo)}" loading="lazy" referrerpolicy="no-referrer">`
              : `<div class="placeholder">${esc(b.titulo)}</div>`}
          </div>
          <div class="card-body">
            <h3>${esc(b.titulo)}</h3>
            <p class="author">${esc(b.autor)}</p>
            ${b.descripcion ? `<p class="desc">${esc(b.descripcion)}</p>` : ""}
            <div class="tags">
              ${b.categoria ? `<span class="tag">${esc(b.categoria)}</span>` : ""}
              ${b.estado ? `<span class="tag" title="Estado del libro">${estadoTag(b.estado)}</span>` : ""}
              ${b.paginas ? `<span class="tag">${esc(b.paginas)} págs.</span>` : ""}
              <span class="tag">${soldout ? "Agotado" : b.stock === 1 ? "Último ejemplar" : b.stock + " disponibles"}</span>
            </div>
            <div class="card-foot">
              ${priceBlock(b)}
              <button class="add" data-id="${esc(b.id)}" ${soldout || full ? "disabled" : ""}>
                ${soldout ? "Agotado" : full ? "En carrito" : "Agregar"}
              </button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  // ---------- Carrito ----------
  const cartEl = $("cart"), overlay = $("overlay");

  function openCart() { cartEl.classList.add("open"); cartEl.setAttribute("aria-hidden", "false"); overlay.hidden = false; }
  function closeCart() { cartEl.classList.remove("open"); cartEl.setAttribute("aria-hidden", "true"); overlay.hidden = true; }

  function add(id, delta) {
    const b = books.find((x) => x.id === id);
    if (!b) return;
    const next = Math.min((cart[id] || 0) + delta, b.stock);
    if (next <= 0) delete cart[id]; else cart[id] = next;
    saveCart();
    renderCart();
    render();
  }

  // Si cambia el stock en la hoja, ajusta el carrito automáticamente
  function syncCart() {
    for (const id of Object.keys(cart)) {
      const b = books.find((x) => x.id === id);
      if (!b || b.stock <= 0) delete cart[id];
      else if (cart[id] > b.stock) cart[id] = b.stock;
    }
    saveCart();
    renderCart();
  }

  function renderCart() {
    const items = Object.entries(cart)
      .map(([id, qty]) => ({ b: books.find((x) => x.id === id), qty }))
      .filter((x) => x.b);
    const count = items.reduce((n, x) => n + x.qty, 0);
    const total = items.reduce((n, x) => n + x.qty * x.b.precio, 0);
    const ahorro = items.reduce((n, x) => n + (off(x.b) ? x.qty * (x.b.precio_antes - x.b.precio) : 0), 0);
    $("cartSavings").hidden = ahorro <= 0;
    $("cartSavings").textContent = `Te ahorras ${money.format(ahorro)}`;

    $("cartCount").textContent = count;
    $("cartTotal").textContent = money.format(total);
    if ($("checkout")) $("checkout").disabled = count === 0;
    $("checkoutIg").disabled = count === 0;
    $("cartItems").innerHTML = items.length
      ? items.map(({ b, qty }) => `
          <li>
            <span class="t">${esc(b.titulo)}</span>
            <span class="price">${money.format(b.precio * qty)}</span>
            <span class="s">${esc(b.autor)}</span>
            <span class="qty">
              <button data-dec="${esc(b.id)}" aria-label="Quitar uno">−</button>
              ${qty}
              <button data-inc="${esc(b.id)}" aria-label="Agregar uno" ${qty >= b.stock ? "disabled" : ""}>+</button>
            </span>
          </li>`).join("")
      : '<li class="cart-empty">Tu carrito está vacío.</li>';
    return { items, total, ahorro };
  }

  function orderMessage() {
    const { items, total, ahorro } = renderCart();
    if (!items.length) return "";
    const name = $("buyerName").value.trim();
    const lines = items.map(({ b, qty }) => `• ${qty} × ${b.titulo} — ${money.format(b.precio * qty)}`);
    const msg =
      `¡Hola! ${name ? "Soy " + name + ". " : ""}Quiero apartar estos libros de Herencia de papel:\n\n` +
      lines.join("\n") + `\n\nTotal: ${money.format(total)}` +
      (ahorro > 0 ? ` (ahorro de ${money.format(ahorro)})` : "");
    return msg;
  }

  function toast(text) {
    const t = $("toast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 6000);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  // Instagram no permite dejar el texto escrito: copiamos el pedido y abrimos el chat
  function checkoutInstagram() {
    const msg = orderMessage();
    if (!msg) return;
    const url = INSTAGRAM ? `https://ig.me/m/${encodeURIComponent(INSTAGRAM)}` : "https://www.instagram.com/direct/inbox/";
    const copying = copyText(msg); // primero copiamos, mientras seguimos dentro del clic
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
    copying.then((ok) => {
      toast(ok
        ? "Pedido copiado ✓ En el chat de Instagram mantén presionado y elige «Pegar»."
        : "No pude copiar automáticamente. Copia tu pedido desde el carrito y pégalo en el chat.");
      if (!win) setTimeout(() => { location.href = url; }, 1500); // pestaña bloqueada: abrimos aquí
    });
  }

  function checkout() {
    const msg = orderMessage();
    if (!msg) return;
    const url = WHATSAPP
      ? `https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener");
  }

  // ---------- Eventos ----------
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".add");
    if (btn) { add(btn.dataset.id, 1); openCart(); }
  });
  $("cartItems").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.inc) add(t.dataset.inc, 1);
    if (t.dataset.dec) add(t.dataset.dec, -1);
  });
  $("cartBtn").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });
  if ($("checkout")) $("checkout").addEventListener("click", checkout);
  $("checkoutIg").addEventListener("click", checkoutInstagram);
  search.addEventListener("input", render);
  category.addEventListener("change", render);
  onlyAvailable.addEventListener("change", render);

  // Tiempo real: recarga periódica y al volver a la pestaña
  loadBooks(true);
  setInterval(() => { if (!document.hidden) loadBooks(); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadBooks(); });
})();
