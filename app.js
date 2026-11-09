/* Al Artículo — prototipo del laboratorio de ideas (idea #9, código anotado digital).
   Los códigos vienen de datos/*.json (LeyChile, BCN); cualquier otra ley se pide a la BCN a través de servidor.py.
   Las notas se guardan solo en este dispositivo (localStorage). Sin cuentas, sin analítica. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const vista = $("#vista");
const entrada = $("#q");
const listaSug = $("#sugerencias");

/* ---------------- Utilidades ---------------- */
const sinTildes = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normal = s => sinTildes(String(s).toLowerCase()).replace(/[°º]/g, " ").replace(/\s+/g, " ").trim();
const claveNum = n => normal(n).replace(/[^a-z0-9ñ]/g, "");           // "152 bis A" → "152bisa"
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const conPuntos = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fechaCL = iso => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : iso; };
const MOVIMIENTO = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let avisoTimer;
function aviso(msg) {
  const el = $("#aviso"); el.textContent = msg; el.hidden = false;
  el.classList.remove("sale"); void el.offsetWidth; el.classList.add("entra");
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { el.classList.add("sale"); setTimeout(() => (el.hidden = true), 200); }, 2200);
}

/* ---------------- Colores (subrayado y post-it) ---------------- */
const COLORES = [
  { c: "a", nombre: "Amarillo" }, { c: "v", nombre: "Verde" }, { c: "r", nombre: "Rosado" },
  { c: "z", nombre: "Celeste" }, { c: "n", nombre: "Naranjo" },
];
const CLAVE_COLORES = "alarticulo:colores:v1";
let ETIQUETAS = leer(CLAVE_COLORES, {});
const etiqueta = c => ETIQUETAS[c] || COLORES.find(x => x.c === c)?.nombre || c;

/* ---------------- Datos ---------------- */
let INDICE = null;                  // datos/indice.json
let API = false;                    // ¿hay servidor intermediario con la BCN?
const CODIGOS = {};                 // sigla → norma cargada
const cargas = {};                  // sigla → Promise
let ALIAS = [];                     // [[alias normalizado, sigla]] del más largo al más corto
const CLAVE_LEYES = "alarticulo:leyes:v1";
let LEYES = leer(CLAVE_LEYES, []);  // leyes abiertas a pedido: [{sigla, nombre, titulo}]

async function cargarIndice() {
  INDICE = await (await fetch("datos/indice.json")).json();
  INDICE.leyes = INDICE.leyes || [];
  for (const c of [...INDICE.codigos, ...INDICE.leyes]) for (const a of c.alias) ALIAS.push([normal(a), c.sigla]);
  ALIAS.sort((x, y) => y[0].length - x[0].length);
}
const esCodigo = s => INDICE.codigos.some(c => c.sigla === s);
const esPrecargada = s => INDICE.leyes.some(c => c.sigla === s);   // ley incluida en datos/ (funciona sin servidor)
const esNormaRemota = s => /^(ley\d+|n\d+)$/.test(s);
const urlBcnLey = s => /^ley\d+$/.test(s) ? `https://www.bcn.cl/leychile/navegar?idLey=${s.slice(3)}` : `https://www.bcn.cl/leychile/navegar?idNorma=${s.slice(1)}`;
function cargarCodigo(sigla) {
  if (!cargas[sigla]) {
    let url;
    if (esCodigo(sigla) || esPrecargada(sigla)) url = `datos/${sigla}.json`;
    else if (!API) return Promise.reject(new Error("sin servidor"));
    else if (/^ley\d+$/.test(sigla)) url = `api/norma?ley=${sigla.slice(3)}`;
    else if (/^n\d+$/.test(sigla)) url = `api/norma?id=${sigla.slice(1)}`;
    else return Promise.reject(new Error("desconocido"));
    cargas[sigla] = fetch(url).then(r => { if (!r.ok) throw new Error("BCN"); return r.json(); }).then(c => {
      c.porClave = new Map();
      c.articulos.forEach((a, i) => { a.pos = i; a.k = claveNum(a.n); a.base = a.k.match(/^\d+/)?.[0] || a.k; c.porClave.set(a.k, a); });
      CODIGOS[sigla] = c;
      if (!esCodigo(sigla) && !esPrecargada(sigla)) {
        LEYES = [{ sigla, nombre: c.nombre, titulo: c.nombreLargo || c.titulo }, ...LEYES.filter(l => l.sigla !== sigla)].slice(0, 30);
        guardar(CLAVE_LEYES, LEYES);
      }
      return c;
    }).catch(e => { delete cargas[sigla]; throw e; });
  }
  return cargas[sigla];
}
function nombreCodigo(s) {
  return [...INDICE.codigos, ...INDICE.leyes].find(c => c.sigla === s)?.nombre || CODIGOS[s]?.nombre
    || LEYES.find(l => l.sigla === s)?.nombre || (/^ley\d+$/.test(s) ? `Ley ${conPuntos(s.slice(3))}` : s.toUpperCase());
}
const etiquetaArt = a => `Art. ${a.n}`;

/* ---------------- Estado del artículo (¿fue modificado?) ---------------- */
function estadoArticulo(c, a) {
  const inicio = normal(a.t.slice(0, 90));
  if (a.t.length < 160 && /derogad[oa]/.test(inicio)) return { tipo: "derogado", texto: "Derogado" };
  const mods = [];
  for (const nota of a.m) {
    const f = nota.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    const n = nota.match(/^\s*(LEY|Ley|L\.|D\.?L\.?|D\.?F\.?L\.?|DFL|DL|Decreto|DTO)\s*(?:N[°º]?\s*)?([\d.]+)/i);
    if (/^\s*(CPR|C\.P\.R\.)\b/.test(nota)) continue;  // nota de origen de la Constitución, no es modificación
    const fecha = f ? `${f[3]}-${f[2].padStart(2, "0")}-${f[1].padStart(2, "0")}` : "";
    mods.push({ nota, fecha, norma: n ? `${/^l/i.test(n[1]) ? "Ley" : n[1].replace(/\./g, "").toUpperCase()} ${conPuntos(n[2].replace(/\./g, ""))}` : "" });
  }
  if (!mods.length && !a.mod) return { tipo: "original", texto: "Texto original · sin modificaciones" };
  const conFecha = mods.filter(m => m.fecha).sort((x, y) => x.fecha.localeCompare(y.fecha));
  const ultima = conFecha[conFecha.length - 1] || mods[mods.length - 1];
  const veces = Math.max(mods.length, 1);
  let texto = `Modificado${veces > 1 ? ` (${veces} cambios)` : ""}`;
  if (ultima?.norma || ultima?.fecha) texto += ` · último: ${[ultima.norma, ultima.fecha && "D.O. " + fechaCL(ultima.fecha)].filter(Boolean).join(", ")}`;
  return { tipo: "modificado", texto };
}

/* ---------------- Notas (solo en este dispositivo) ---------------- */
const CLAVE_NOTAS = "alarticulo:notas:v1";
let NOTAS = leer(CLAVE_NOTAS, {});
// Migración: la primera versión tenía una sola nota de texto por artículo
for (const n of Object.values(NOTAS)) {
  if (!n.postits) n.postits = n.texto ? [{ id: "p" + Date.now().toString(36), c: "a", texto: n.texto }] : [];
  delete n.texto;
}
const idNota = (sigla, a) => `${sigla}|${a.k}`;
const notaDe = (sigla, a) => NOTAS[idNota(sigla, a)];
function escribirNota(sigla, a, cambios) {
  const id = idNota(sigla, a);
  const actual = NOTAS[id] || { creado: new Date().toISOString(), subrayados: [], postits: [] };
  const nueva = { ...actual, ...cambios, n: a.n, sigla, hash: actual.hash && !cambios.rehash ? actual.hash : hash(a.t), editado: new Date().toISOString() };
  delete nueva.rehash;
  if (!nueva.postits.length && !nueva.subrayados.length) delete NOTAS[id]; else NOTAS[id] = nueva;
  if (!guardar(CLAVE_NOTAS, NOTAS)) aviso("No se pudo guardar en este navegador (¿modo privado?)");
}

/* ---------------- Búsqueda ---------------- */
const RELLENO = new Set(["art", "arts", "articulo", "articulos", "del", "de", "la", "el", "los", "codigo", "cod", "n", "no", "nro", "numero", "politica", "republica"]);
const SUFIJOS = "bis|ter|quater|quinquies|sexies|septies|octies|nonies|novies|decies|undecies|duodecies";
const RE_NUM = new RegExp(`(?:^|\\s)(\\d+)(?:\\s*-\\s*(\\d+|[a-zñ])\\b)?((?:\\s*(?:${SUFIJOS}|[a-zñ])\\b)*)(\\s*transitori[oa]s?)?(?=\\s|$)`);

function interpretar(texto) {
  let t = " " + normal(texto).replace(/[,;:()"'«»]/g, " ").replace(/\s+/g, " ") + " ";
  let sigla = null;
  // "ley 19.496", "ley 19496", "l. 19496"
  const ley = t.match(/(?:^|\s)(?:ley|l\.?)\s*(?:n\.?\s*)?(\d{1,2}\.?\d{3})(?=\s|$)/);
  if (ley) { sigla = "ley" + ley[1].replace(".", ""); t = t.replace(ley[0], " "); }
  t = t.replace(/\./g, " ");
  t = " " + t.trim().split(" ").filter(w => !RELLENO.has(w)).join(" ") + " ";
  if (!sigla) for (const [alias, s] of ALIAS) {
    const i = t.indexOf(" " + alias + " ");
    if (i >= 0) { sigla = s; t = t.slice(0, i) + " " + t.slice(i + alias.length + 1); break; }
  }
  if (!sigla) {  // abreviatura pegada al número: "182cpc", "cc1698"
    const m = t.match(/(?:^|\s)([a-z]{2,5})(\d+)\b|(?:^|\s)(\d+)([a-z]{2,5})(?=\s|$)/);
    if (m) {
      const ab = m[1] || m[4], num = m[2] || m[3];
      const hit = ALIAS.find(([a]) => a === ab);
      if (hit) { sigla = hit[1]; t = t.replace(m[0], " " + num + " "); }
    }
  }
  let num = null;
  const m = t.match(RE_NUM);
  if (m) {
    num = m[1] + (m[2] ? m[2] : "") + (m[3] || "").replace(/\s+/g, "") + (m[4] ? "transitorio" : "");
    t = t.replace(m[0], " ");
  }
  const palabras = t.trim().split(" ").filter(w => w.length > 1 && w !== "ley" && w !== "leyes");
  return { sigla, num, palabras };
}

const prioridadCodigos = () => [...new Set([...leer("alarticulo:recientes", []).map(r => r.sigla), ...INDICE.codigos.map(c => c.sigla)])]
  .filter(s => esCodigo(s) || CODIGOS[s]);

async function sugerir(texto) {
  const q = interpretar(texto);
  // Ley que todavía no está cargada: se pide a la BCN y se vuelve a sugerir cuando llegue
  if (q.sigla && esPrecargada(q.sigla) && !CODIGOS[q.sigla]) await cargarCodigo(q.sigla);
  if (q.sigla && !esCodigo(q.sigla) && !CODIGOS[q.sigla]) {
    if (!API) return [{ ayuda: `La ${esc(nombreCodigo(q.sigla))} todavía no está incluida en el prototipo. <a href="${urlBcnLey(q.sigla)}" target="_blank" rel="noopener">Ábrela en la BCN ↗</a>` }];
    cargarCodigo(q.sigla).then(() => { if (entrada.value === texto) actualizarSugerencias(); })
      .catch(() => { if (entrada.value === texto) mostrarSug([{ ayuda: `No encontré la ${esc(nombreCodigo(q.sigla))} en la BCN.` }]); });
    return [{ ayuda: `<span class="girando"></span> Trayendo la ${esc(nombreCodigo(q.sigla))} desde la BCN…` }];
  }
  const res = [];
  if (q.num) {
    const siglas = q.sigla ? [q.sigla] : prioridadCodigos();
    await Promise.all(siglas.map(cargarCodigo));
    for (const s of siglas) {
      const exacto = CODIGOS[s].porClave.get(q.num);
      if (exacto) res.push({ s, a: exacto });
    }
    for (const s of siglas) {
      for (const a of CODIGOS[s].articulos) {
        if (res.length >= 12) break;
        if (a.k === q.num) continue;
        const mismaBase = a.base === q.num && a.k.startsWith(q.num);
        const prefijo = q.sigla && /^\d+$/.test(q.num) && a.base.startsWith(q.num) && a.base.length <= q.num.length + 1;
        if (mismaBase || prefijo) res.push({ s, a });
      }
    }
    if (!res.length) return [{ ayuda: `No encontré el artículo ${esc(q.num)}${q.sigla ? " en " + esc(nombreCodigo(q.sigla)) : ""}.` }];
    return res.slice(0, 10);
  }
  if (q.sigla && !q.palabras.length) {
    return [{ s: q.sigla, indice: true }, { ayuda: "Escribe el número del artículo, por ejemplo <b>" + esc(q.sigla.startsWith("ley") ? "art 1 " + nombreCodigo(q.sigla).toLowerCase() : q.sigla + " 1") + "</b>." }];
  }
  if (q.palabras.length && q.palabras.join("").length >= 3) {
    // Leyes precargadas cuyo tema coincide ("arriendo", "consumidor"): primero, para abrirlas directo
    const leyes = q.sigla ? [] : INDICE.leyes.filter(l => q.palabras.every(w => normal(l.tema + " " + l.alias.join(" ") + " " + l.nombre).includes(w)))
      .slice(0, 3).map(l => ({ s: l.sigla, indice: true }));
    const arts = await buscarTexto(q.palabras, q.sigla);
    if (!leyes.length) return arts;
    return Object.assign([{ titulo: "Leyes" }, ...leyes, { titulo: "Artículos" }, ...arts.filter(x => !x.ayuda)], { palabras: arts.palabras });
  }
  return [];
}

async function buscarTexto(palabras, sigla) {
  // Códigos + leyes ya abiertas (las precargadas se buscan cuando se abren, para no descargarlas todas)
  const siglas = sigla ? [sigla] : [...new Set([...INDICE.codigos.map(c => c.sigla), ...Object.keys(CODIGOS)])];
  await Promise.all(siglas.map(cargarCodigo));
  const res = [];
  const frase = palabras.join(" ");
  for (const s of siglas) {
    for (const a of CODIGOS[s].articulos) {
      if (!a.tn) a.tn = normal(a.t);
      let puntos = 0, ok = true;
      for (const w of palabras) {
        const i = a.tn.indexOf(w);
        if (i < 0) { ok = false; break; }
        puntos += 1 + (a.tn.split(w).length - 2) * 0.2 + (i < 120 ? 0.5 : 0);
      }
      if (!ok) continue;
      if (palabras.length > 1 && a.tn.includes(frase)) puntos += 2 + (a.tn.split(frase).length - 2) * 0.5;
      res.push({ s, a, puntos });
    }
  }
  res.sort((x, y) => y.puntos - x.puntos);
  const top = res.slice(0, 25);
  if (!top.length) top.push({ ayuda: "Sin resultados en los códigos." });
  top.palabras = palabras;
  return top;
}

function fragmento(a, palabras) {
  const t = a.t.replace(/\s+/g, " ");
  const tn = normal(t);
  let i = palabras ? Math.min(...palabras.map(w => { const p = tn.indexOf(w); return p < 0 ? 1e9 : p; })) : 0;
  if (i === 1e9) i = 0;
  const desde = Math.max(0, i - 50);
  let html = esc((desde ? "…" : "") + t.slice(desde, desde + 170));
  if (palabras) for (const w of palabras) {
    const pat = w.replace(/[aeiounc]/g, ch => ({ a: "[aáà]", e: "[eéè]", i: "[iíì]", o: "[oóò]", u: "[uúüù]", n: "[nñ]", c: "[cç]" }[ch]));
    html = html.replace(new RegExp(`(${pat})`, "gi"), "<b>$1</b>");
  }
  return html;
}

/* ---------------- Filtro: solo artículos con notas ---------------- */
let soloNotas = false;
const botonNotas = $("#filtro-notas");
const RE_NOTAS = /^\s*(mis\s+)?notas?\b\s*/i;
function ponerSoloNotas(v) {
  soloNotas = v;
  botonNotas.setAttribute("aria-pressed", String(v));
  entrada.placeholder = v ? "Buscar en mis notas…" : "182 cpc · art 1698 cc · nulidad";
}
botonNotas.addEventListener("pointerdown", e => e.preventDefault());   // no cierra el teclado
botonNotas.addEventListener("click", () => {
  ponerSoloNotas(!soloNotas);
  entrada.focus();
  actualizarSugerencias();
});
async function sugerirNotas(texto) {
  const entradas = Object.values(NOTAS);
  if (!entradas.length) return [{ ayuda: "Aún no tienes notas. Abre un artículo y pega un post-it o subraya texto." }];
  const q = interpretar(texto);
  const siglas = [...new Set(entradas.map(n => n.sigla))];
  await Promise.all(siglas.map(s => cargarCodigo(s).catch(() => null)));
  const res = [];
  for (const n of entradas) {
    const c = CODIGOS[n.sigla]; if (!c) continue;
    const a = c.porClave.get(claveNum(n.n)); if (!a) continue;
    if (q.sigla && q.sigla !== n.sigla) continue;
    if (q.num && !a.k.startsWith(q.num)) continue;
    if (q.palabras.length) {
      const enNotas = normal(n.postits.map(p => p.texto + " " + etiqueta(p.c)).join(" "));
      if (!a.tn) a.tn = normal(a.t);
      if (!q.palabras.every(w => enNotas.includes(w) || a.tn.includes(w) || normal(c.nombre).includes(w))) continue;
    }
    res.push({ s: n.sigla, a, nota: n });
  }
  res.sort((x, y) => (y.nota.editado || "").localeCompare(x.nota.editado || ""));
  if (!res.length) return [{ ayuda: "Ninguna nota coincide con esa búsqueda." }];
  return Object.assign([{ titulo: `Artículos con notas (${res.length})` }, ...res.slice(0, 30)], { palabras: q.palabras });
}

/* ---------------- Sugerencias (UI) ---------------- */
let sugActual = [], sugSel = -1, turno = 0, timerBcn;
function htmlSug(x, i, palabras) {
  if (x.ayuda) return `<li class="sug-ayuda" role="option">${x.ayuda}</li>`;
  if (x.nota) {
    const ps = x.nota.postits.filter(p => p.texto.trim());
    const detalle = ps.length
      ? ps.slice(0, 2).map(p => `<span class="sug-postit"><span class="dot mini c-${p.c}"></span>${esc(p.texto.slice(0, 90))}</span>`).join("")
      : `${x.nota.subrayados.length} subrayado(s) · ${fragmento(x.a, palabras)}`;
    return `<li role="option" data-i="${i}" aria-selected="${i === sugSel}">
      <div class="sug-titulo">${esc(etiquetaArt(x.a))} · ${esc(nombreCodigo(x.s))}</div>
      <div class="sug-texto">${detalle}</div></li>`;
  }
  if (x.titulo) return `<li class="sug-seccion" role="presentation">${esc(x.titulo)}</li>`;
  if (x.indice) return `<li role="option" data-i="${i}"><div class="sug-titulo">${esc(nombreCodigo(x.s))}</div><div class="sug-texto">${esc(INDICE.leyes.find(l => l.sigla === x.s)?.tema || CODIGOS[x.s]?.nombreLargo || "Ver índice completo")}</div></li>`;
  if (x.bcn) return `<li role="option" data-i="${i}"><div class="sug-titulo">${esc(x.bcn.norma)}${x.bcn.derogada ? ' <span class="etq derogado">Derogada</span>' : ""}</div><div class="sug-texto">${esc(x.bcn.comun || x.bcn.titulo)}</div></li>`;
  const marcas = notaDe(x.s, x.a) ? `<span class="nota-ic" title="Tiene notas">📝</span>` : "";
  return `<li role="option" data-i="${i}" aria-selected="${i === sugSel}">
    <div class="sug-titulo">${esc(etiquetaArt(x.a))} · ${esc(nombreCodigo(x.s))}${marcas}</div>
    <div class="sug-texto">${fragmento(x.a, palabras)}</div></li>`;
}
function mostrarSug(items) {
  sugActual = items; sugSel = items.findIndex(x => x.a || x.indice || x.bcn);
  listaSug.innerHTML = items.map((x, i) => htmlSug(x, i, items.palabras)).join("");
  const estabaOculta = listaSug.hidden;
  listaSug.hidden = !items.length;
  if (estabaOculta && items.length && MOVIMIENTO) { listaSug.classList.remove("abre"); void listaSug.offsetWidth; listaSug.classList.add("abre"); }
}
async function actualizarSugerencias() {
  const texto = entrada.value;
  const mio = ++turno;
  clearTimeout(timerBcn);
  // Modo notas: con el botón 📝 o escribiendo "notas …"
  if (soloNotas || RE_NOTAS.test(texto)) {
    const items = await sugerirNotas(texto.replace(RE_NOTAS, ""));
    if (mio === turno) mostrarSug(items);
    return;
  }
  if (!texto.trim()) { cerrarSug(); return; }
  const items = await sugerir(texto);
  if (mio !== turno) return;
  mostrarSug(items);
  // Búsqueda por palabras: además, normas de la BCN cuyo título coincide
  const q = interpretar(texto);
  if (API && !q.num && !q.sigla && q.palabras.join("").length >= 4) {
    timerBcn = setTimeout(async () => {
      try {
        const r = await (await fetch(`api/buscar?q=${encodeURIComponent(texto)}`)).json();
        if (mio !== turno || !r.length) return;
        const locales = items.filter(x => !x.ayuda);
        const extra = [{ titulo: "Leyes y normas en la BCN" }, ...r.slice(0, 6).map(b => ({ bcn: b }))];
        const todos = Object.assign([
          ...(locales.length ? [{ titulo: "Artículos de los códigos" }, ...locales.slice(0, 5)] : []),
          ...extra,
          ...(locales.length > 5 ? [{ titulo: "Más artículos" }, ...locales.slice(5)] : []),
        ], { palabras: items.palabras });
        mostrarSug(todos);
      } catch { /* sin conexión con la BCN: quedan los resultados locales */ }
    }, 350);
  }
}
function cerrarSug() { listaSug.hidden = true; sugActual = []; sugSel = -1; }
function elegir(i) {
  const x = sugActual[i];
  if (!x || x.ayuda || x.titulo) return;
  cerrarSug(); entrada.value = ""; entrada.blur(); ponerSoloNotas(false);
  if (x.bcn) return navegar(`#/n${x.bcn.idNorma}`);
  navegar(x.indice ? `#/${x.s}` : `#/${x.s}/${encodeURIComponent(x.a.n)}`);
}
entrada.addEventListener("input", actualizarSugerencias);
entrada.addEventListener("focus", () => { if (entrada.value || soloNotas) actualizarSugerencias(); });
entrada.addEventListener("keydown", e => {
  const elegibles = sugActual.map((x, i) => (x.a || x.indice || x.bcn ? i : -1)).filter(i => i >= 0);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!elegibles.length) return;
    const pos = elegibles.indexOf(sugSel);
    sugSel = elegibles[(pos + (e.key === "ArrowDown" ? 1 : elegibles.length - 1)) % elegibles.length];
    listaSug.querySelectorAll("li").forEach(li => li.setAttribute("aria-selected", li.dataset.i == sugSel));
    listaSug.querySelector(`li[data-i="${sugSel}"]`)?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (sugSel >= 0) elegir(sugSel);
    else actualizarSugerencias().then(() => { if (sugSel >= 0) elegir(sugSel); });
  } else if (e.key === "Escape") { cerrarSug(); }
});
listaSug.addEventListener("pointerdown", e => e.preventDefault());
listaSug.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) elegir(+li.dataset.i); });
document.addEventListener("click", e => { if (!e.target.closest(".caja-busqueda, #filtro-notas")) cerrarSug(); });
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== entrada && !/textarea|input/i.test(document.activeElement.tagName)) {
    e.preventDefault(); entrada.focus();
  }
});

/* ---------------- Navegación con transición ---------------- */
function navegar(hash) { if (location.hash === hash) router(); else location.hash = hash; }
const rutaActual = () => location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent).filter(Boolean);
let rutaPrevia = null;
async function router() {
  guardarPendiente(); cerrarSug(); ocultarBarraSub();
  const ruta = rutaActual();
  const [a, b] = ruta;
  const anterior = rutaPrevia; rutaPrevia = ruta;
  // Dirección para la animación: siguiente artículo → desde la derecha; anterior → desde la izquierda
  let dir = "";
  if (anterior && anterior[0] === a && b && anterior[1] && CODIGOS[a]) {
    const pa = CODIGOS[a].porClave.get(claveNum(anterior[1]))?.pos, pb = CODIGOS[a].porClave.get(claveNum(b))?.pos;
    if (pa != null && pb != null) dir = pb > pa ? "der" : "izq";
  }
  const pintar = async () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (!a) return vistaInicio();
    if (a === "notas") return vistaNotas();
    if (a === "prueba") return vistaPrueba();
    if (a === "acerca") return vistaAcerca();
    if (a === "leyes") return vistaLeyes();
    if (!esCodigo(a) && !esNormaRemota(a)) return vistaInicio();
    if (!b) return vistaIndiceCodigo(a);
    return vistaArticulo(a, b);
  };
  if (MOVIMIENTO) {
    vista.dataset.dir = dir;
    vista.classList.remove("entra"); void vista.offsetWidth;
    await pintar();
    vista.classList.add("entra");
  } else await pintar();
}
window.addEventListener("hashchange", router);

/* ---------------- Vistas ---------------- */
function vistaInicio() {
  const recientes = leer("alarticulo:recientes", []);
  const n = Object.keys(NOTAS).length;
  const leyesAbiertas = LEYES.slice(0, 6);
  vista.innerHTML = `
    <h1>Escribe el artículo, llega al artículo.</h1>
    <p class="pista ejemplos">Prueba: <code>182 cpc</code> <code>1698 cc</code> <code>160 ct</code> <code>19 cpr</code>${API ? " <code>art 3 ley 19496</code>" : ""} <code>nulidad absoluta</code></p>
    ${recientes.length ? `<h2>Recientes</h2><ul class="lista">${recientes.map(r =>
      `<li><a href="#/${r.sigla}/${encodeURIComponent(r.n)}">Art. ${esc(r.n)} · ${esc(nombreCodigo(r.sigla))}</a></li>`).join("")}</ul>` : ""}
    <h2>Códigos</h2>
    <div class="grilla">${INDICE.codigos.map(c =>
      `<a href="#/${c.sigla}"><b>${esc(c.alias[0])}</b>${esc(c.nombre)}</a>`).join("")}</div>
    ${API || INDICE.leyes.length ? `<h2>Leyes</h2>
      <p class="pista">${API ? "Cualquier ley de la Biblioteca del Congreso" : `${INDICE.leyes.length} leyes de uso frecuente`}: escribe <code>art 3 ley 19496</code> o busca por tema (<code>arriendo</code>).</p>
      <ul class="lista">${[...leyesAbiertas.map(l => [l.titulo, l.sigla, l.nombre]),
        ...INDICE.leyes.filter(l => !leyesAbiertas.some(x => x.sigla === l.sigla)).slice(0, 8 - Math.min(leyesAbiertas.length, 4))
          .map(l => [l.tema, l.sigla, l.nombre])]
        .map(([t, s, nom]) => `<li><a href="#/${s}">${esc(nom)}<small>${esc(t)}</small></a></li>`).join("")}
        ${INDICE.leyes.length > 8 ? `<li><a href="#/leyes"><b>Ver todas las leyes (${INDICE.leyes.length})</b></a></li>` : ""}</ul>` : ""}
    <h2>Más</h2>
    <ul class="lista">
      <li><a href="#/notas">Mis notas <small>${n ? n + " artículo(s) anotado(s)" : "Subraya y pega post-it en los artículos que usas"}</small></a></li>
      <li><a href="#/prueba">Prueba de tiempo <small>Cronometra cuánto tardas en llegar a 3 artículos</small></a></li>
      <li><a href="#/acerca">Acerca de este prototipo <small>De dónde salen los textos y dónde quedan tus notas</small></a></li>
    </ul>`;
  vista.querySelectorAll(".ejemplos code, .pista code").forEach(c => c.addEventListener("click", () => {
    entrada.value = c.textContent; entrada.focus(); actualizarSugerencias();
  }));
}

function lineaNorma(c) {
  const partes = [];
  if (c.identificacion) partes.push(c.identificacion);
  if (c.vigenteDesde) partes.push(`versión vigente desde ${fechaCL(c.vigenteDesde)}`);
  if (c.versiones > 1) partes.push(`${c.versiones} versiones`);
  let html = esc(partes.join(" · "));
  if (c.refundida) html += `<br>Texto refundido en ${esc(c.refundida.norma)} (${esc(c.refundida.fecha)})`;
  if (c.derogada) html = `<span class="etq derogado">Derogada</span> ` + html;
  return html;
}

async function vistaIndiceCodigo(sigla) {
  vista.innerHTML = `<p class="cargando"><span class="girando"></span> Cargando…</p>`;
  let c;
  try { c = await cargarCodigo(sigla); }
  catch { vista.innerHTML = `<p>No se pudo traer ${esc(nombreCodigo(sigla))} desde la BCN.</p>`; return; }
  const conNotas = c.articulos.filter(a => notaDe(sigla, a));
  const filtrar = indiceSoloNotas && conNotas.length;
  let html = `<div class="codigo-nombre">${esc(c.nombre)}</div><h1>${esc(c.nombreLargo ? c.nombreLargo : "Índice")}</h1>
    <p class="pista">${c.articulos.length} artículos · ${lineaNorma(c)}</p>
    ${conNotas.length ? `<div class="filtros">
      <button class="chip ${!filtrar ? "activo" : ""}" data-indice-notas="0">Todos</button>
      <button class="chip ${filtrar ? "activo" : ""}" data-indice-notas="1">📝 Con notas (${conNotas.length})</button></div>` : ""}`;
  let rutaPrev = "";
  html += `<ul class="lista">`;
  for (const a of (filtrar ? conNotas : c.articulos)) {
    const r = a.r.join(" › ");
    if (r !== rutaPrev) { html += `</ul><h2>${esc(a.r[a.r.length - 1] || "General")}</h2><ul class="lista">`; rutaPrev = r; }
    html += `<li><a href="#/${sigla}/${encodeURIComponent(a.n)}">${esc(etiquetaArt(a))}${notaDe(sigla, a) ? " 📝" : ""}
      <small>${esc(filtrar ? (notaDe(sigla, a).postits.map(p => p.texto).filter(Boolean).join(" · ") || `${notaDe(sigla, a).subrayados.length} subrayado(s)`).slice(0, 120)
        : a.t.replace(/^\s*(Art[íi]culo|Art\.|ART[ÍI]CULO|ART\.)\s*[^\s]+\s*/, "").slice(0, 90) + "…")}</small></a></li>`;
  }
  vista.innerHTML = html + `</ul>`;
  vista.querySelectorAll("[data-indice-notas]").forEach(b => b.addEventListener("click", () => {
    indiceSoloNotas = b.dataset.indiceNotas === "1"; vistaIndiceCodigo(sigla);
  }));
}
let indiceSoloNotas = false;

let artActual = null;
async function vistaArticulo(sigla, n) {
  if (!CODIGOS[sigla]) vista.innerHTML = `<p class="cargando"><span class="girando"></span> Cargando…</p>`;
  let c;
  try { c = await cargarCodigo(sigla); }
  catch { vista.innerHTML = `<p>No se pudo traer ${esc(nombreCodigo(sigla))} desde la BCN.</p>`; return; }
  const a = c.porClave.get(claveNum(n));
  if (!a) { vista.innerHTML = `<p>No encontré el artículo ${esc(n)} en ${esc(c.nombre)}.</p>`; return; }
  artActual = { sigla, a };
  registrarReciente(sigla, a);
  comprobarPrueba(sigla, a);
  const prev = c.articulos[a.pos - 1], sig = c.articulos[a.pos + 1];
  const nota = notaDe(sigla, a);
  const cambio = nota && nota.hash !== hash(a.t);
  const estado = estadoArticulo(c, a);
  const urlBcn = `https://www.bcn.cl/leychile/navegar?idNorma=${c.idNorma}&idParte=${a.i}`;
  vista.innerHTML = `
    <div class="codigo-nombre">${esc(c.nombre)}</div>
    <div class="ruta">${a.r.map(x => `<span>${esc(x)}</span>`).join("")}</div>
    <h1>Artículo ${esc(a.n)}</h1>
    <button class="estado ${estado.tipo}" id="estado" aria-expanded="false">
      <span class="punto"></span>${esc(estado.texto)}${a.m.length ? ' <span class="flecha">›</span>' : ""}
    </button>
    ${a.m.length ? `<div class="historial" id="historial" hidden><b>Historial (notas de la BCN)</b><ul>${a.m.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <a href="${urlBcn}" target="_blank" rel="noopener">Ver versiones en la BCN ↗</a></div>` : ""}
    <p class="vigencia">${lineaNorma(c)}</p>
    ${cambio ? `<div class="alerta-cambio">⚠️ <b>Este artículo cambió</b> desde que lo anotaste. Revisa tus subrayados y post-it.
      <button class="enlace" id="visto">Entendido</button></div>` : ""}
    <div class="texto-ley" id="texto"></div>
    <section class="postits" id="postits"></section>
    <div class="acciones">
      <button class="boton" id="copiar">Copiar cita</button>
      <a class="boton" href="${urlBcn}" target="_blank" rel="noopener">Ver en BCN ↗</a>
    </div>
    <nav class="navegacion">
      ${prev ? `<a class="boton" href="#/${sigla}/${encodeURIComponent(prev.n)}">← Art. ${esc(prev.n)}</a>` : "<span></span>"}
      ${sig ? `<a class="boton" href="#/${sigla}/${encodeURIComponent(sig.n)}">Art. ${esc(sig.n)} →</a>` : "<span></span>"}
    </nav>
    <p class="fuente">Texto de LeyChile (BCN), descargado el ${esc(fechaCL(c.descargado))}.
      Prototipo de prueba: confirma siempre en la <a href="${urlBcn}" target="_blank" rel="noopener">versión oficial</a>.</p>`;
  pintarTexto();
  pintarPostits();
  $("#estado").addEventListener("click", () => {
    const h = $("#historial"); if (!h) return;
    h.hidden = !h.hidden; $("#estado").setAttribute("aria-expanded", String(!h.hidden));
    if (!h.hidden && MOVIMIENTO) { h.classList.remove("abre"); void h.offsetWidth; h.classList.add("abre"); }
  });
  $("#visto")?.addEventListener("click", () => {
    escribirNota(sigla, a, { rehash: true });
    $(".alerta-cambio").classList.add("sale"); setTimeout(() => $(".alerta-cambio")?.remove(), 220);
  });
  $("#copiar").addEventListener("click", async () => {
    const cita = `Artículo ${a.n} del ${c.nombre}: «${a.t.replace(/\s+/g, " ").trim()}»`;
    try { await navigator.clipboard.writeText(cita); aviso("Cita copiada"); } catch { aviso("No se pudo copiar"); }
  });
}

/* ---------------- Post-it (varios por artículo, cada uno con su color) ---------------- */
function pintarPostits(enfocar) {
  const { sigla, a } = artActual;
  const nota = notaDe(sigla, a);
  const lista = nota?.postits || [];
  const subs = nota?.subrayados || [];
  const caja = $("#postits");
  caja.innerHTML = `
    ${lista.map(p => {
      const nSubs = subs.filter(s => s.c === p.c).length;
      return `<div class="postit c-${p.c}" data-id="${p.id}">
        <div class="postit-cab">
          <button class="postit-color" data-accion="color" aria-label="Cambiar color">${esc(etiqueta(p.c))}</button>
          ${nSubs ? `<button class="enlace postit-subs" data-accion="ver-subs" data-c="${p.c}">${nSubs} subrayado${nSubs > 1 ? "s" : ""} ↑</button>` : ""}
          <button class="postit-borrar" data-accion="borrar" aria-label="Eliminar post-it">×</button>
        </div>
        <div class="selector-color" hidden>${COLORES.map(x => `<button class="dot c-${x.c}" data-accion="poner-color" data-c="${x.c}" aria-label="${esc(etiqueta(x.c))}"></button>`).join("")}</div>
        <textarea rows="2" placeholder="Escribe aquí…" aria-label="Post-it ${esc(etiqueta(p.c))}">${esc(p.texto)}</textarea>
      </div>`;
    }).join("")}
    <div class="nuevo-postit">
      <span class="pista">${lista.length ? "Otro post-it:" : "Pega un post-it:"}</span>
      ${COLORES.map(x => `<button class="dot c-${x.c}" data-accion="nuevo" data-c="${x.c}" aria-label="Nuevo post-it ${esc(etiqueta(x.c))}" title="${esc(etiqueta(x.c))}"></button>`).join("")}
    </div>
    ${!lista.length && !subs.length ? `<p class="pista ayuda-sub">Para subrayar, selecciona texto del artículo.</p>` : ""}`;
  caja.querySelectorAll("textarea").forEach(autoAltura);
  if (enfocar) {
    const el = caja.querySelector(`.postit[data-id="${enfocar}"]`);
    if (el && MOVIMIENTO) el.classList.add("nace");
    el?.querySelector("textarea").focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest", behavior: MOVIMIENTO ? "smooth" : "auto" });
  }
}
function autoAltura(t) { t.style.height = "auto"; t.style.height = Math.max(64, t.scrollHeight) + "px"; }
function cambiarPostits(fn) {
  const { sigla, a } = artActual;
  const nota = notaDe(sigla, a);
  const postits = fn((nota?.postits || []).map(p => ({ ...p })));
  escribirNota(sigla, a, { postits, subrayados: nota?.subrayados || [] });
}
let timerPostit, postitPendiente = null;
function guardarPendiente() {   // guarda lo escrito antes de redibujar o cambiar de vista
  if (!postitPendiente) return;
  clearTimeout(timerPostit);
  const f = postitPendiente; postitPendiente = null; f();
}
vista.addEventListener("input", e => {
  const t = e.target.closest(".postit textarea"); if (!t) return;
  autoAltura(t);
  const id = t.closest(".postit").dataset.id;
  clearTimeout(timerPostit);
  postitPendiente = () => cambiarPostits(ps => ps.map(p => p.id === id ? { ...p, texto: t.value, editado: new Date().toISOString() } : p));
  timerPostit = setTimeout(guardarPendiente, 300);
});
window.addEventListener("pagehide", guardarPendiente);
document.addEventListener("visibilitychange", () => { if (document.hidden) guardarPendiente(); });
vista.addEventListener("click", e => {
  const b = e.target.closest("#postits [data-accion]"); if (!b) return;
  guardarPendiente();
  const accion = b.dataset.accion;
  const caja = b.closest(".postit");
  const id = caja?.dataset.id;
  if (accion === "nuevo") {
    const nuevo = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), c: b.dataset.c, texto: "", creado: new Date().toISOString() };
    cambiarPostits(ps => [...ps, nuevo]);
    pintarPostits(nuevo.id);
  } else if (accion === "color") {
    const sel = caja.querySelector(".selector-color"); sel.hidden = !sel.hidden;
  } else if (accion === "poner-color") {
    cambiarPostits(ps => ps.map(p => p.id === id ? { ...p, c: b.dataset.c } : p));
    pintarPostits();
  } else if (accion === "borrar") {
    const texto = caja.querySelector("textarea").value.trim();
    if (texto && !confirm("¿Eliminar este post-it?")) return;
    const quitar = () => { cambiarPostits(ps => ps.filter(p => p.id !== id)); pintarPostits(); };
    if (MOVIMIENTO) { caja.classList.add("muere"); setTimeout(quitar, 200); } else quitar();
  } else if (accion === "ver-subs") {
    const m = $(`#texto mark.${b.dataset.c}`);
    if (m) { m.scrollIntoView({ block: "center", behavior: MOVIMIENTO ? "smooth" : "auto" }); destellar(m); }
  }
});
function destellar(el) { if (!MOVIMIENTO) return; el.classList.remove("destello"); void el.offsetWidth; el.classList.add("destello"); }

/* ---------------- Subrayado ---------------- */
function pintarTexto() {
  const { sigla, a } = artActual;
  const subs = notaDe(sigla, a)?.subrayados || [];
  const L = a.t.length;
  const partes = [];
  let pos = 0;
  for (const s of [...subs].sort((x, y) => x.a - y.a)) {
    const ini = Math.max(pos, Math.min(s.a, L)), fin = Math.min(s.b, L);
    if (fin <= ini) continue;
    partes.push(esc(a.t.slice(pos, ini)));
    partes.push(`<mark class="${s.c}" title="${esc(etiqueta(s.c))}">${esc(a.t.slice(ini, fin))}</mark>`);
    pos = fin;
  }
  partes.push(esc(a.t.slice(pos)));
  $("#texto").innerHTML = partes.join("");
}
function offsetsSeleccion() {
  const sel = window.getSelection();
  const el = $("#texto");
  if (!el || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const a = pre.toString().length;
  const b = a + r.toString().length;
  return b > a ? { a, b } : null;
}
function aplicarColor(color, rango) {
  guardarPendiente();
  const { sigla, a } = artActual;
  const L = a.t.length;
  const nota = notaDe(sigla, a);
  const capa = new Array(L).fill("");
  for (const s of nota?.subrayados || []) for (let i = s.a; i < Math.min(s.b, L); i++) capa[i] = s.c;
  for (let i = rango.a; i < Math.min(rango.b, L); i++) capa[i] = color;
  const subrayados = [];
  for (let i = 0; i < L;) {
    if (!capa[i]) { i++; continue; }
    let j = i; while (j < L && capa[j] === capa[i]) j++;
    subrayados.push({ a: i, b: j, c: capa[i] });
    i = j;
  }
  escribirNota(sigla, a, { subrayados, postits: nota?.postits || [] });
  pintarTexto();
  pintarPostits();
  window.getSelection().removeAllRanges();
  ocultarBarraSub();
  // Asociación color ↔ post-it: si hay un post-it de ese color, se destaca
  const p = color && $(`#postits .postit.c-${color}`);
  if (p) destellar(p);
}
const barraSub = $("#barra-subrayado");
barraSub.innerHTML = COLORES.map(x => `<button data-color="${x.c}" class="color c-${x.c}" aria-label="Subrayar ${esc(etiqueta(x.c))}"></button>`).join("")
  + `<button data-color="" class="quitar">Quitar</button>`;
let rangoPendiente = null;
function ocultarBarraSub() {
  if (barraSub.hidden) return;
  rangoPendiente = null;
  if (MOVIMIENTO) { barraSub.classList.add("sale"); setTimeout(() => { barraSub.hidden = true; barraSub.classList.remove("sale"); }, 160); }
  else barraSub.hidden = true;
}
document.addEventListener("selectionchange", () => {
  const r = offsetsSeleccion();
  if (r) {
    rangoPendiente = r;
    if (barraSub.hidden) { barraSub.classList.remove("sale"); barraSub.hidden = false; }
  } else setTimeout(() => { if (!offsetsSeleccion()) ocultarBarraSub(); }, 150);
});
barraSub.addEventListener("pointerdown", e => e.preventDefault());
barraSub.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const r = offsetsSeleccion() || rangoPendiente;
  if (r) aplicarColor(b.dataset.color, r);
});
// Tocar un subrayado: lo selecciona (para cambiarle el color o quitarlo) y destaca el post-it del mismo color
vista.addEventListener("click", e => {
  const m = e.target.closest("#texto mark");
  if (!m || !window.getSelection().isCollapsed) return;
  const r = document.createRange(); r.selectNodeContents(m);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  const p = $(`#postits .postit.${[...m.classList].map(c => "c-" + c).find(c => c.length === 3)}`);
  if (p) destellar(p);
});

/* ---------------- Recientes ---------------- */
function registrarReciente(sigla, a) {
  const lista = leer("alarticulo:recientes", []).filter(r => !(r.sigla === sigla && r.n === a.n));
  lista.unshift({ sigla, n: a.n });
  guardar("alarticulo:recientes", lista.slice(0, 8));
}

/* ---------------- Mis notas ---------------- */
let filtroColor = "";
function vistaNotas() {
  const items = Object.entries(NOTAS)
    .filter(([, x]) => !filtroColor || x.postits.some(p => p.c === filtroColor) || x.subrayados.some(s => s.c === filtroColor))
    .sort((x, y) => (y[1].editado || "").localeCompare(x[1].editado || ""));
  vista.innerHTML = `
    <h1>Mis notas</h1>
    <p class="pista">Se guardan <b>solo en este dispositivo y navegador</b>. Usa “Exportar respaldo” para no perderlas.</p>
    <div class="filtros">
      <button class="chip ${!filtroColor ? "activo" : ""}" data-filtro="">Todas</button>
      ${COLORES.map(x => `<button class="chip ${filtroColor === x.c ? "activo" : ""}" data-filtro="${x.c}"><span class="dot mini c-${x.c}"></span>${esc(etiqueta(x.c))}</button>`).join("")}
    </div>
    ${items.length ? `<ul class="lista">${items.map(([, x]) => `
      <li><a href="#/${x.sigla}/${encodeURIComponent(x.n)}">Art. ${esc(x.n)} · ${esc(nombreCodigo(x.sigla))}
        ${x.postits.filter(p => !filtroColor || p.c === filtroColor).map(p => `<small class="linea-postit"><span class="dot mini c-${p.c}"></span>${esc(p.texto.slice(0, 110) || "(post-it vacío)")}</small>`).join("")}
        ${x.subrayados.length ? `<small>${x.subrayados.length} subrayado(s)</small>` : ""}</a></li>`).join("")}</ul>`
      : `<div class="tarjeta">${filtroColor ? "No hay notas de ese color." : "Aún no tienes notas. Abre un artículo, selecciona texto para subrayarlo o pega un post-it."}</div>`}
    <h2>¿Qué significa cada color?</h2>
    <div class="tarjeta colores-edit">${COLORES.map(x => `
      <label><span class="dot c-${x.c}"></span><input data-color="${x.c}" value="${esc(ETIQUETAS[x.c] || "")}" placeholder="${esc(x.nombre)} (p. ej. Plazos, Jurisprudencia…)" maxlength="24"></label>`).join("")}
    </div>
    <div class="acciones">
      <button class="boton" id="exportar">Exportar respaldo</button>
      <label class="boton">Importar respaldo<input type="file" id="importar" accept="application/json" hidden></label>
    </div>`;
  vista.querySelectorAll("[data-filtro]").forEach(b => b.addEventListener("click", () => { filtroColor = b.dataset.filtro; vistaNotas(); }));
  vista.querySelectorAll(".colores-edit input").forEach(i => i.addEventListener("change", () => {
    const v = i.value.trim();
    if (v) ETIQUETAS[i.dataset.color] = v; else delete ETIQUETAS[i.dataset.color];
    guardar(CLAVE_COLORES, ETIQUETAS); aviso("Guardado");
    barraSub.querySelectorAll("[data-color]").forEach(b => b.dataset.color && b.setAttribute("aria-label", "Subrayar " + etiqueta(b.dataset.color)));
  }));
  $("#exportar").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "al-articulo", version: 2, notas: NOTAS, colores: ETIQUETAS }, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const enlace = Object.assign(document.createElement("a"), { href: url, download: `mis-notas-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#importar").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const datos = JSON.parse(await f.text());
      if (datos.app !== "al-articulo" || typeof datos.notas !== "object") throw new Error();
      for (const n of Object.values(datos.notas)) { if (!n.postits) n.postits = n.texto ? [{ id: "p" + Math.random().toString(36).slice(2), c: "a", texto: n.texto }] : []; delete n.texto; }
      NOTAS = { ...NOTAS, ...datos.notas };
      if (datos.colores) { ETIQUETAS = { ...ETIQUETAS, ...datos.colores }; guardar(CLAVE_COLORES, ETIQUETAS); }
      guardar(CLAVE_NOTAS, NOTAS); aviso("Notas importadas"); vistaNotas();
    } catch { aviso("Ese archivo no es un respaldo válido"); }
  });
}

/* ---------------- Prueba de tiempo ---------------- */
const OBJETIVOS = [
  { sigla: "cpc", n: "182", txt: "Artículo 182 del Código de Procedimiento Civil" },
  { sigla: "cc", n: "1698", txt: "Artículo 1698 del Código Civil" },
  { sigla: "ct", n: "160", txt: "Artículo 160 del Código del Trabajo" },
];
const CLAVE_PRUEBA = "alarticulo:prueba:v1";
let pruebaEnCurso = leer("alarticulo:prueba-en-curso", null);
let relojManual = null;

function vistaPrueba() {
  const hist = leer(CLAVE_PRUEBA, []);
  vista.innerHTML = `
    <h1>Prueba de tiempo</h1>
    <p class="pista">Mide cuánto tardas en llegar a cada artículo. Primero con lo que usas siempre (Google, LeyChile, IURA…) usando el cronómetro manual; después con esta app: el tiempo se detiene solo al abrir el artículo correcto.</p>
    <h2>Con esta app</h2>
    <div class="tarjeta">${OBJETIVOS.map((o, i) => `
      <div class="prueba-fila"><span>${esc(o.txt)}</span><button class="boton primario" data-i="${i}">Empezar</button></div>`).join("")}</div>
    <h2>Con otra herramienta (cronómetro manual)</h2>
    <div class="tarjeta">
      <label for="herr" class="pista">Herramienta</label>
      <select id="herr" class="boton campo">
        <option>Google</option><option>LeyChile / BCN</option><option>IURA</option><option>Código en papel</option><option>Otra</option>
      </select>
      <label for="obj" class="pista">Artículo</label>
      <select id="obj" class="boton campo">${OBJETIVOS.map((o, i) => `<option value="${i}">${esc(o.txt)}</option>`).join("")}</select>
      <div class="reloj" id="reloj">0,0 s</div>
      <button class="boton primario" id="manual">Iniciar</button>
    </div>
    <h2>Resultados en este dispositivo</h2>
    ${hist.length ? `<table class="tiempos"><tr><th>Artículo</th><th>Herramienta</th><th>Tiempo</th></tr>${hist.slice().reverse().map(h =>
      `<tr><td>${esc(h.art)}</td><td>${esc(h.herr)}</td><td>${(h.ms / 1000).toFixed(1).replace(".", ",")} s</td></tr>`).join("")}</table>
      <div class="acciones"><button class="boton" id="borrar-prueba">Borrar resultados</button></div>`
      : `<p class="pista">Todavía no hay mediciones.</p>`}`;
  vista.querySelectorAll("button[data-i]").forEach(b => b.addEventListener("click", () => {
    const o = OBJETIVOS[+b.dataset.i];
    pruebaEnCurso = { ...o, inicio: Date.now() };
    guardar("alarticulo:prueba-en-curso", pruebaEnCurso);
    navegar("#/");
    setTimeout(() => { entrada.focus(); aviso(`Busca: ${o.txt}`); }, 50);
  }));
  const reloj = $("#reloj"), boton = $("#manual");
  boton.addEventListener("click", () => {
    if (!relojManual) {
      const inicio = Date.now();
      relojManual = setInterval(() => (reloj.textContent = ((Date.now() - inicio) / 1000).toFixed(1).replace(".", ",") + " s"), 100);
      boton.textContent = "Llegué al artículo"; boton.dataset.inicio = inicio;
    } else {
      clearInterval(relojManual); relojManual = null;
      const ms = Date.now() - +boton.dataset.inicio;
      const h = leer(CLAVE_PRUEBA, []);
      h.push({ art: OBJETIVOS[+$("#obj").value].txt, herr: $("#herr").value, ms, fecha: new Date().toISOString() });
      guardar(CLAVE_PRUEBA, h); vistaPrueba();
    }
  });
  $("#borrar-prueba")?.addEventListener("click", () => { if (confirm("¿Borrar todos los resultados de la prueba?")) { guardar(CLAVE_PRUEBA, []); vistaPrueba(); } });
}
function comprobarPrueba(sigla, a) {
  if (!pruebaEnCurso) return;
  if (pruebaEnCurso.sigla === sigla && claveNum(pruebaEnCurso.n) === a.k) {
    const ms = Date.now() - pruebaEnCurso.inicio;
    const h = leer(CLAVE_PRUEBA, []);
    h.push({ art: pruebaEnCurso.txt, herr: "Al Artículo", ms, fecha: new Date().toISOString() });
    guardar(CLAVE_PRUEBA, h);
    pruebaEnCurso = null; guardar("alarticulo:prueba-en-curso", null);
    setTimeout(() => aviso(`¡Llegaste en ${(ms / 1000).toFixed(1).replace(".", ",")} segundos!`), 100);
  }
}

function vistaAcerca() {
  vista.innerHTML = `
    <h1>Acerca de este prototipo</h1>
    <div class="tarjeta">
      <p><b>Para qué es:</b> probar si llegar a un artículo escribiendo “182 cpc” ahorra tiempo frente a Google, LeyChile o IURA, y si los post-it y subrayados son útiles.</p>
      <p><b>Textos:</b> ${INDICE.codigos.length} códigos y ${INDICE.leyes.length} leyes de LeyChile (Biblioteca del Congreso Nacional), revisados cada noche; última actualización: ${esc(fechaCL(INDICE.actualizado))}${API ? ". Cualquier otra ley se trae desde la BCN al abrirla" : ""}. Cada artículo indica si fue modificado y enlaza a su versión oficial.</p>
      <p><b>Tus notas:</b> se guardan solo en este dispositivo. No hay cuentas, ni se envía nada a ningún servidor, ni hay publicidad ni analítica.</p>
      <p><b>Cómo buscar:</b> número + código en cualquier orden (<code>182 cpc</code>, <code>cpc 182</code>, <code>art. 1698 del código civil</code>, <code>548-1 cc</code>, <code>152 bis a ct</code>, <code>5 transitorio cpr</code>${API ? ", <code>art 3 ley 19496</code>" : ""}) o palabras (<code>nulidad absoluta</code>, <code>despido ct</code>). En computador, la tecla <b>/</b> lleva al buscador.</p>
      <p><b>Abreviaturas:</b> ${INDICE.codigos.map(c => `${esc(c.alias[0])} = ${esc(c.nombre)}`).join(" · ")}.</p>
    </div>`;
}

function vistaLeyes() {
  vista.innerHTML = `<h1>Leyes</h1>
    <p class="pista">${INDICE.leyes.length} leyes de uso frecuente, revisadas cada noche en la BCN.${API ? " Además puedes abrir cualquier otra escribiendo <code>ley</code> y su número." : ""}</p>
    <ul class="lista">${[...INDICE.leyes].sort((x, y) => x.tema.localeCompare(y.tema)).map(l =>
      `<li><a href="#/${l.sigla}">${esc(l.tema)}<small>${esc(l.nombre)} · ${l.articulos} artículos · vigente desde ${esc(fechaCL(l.vigenteDesde))}</small></a></li>`).join("")}</ul>`;
}

/* ---------------- Inicio ---------------- */
(async function iniciar() {
  try { await cargarIndice(); }
  catch { vista.innerHTML = `<p>No se pudieron cargar los datos. Revisa tu conexión y recarga.</p>`; return; }
  try { API = (await fetch("api/estado")).ok; } catch { API = false; }
  router();
  const ocioso = window.requestIdleCallback || (f => setTimeout(f, 300));
  ocioso(() => INDICE.codigos.forEach(c => cargarCodigo(c.sigla)));
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
