// Caja - Movimientos (local y/o online con Supabase)
const STORAGE_KEY = "caja_movimientos_v1";
const STORAGE_KEY_CUADRATURA = "caja_cuadratura_copias_v1";
const THEME_STORAGE_KEY = "caja_theme";
const MOVEMENTS_VIEW_KEY = "caja_movements_view";

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.getAttribute("data-theme") === "light";
  if (isLight) {
    root.removeAttribute("data-theme");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
  } else {
    root.setAttribute("data-theme", "light");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
  }
}

function setupThemeToggle() {
  const btn = document.getElementById("btn-theme-toggle");
  if (btn) btn.addEventListener("click", toggleTheme);
}

function getMovementsView() {
  return localStorage.getItem(MOVEMENTS_VIEW_KEY) === "list" ? "list" : "cards";
}

function applyMovementsView(view) {
  const wrap = document.querySelector(".movements-table-wrapper");
  if (!wrap) return;
  const mode = view === "list" ? "list" : "cards";
  wrap.classList.remove("view-cards", "view-list");
  wrap.classList.add(mode === "list" ? "view-list" : "view-cards");
  localStorage.setItem(MOVEMENTS_VIEW_KEY, mode);
  const btnCards = document.getElementById("btn-movements-view-cards");
  const btnList = document.getElementById("btn-movements-view-list");
  if (btnCards) {
    btnCards.classList.toggle("is-active", mode === "cards");
    btnCards.setAttribute("aria-pressed", mode === "cards" ? "true" : "false");
  }
  if (btnList) {
    btnList.classList.toggle("is-active", mode === "list");
    btnList.setAttribute("aria-pressed", mode === "list" ? "true" : "false");
  }
}

function setupMovementsViewToggle() {
  applyMovementsView(getMovementsView());
  document.getElementById("btn-movements-view-cards")?.addEventListener("click", () => applyMovementsView("cards"));
  document.getElementById("btn-movements-view-list")?.addEventListener("click", () => applyMovementsView("list"));
}

let cuadraturaSaveFeedbackTimer = null;
let cuadraturaCloudLoadToken = 0;

const supabaseUrl = (typeof window !== "undefined" && window.CAJA_SUPABASE_URL) || "";
const supabaseAnonKey = (typeof window !== "undefined" && window.CAJA_SUPABASE_ANON_KEY) || "";
const useSupabase = !!(supabaseUrl && supabaseAnonKey);
// Base URL para la API (vacío = mismo origen). En local puedes definir window.CAJA_API_BASE = "https://tu-app.vercel.app"
const API_BASE = typeof window !== "undefined" && window.CAJA_API_BASE !== undefined ? window.CAJA_API_BASE : "";
const PORTAL_HOME_URL = typeof window !== "undefined" ? String(window.CAJA_PORTAL_HOME_URL || "").trim() : "";
let supabaseClient = null;
function getSupabase() {
  if (!useSupabase || !supabaseUrl || !supabaseAnonKey) return null;
  if (supabaseClient) return supabaseClient;
  try {
    if (typeof window !== "undefined" && window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    }
  } catch (e) {
    console.warn("Supabase no disponible:", e);
  }
  return supabaseClient;
}

function goToPortalHome() {
  if (!PORTAL_HOME_URL || !/^https?:\/\//i.test(PORTAL_HOME_URL)) {
    alert("No hay URL del portal configurada. Define CAJA_PORTAL_HOME_URL en config.js");
    return;
  }
  window.location.href = PORTAL_HOME_URL;
}

/** Oculta boton/menu del portal si no hay URL (instancias independientes, ej. Zuni). */
function syncPortalHomeUi() {
  const enabled = !!(PORTAL_HOME_URL && /^https?:\/\//i.test(PORTAL_HOME_URL));
  const btn = document.getElementById("btn-go-portal");
  const menu = document.getElementById("menu-go-portal");
  if (btn) btn.style.display = enabled ? "" : "none";
  if (menu) menu.style.display = enabled ? "" : "none";
}

let state = {
  movements: [],
  editingId: null,
  useSupabase,
  deletedMovements: [],
  realtimeSubscription: null,
  sortBy: "date",
  sortDir: "asc",
  currentRole: "user",
  currentUserId: null,
  movementsPermissions: {
    can_read: true,
    can_write: false,
  },
};

function normalizeAppRole(raw) {
  if (raw == null || raw === "") return "user";
  const s = String(raw).trim().toLowerCase();
  if (s === "super" || s === "full") return "super";
  if (s === "admin") return "admin";
  if (s === "viewer") return "user";
  if (s === "user") return "user";
  return "user";
}

function isSuperRole() {
  const r = String(state.currentRole || "").toLowerCase();
  return r === "super" || r === "full";
}

function rowToMovement(row) {
  if (!row) return null;
  const date = row.date;
  const dateStr = typeof date === "string" ? date.slice(0, 10) : (date && date.toISOString?.().slice(0, 10)) || "";
  return {
    id: row.id,
    date: dateStr,
    local: row.local || "",
    concept: row.concept || "",
    type: row.type === "egreso" ? "egreso" : "ingreso",
    amount: Number(row.amount) || 0,
    notes: row.notes || "",
    created_by: row.created_by || null,
    creator_email: row.creator_email || "",
  };
}

async function loadMovementsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("movements")
    .select("id, date, local, concept, type, amount, notes, created_by, creator_email")
    .is("deleted_at", null)
    .order("date", { ascending: true });
  if (error) {
    console.error("Supabase load:", error);
    return [];
  }
  const list = (data || []).map(rowToMovement).filter(Boolean);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
  return list;
}

function loadMovementsFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadMovements() {
  if (state.useSupabase && navigator.onLine) {
    try {
      const list = await loadMovementsFromSupabase();
      return list;
    } catch (e) {
      console.warn("Supabase no disponible, usando caché local:", e);
    }
  }
  return loadMovementsFromLocal();
}

function saveMovementsLocal(movements) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
  } catch (e) {}
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return isoStr.slice(0, 16);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.offsetHeight;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 180);
  }, 2200);
}

function showCenterDialog(message) {
  const wrap = document.getElementById("center-dialog");
  const text = document.getElementById("center-dialog-message");
  if (!wrap || !text) {
    if (typeof alert !== "undefined") alert(message);
    return;
  }
  text.textContent = message;
  wrap.classList.remove("hidden");
}

function formatShortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…`;
}

function canEditMovement(m) {
  if (!m) return false;
  if (!state.useSupabase) return true;
  if (isSuperRole()) return true;
  if (!state.movementsPermissions.can_write) return false;
  if (!state.currentUserId || !m.created_by) return false;
  return String(m.created_by) === String(state.currentUserId);
}

function canDeleteMovement() {
  if (!state.useSupabase) return true;
  if (isSuperRole()) return true;
  return false;
}

async function refreshCurrentUserId() {
  state.currentUserId = null;
  if (!state.useSupabase) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  state.currentUserId = user?.id || null;
}

function getFilterDateBounds() {
  const mode = document.getElementById("filter-period-mode")?.value || "mensual";
  const now = new Date();
  const y = now.getFullYear();
  if (mode === "diario") {
    const d = (document.getElementById("filter-period-diario")?.value || "").trim();
    return { desde: d, hasta: d };
  }
  if (mode === "mensual") {
    const month = (document.getElementById("filter-period-mes")?.value || "").trim();
    if (!month) return { desde: "", hasta: "" };
    const parts = month.split("-");
    const yy = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    if (isNaN(yy) || isNaN(mo)) return { desde: "", hasta: "" };
    const lastDay = new Date(yy, mo, 0).getDate();
    return { desde: `${month}-01`, hasta: `${month}-${String(lastDay).padStart(2, "0")}` };
  }
  if (mode === "anual") {
    const yearStr = (document.getElementById("filter-period-anio")?.value || "").trim();
    const yy = yearStr ? parseInt(yearStr, 10) : y;
    if (isNaN(yy)) return { desde: "", hasta: "" };
    return { desde: `${yy}-01-01`, hasta: `${yy}-12-31` };
  }
  if (mode === "personalizado") {
    return {
      desde: (document.getElementById("filter-date-desde")?.value || "").trim(),
      hasta: (document.getElementById("filter-date-hasta")?.value || "").trim(),
    };
  }
  return { desde: "", hasta: "" };
}

function initFilterDefaults() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const modeEl = document.getElementById("filter-period-mode");
  const mes = document.getElementById("filter-period-mes");
  const diario = document.getElementById("filter-period-diario");
  const anio = document.getElementById("filter-period-anio");
  if (modeEl) modeEl.value = "mensual";
  if (mes) mes.value = `${y}-${m}`;
  if (diario) diario.value = now.toISOString().slice(0, 10);
  if (anio) anio.value = String(y);
}

function syncFilterPeriodControls() {
  const mode = document.getElementById("filter-period-mode")?.value || "mensual";
  const map = {
    "filter-period-diario-wrap": mode === "diario",
    "filter-period-mes-wrap": mode === "mensual",
    "filter-period-anio-wrap": mode === "anual",
    "filter-date-personalizado-wrap": mode === "personalizado",
  };
  Object.entries(map).forEach(([id, on]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !on);
  });
}

function setOfflineBanner(offline) {
  const banner = document.getElementById("offline-banner");
  const badge = document.getElementById("badge-mode");
  if (banner) {
    if (offline) banner.classList.remove("hidden");
    else banner.classList.add("hidden");
  }
  document.body.classList.toggle("offline-banner-visible", !!offline);
  if (badge) {
    badge.textContent = state.useSupabase ? (offline ? "Sin conexión" : "Online") : "Local";
  }
}

const CUADRADURA_DENOMS = [100, 500, 1000, 5000, 10000, 20000];

function getCuadraturaMontoInputEl(d) {
  return document.getElementById(`cuad-monto-${d}`);
}

function parseCuadraturaMontoInput(el) {
  const raw = String(el?.value ?? "").trim().replace(",", ".");
  if (raw === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function updateCuadraturaDenomHint(d, monto) {
  const hintEl = document.getElementById(`cuad-hint-${d}`);
  if (!hintEl) return;
  if (monto === 0) {
    hintEl.textContent = "—";
    hintEl.className = "cuadratura-hint";
    return;
  }
  if (monto % d !== 0) {
    hintEl.textContent = "No múltiplo";
    hintEl.className = "cuadratura-hint warn";
    return;
  }
  const units = monto / d;
  hintEl.textContent = String(units);
  hintEl.className = "cuadratura-hint";
}

function montoFromSnapshotForDenom(snap, d) {
  if (!snap || typeof snap !== "object") return 0;
  if (snap.amounts && typeof snap.amounts === "object" && snap.amounts[String(d)] != null) {
    return Math.max(0, Math.round(Number(snap.amounts[String(d)]) || 0));
  }
  if (snap.inputMode === "monto" && snap.counts && snap.counts[String(d)] != null) {
    return Math.max(0, Math.round(Number(snap.counts[String(d)]) || 0));
  }
  if (snap.counts && typeof snap.counts === "object" && snap.counts[String(d)] != null) {
    const v = snap.counts[String(d)];
    const qty = typeof v === "number" && Number.isFinite(v) ? v : parseInt(String(v), 10);
    const n = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    return n * d;
  }
  return 0;
}

/** Saldo neto (ingresos − egresos) de una lista de movimientos. */
function netBalanceFromMovements(movements) {
  return movements.reduce((acc, m) => {
    const amt = Number(m.amount) || 0;
    return acc + (m.type === "egreso" ? -amt : amt);
  }, 0);
}

/**
 * Resumen alineado al período del filtro (desde getFilterDateBounds):
 * - Con fecha "desde": saldo inicial = movimientos con fecha estrictamente anterior a "desde" (todo el libro);
 *   egresos = suma de egresos en el período que cumplen el resto de filtros (como la tabla);
 *   saldo = inicial + ingresos del período filtrados − egresos del período filtrados.
 * - Sin "desde": totales clásicos solo sobre movimientos que pasan applyFilters.
 */
function getSummaryTotals() {
  const { desde } = getFilterDateBounds();
  const filtered = applyFilters(state.movements);

  if (!desde) {
    const ingresos = filtered.filter((m) => m.type === "ingreso").reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    const egresos = filtered.filter((m) => m.type === "egreso").reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    return { saldoInicial: ingresos, egresosDelPeriodo: egresos, saldo: ingresos - egresos, resumenPorPeriodo: false };
  }

  const antes = state.movements.filter((m) => {
    const date = (m.date || "").trim();
    if (!date) return false;
    return date < desde;
  });
  const saldoInicial = netBalanceFromMovements(antes);
  const ingresosPeriodo = filtered.filter((m) => m.type === "ingreso").reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const egresosDelPeriodo = filtered.filter((m) => m.type === "egreso").reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const saldo = saldoInicial + ingresosPeriodo - egresosDelPeriodo;
  return { saldoInicial, egresosDelPeriodo, saldo, resumenPorPeriodo: true };
}

function summaryValueClassForSignedAmount(value) {
  if (value > 0) return "summary-value positive";
  if (value < 0) return "summary-value negative";
  return "summary-value saldo";
}

function recalcSummary() {
  const { saldoInicial, egresosDelPeriodo, saldo, resumenPorPeriodo } = getSummaryTotals();
  const lbl1 = document.getElementById("summary-label-col1");
  if (lbl1) lbl1.textContent = resumenPorPeriodo ? "Saldo inicial" : "Ingresos";
  const lbl2 = document.getElementById("summary-label-col2");
  if (lbl2) lbl2.textContent = resumenPorPeriodo ? "Egresos del período" : "Egresos";
  const lbl3 = document.getElementById("summary-label-col3");
  if (lbl3) lbl3.textContent = resumenPorPeriodo ? "Saldo al cierre" : "Saldo";
  const si = document.getElementById("sum-ingresos");
  const se = document.getElementById("sum-egresos");
  const ss = document.getElementById("sum-saldo");
  if (si) {
    si.textContent = formatCurrency(saldoInicial);
    si.className = summaryValueClassForSignedAmount(saldoInicial);
  }
  if (se) {
    se.textContent = formatCurrency(egresosDelPeriodo);
    se.className = "summary-value negative";
  }
  if (ss) {
    ss.textContent = formatCurrency(saldo);
    ss.className = summaryValueClassForSignedAmount(saldo);
  }
  updateCuadraturaCompare();
}

function getCuadraturaPhysicalTotal() {
  let total = 0;
  CUADRADURA_DENOMS.forEach((d) => {
    total += parseCuadraturaMontoInput(getCuadraturaMontoInputEl(d));
  });
  return total;
}

function getCuadraturaAmounts() {
  const amounts = {};
  CUADRADURA_DENOMS.forEach((d) => {
    amounts[String(d)] = parseCuadraturaMontoInput(getCuadraturaMontoInputEl(d));
  });
  return amounts;
}

function getCuadraturaSnapshot() {
  const { desde, hasta } = getFilterDateBounds();
  const totals = getSummaryTotals();
  const physical = getCuadraturaPhysicalTotal();
  const amounts = getCuadraturaAmounts();
  const compareEl = document.getElementById("cuad-comparacion");
  return {
    savedAt: new Date().toISOString(),
    inputMode: "monto",
    amounts,
    counts: amounts,
    totalFisico: physical,
    saldoResumen: totals.saldo,
    saldoInicial: totals.saldoInicial,
    egresosDelPeriodo: totals.egresosDelPeriodo,
    resumenPorPeriodo: totals.resumenPorPeriodo,
    periodoDesde: desde,
    periodoHasta: hasta,
    filtroModoPeriodo: document.getElementById("filter-period-mode")?.value || "",
    diferenciaFisicoVsSaldo: physical - Math.round(totals.saldo),
    comparacionTexto: compareEl ? String(compareEl.textContent || "").trim() : "",
  };
}

function readCuadraturaSnapshotsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUADRATURA);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCuadraturaCopy() {
  const snap = getCuadraturaSnapshot();
  const list = readCuadraturaSnapshotsFromStorage();
  list.push(snap);
  try {
    localStorage.setItem(STORAGE_KEY_CUADRATURA, JSON.stringify(list));
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar la copia (almacenamiento lleno o no disponible).");
    return;
  }
  const el = document.getElementById("cuad-save-feedback");
  if (el) {
    el.textContent = "Copia guardada en este dispositivo.";
    el.classList.remove("hidden");
    if (cuadraturaSaveFeedbackTimer) clearTimeout(cuadraturaSaveFeedbackTimer);
    cuadraturaSaveFeedbackTimer = setTimeout(() => {
      el.classList.add("hidden");
      el.textContent = "";
      cuadraturaSaveFeedbackTimer = null;
    }, 2800);
  }
  refreshCuadraturaHistorialUi();
  refreshCuadraturasVistaIfOpen();
}

function setCuadraturaHistorialMsg(text, isWarn) {
  const msgEl = document.getElementById("cuad-historial-msg");
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.classList.toggle("hidden", !text);
  msgEl.classList.toggle("warn", !!isWarn);
}

function setCuadraturaCloudMsg(text, isWarn) {
  const msgEl = document.getElementById("cuad-historial-cloud-msg");
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.classList.toggle("hidden", !text);
  msgEl.classList.toggle("warn", !!isWarn);
}

function isLikelyCuadraturaSnapshot(o) {
  if (!o || typeof o !== "object") return false;
  if (typeof o.savedAt !== "string" || !o.savedAt.trim()) return false;
  if (o.amounts && typeof o.amounts === "object") return true;
  if (o.counts && typeof o.counts === "object") return true;
  if (typeof o.totalFisico === "number") return true;
  return false;
}

function snapshotHasDenomData(snap) {
  return !!(snap?.amounts || snap?.counts);
}

function mergeCuadraturaSnapshotsFromArray(imported) {
  if (!Array.isArray(imported)) return { added: 0, skipped: 0, invalid: 0 };
  const existing = readCuadraturaSnapshotsFromStorage();
  const bySavedAt = new Set(existing.map((s) => String(s.savedAt || "").trim()).filter(Boolean));
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  const next = [...existing];
  for (const raw of imported) {
    if (!isLikelyCuadraturaSnapshot(raw)) {
      invalid += 1;
      continue;
    }
    const key = String(raw.savedAt).trim();
    if (bySavedAt.has(key)) {
      skipped += 1;
      continue;
    }
    const clone = { ...raw };
    next.push(clone);
    bySavedAt.add(key);
    added += 1;
  }
  localStorage.setItem(STORAGE_KEY_CUADRATURA, JSON.stringify(next));
  return { added, skipped, invalid };
}

async function handleCuadraturaImportFile(file) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch (e) {
    console.error(e);
    setCuadraturaHistorialMsg("No se pudo leer el archivo.", true);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setCuadraturaHistorialMsg("El archivo no es JSON válido.", true);
    return;
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.snapshots) ? parsed.snapshots : (Array.isArray(parsed?.data) ? parsed.data : null));
  if (!Array.isArray(arr)) {
    setCuadraturaHistorialMsg("El JSON debe ser un array de cuadraturas (o { \"snapshots\": [...] }).", true);
    return;
  }
  const { added, skipped, invalid } = mergeCuadraturaSnapshotsFromArray(arr);
  refreshCuadraturaHistorialUi();
  refreshCuadraturasVistaIfOpen();
  const parts = [];
  if (added) parts.push(`${added} importada(s)`);
  if (skipped) parts.push(`${skipped} omitida(s) (mismo savedAt que una ya guardada)`);
  if (invalid) parts.push(`${invalid} ignorada(s) (formato inválido)`);
  const msg = parts.length ? `${parts.join(". ")}.` : "No se importó nada nuevo.";
  const warn = added === 0 && arr.length > 0;
  setCuadraturaHistorialMsg(msg, warn);
}

async function loadCuadraturaCloudHistorial() {
  const my = ++cuadraturaCloudLoadToken;
  const wrap = document.getElementById("cuadratura-historial-cloud-wrap");
  const loading = document.getElementById("cuad-historial-cloud-loading");
  const empty = document.getElementById("cuad-historial-cloud-vacio");
  const ul = document.getElementById("cuad-historial-cloud-list");
  if (!wrap || !ul || !empty) return;
  if (!state.useSupabase || !getSupabase()) {
    setCuadraturaCloudMsg("", false);
    return;
  }
  const isSuper = isSuperRole();
  const perms = state.movementsPermissions || { can_read: true, can_write: false };
  if (!isSuper && !perms.can_read) {
    if (loading) loading.classList.add("hidden");
    ul.innerHTML = "";
    empty.classList.remove("hidden");
    empty.textContent = "No tenés permiso para leer cuadraturas en el servidor.";
    setCuadraturaCloudMsg("", false);
    return;
  }
  empty.textContent = "No hay cuadraturas en el servidor o no tenés permiso de lectura.";
  const supabase = getSupabase();
  setCuadraturaCloudMsg("", false);
  if (loading) loading.classList.remove("hidden");
  empty.classList.add("hidden");
  ul.innerHTML = "";

  const { data, error } = await supabase
    .from("cuadratura_snapshots")
    .select("id, saved_at, created_at, creator_email, payload")
    .order("saved_at", { ascending: false })
    .limit(100);

  if (loading) loading.classList.add("hidden");

  if (my !== cuadraturaCloudLoadToken) return;

  if (error) {
    console.error(error);
    setCuadraturaCloudMsg(error.message || "Error al cargar (¿aplicaste migration-cuadratura-snapshots.sql?).", true);
    empty.classList.remove("hidden");
    return;
  }

  if (my !== cuadraturaCloudLoadToken) return;

  const rows = data || [];
  if (rows.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  if (my !== cuadraturaCloudLoadToken) return;

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "cuadratura-historial-item";
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const dt = row.saved_at ? new Date(row.saved_at) : null;
    const fecha = dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : String(row.saved_at || "—");
    const tf = formatCurrency(payload.totalFisico ?? 0);
    const email = row.creator_email ? String(row.creator_email) : "";
    const who = email.includes("@") ? email.split("@")[0] : (email || "—");
    const main = document.createElement("span");
    main.textContent = `${fecha} · Total ${tf} · ${who}`;
    const badge = document.createElement("span");
    badge.className = "cuadratura-historial-badge ok";
    badge.textContent = "Servidor";
    li.appendChild(main);
    li.appendChild(badge);
    ul.appendChild(li);
  });
}

function refreshCuadraturaHistorialUi() {
  const list = readCuadraturaSnapshotsFromStorage();
  const ul = document.getElementById("cuad-historial-list");
  const empty = document.getElementById("cuad-historial-vacio");
  const uploadBtn = document.getElementById("btn-cuadratura-upload-all");
  const exportBtn = document.getElementById("btn-cuadratura-export-json");
  const importBtn = document.getElementById("btn-cuadratura-import-json");
  const refreshCloudBtn = document.getElementById("btn-cuadratura-refresh-cloud");
  const cloudWrap = document.getElementById("cuadratura-historial-cloud-wrap");
  const isSuper = isSuperRole();
  const perms = state.movementsPermissions || { can_read: true, can_write: false };
  const canReadMovements = isSuper || !!perms.can_read;
  const canWriteMovements = isSuper || !!perms.can_write;

  if (cloudWrap) {
    cloudWrap.style.display = state.useSupabase ? "" : "none";
  }

  if (!ul || !empty) return;

  ul.innerHTML = "";
  const reversed = [...list].reverse();
  if (reversed.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    reversed.forEach((snap) => {
      const li = document.createElement("li");
      li.className = "cuadratura-historial-item";
      const dt = snap.savedAt ? new Date(snap.savedAt) : null;
      const fecha = dt && !Number.isNaN(dt.getTime())
        ? dt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
        : "—";
      const tf = formatCurrency(snap.totalFisico ?? 0);
      const main = document.createElement("span");
      main.textContent = `${fecha} · Total ${tf}`;
      const badge = document.createElement("span");
      badge.className = snap.supabaseId ? "cuadratura-historial-badge ok" : "cuadratura-historial-badge pend";
      badge.textContent = snap.supabaseId ? "En la nube" : "Solo local";
      li.appendChild(main);
      li.appendChild(badge);
      ul.appendChild(li);
    });
  }

  if (exportBtn) {
    exportBtn.disabled = !canReadMovements || list.length === 0;
  }
  if (importBtn) {
    importBtn.disabled = !canWriteMovements;
  }

  if (uploadBtn) {
    const pending = list.filter((s) => !s.supabaseId).length;
    const canCloud = state.useSupabase && !!getSupabase() && canWriteMovements;
    uploadBtn.style.display = state.useSupabase ? "" : "none";
    uploadBtn.disabled = !canCloud || pending === 0;
  }

  if (refreshCloudBtn) {
    refreshCloudBtn.disabled = !state.useSupabase || !getSupabase() || !canReadMovements;
  }

  const panelCuad = document.getElementById("panel-cuadratura");
  if (panelCuad && !panelCuad.classList.contains("hidden") && state.useSupabase && getSupabase() && canReadMovements) {
    void loadCuadraturaCloudHistorial();
  }
}

function exportCuadraturaSnapshotsJSON() {
  const list = readCuadraturaSnapshotsFromStorage();
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `cuadraturas-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setCuadraturaHistorialMsg("Archivo JSON descargado.", false);
}

async function uploadPendingCuadraturaSnapshots() {
  const supabase = getSupabase();
  setCuadraturaHistorialMsg("", false);
  if (!state.useSupabase || !supabase) {
    setCuadraturaHistorialMsg("Subida solo disponible con la app en línea (Supabase).", true);
    return;
  }
  const isSuper = isSuperRole();
  const perms = state.movementsPermissions || { can_read: true, can_write: false };
  if (!isSuper && !perms.can_write) {
    setCuadraturaHistorialMsg("No tenés permiso para subir cuadraturas.", true);
    return;
  }

  let list = readCuadraturaSnapshotsFromStorage();
  const pending = [];
  list.forEach((s, index) => {
    if (!s.supabaseId) pending.push({ snap: s, index });
  });
  if (pending.length === 0) {
    setCuadraturaHistorialMsg("No hay cuadraturas pendientes de subir.", false);
    return;
  }

  const rows = pending.map(({ snap }) => ({ saved_at: snap.savedAt, payload: snap }));
  const { data, error } = await supabase.from("cuadratura_snapshots").insert(rows).select("id");
  if (error) {
    console.error(error);
    setCuadraturaHistorialMsg(error.message || "Error al subir a Supabase. ¿Ejecutaste la migración SQL en el proyecto?", true);
    return;
  }
  const ids = data || [];
  ids.forEach((row, idx) => {
    const { index } = pending[idx];
    if (row?.id && list[index]) {
      list[index] = { ...list[index], supabaseId: row.id };
    }
  });
  try {
    localStorage.setItem(STORAGE_KEY_CUADRATURA, JSON.stringify(list));
  } catch (e) {
    console.error(e);
    setCuadraturaHistorialMsg("Subida OK pero no se pudo actualizar el historial local.", true);
    refreshCuadraturaHistorialUi();
    return;
  }
  setCuadraturaHistorialMsg(`Se subieron ${ids.length} cuadratura(s).`, false);
  refreshCuadraturaHistorialUi();
  refreshCuadraturasVistaIfOpen();
}

function setCuadraturasVistaMsg(text, isWarn) {
  const el = document.getElementById("cuadraturas-vista-msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
  el.classList.toggle("warn", !!isWarn);
}

function applySnapshotToCuadraturaForm(snap) {
  if (!snapshotHasDenomData(snap)) {
    showToast("Esta cuadratura no tiene montos por denominación.");
    return false;
  }
  CUADRADURA_DENOMS.forEach((d) => {
    const el = getCuadraturaMontoInputEl(d);
    const monto = montoFromSnapshotForDenom(snap, d);
    if (el) el.value = String(monto);
  });
  updateCuadraturaCompare();
  const panel = document.getElementById("panel-cuadratura");
  const btn = document.getElementById("btn-cuadratura-toggle");
  if (panel) panel.classList.remove("hidden");
  if (btn) btn.setAttribute("aria-expanded", "true");
  hideCuadraturasSavedPanel();
  showToast("Montos cargados en el formulario de cuadratura.");
  return true;
}

function renderCuadraturasVistaLocalTable() {
  const tbody = document.getElementById("cuadraturas-local-body");
  const wrap = document.getElementById("cuadraturas-local-table-wrap");
  const empty = document.getElementById("cuadraturas-local-empty");
  if (!tbody || !wrap || !empty) return;
  const list = readCuadraturaSnapshotsFromStorage();
  const canWrite = isSuperRole() || !!(state.movementsPermissions || {}).can_write;
  tbody.innerHTML = "";
  const reversed = [...list].reverse();
  if (reversed.length === 0) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  reversed.forEach((snap) => {
    const tr = document.createElement("tr");
    const dt = snap.savedAt ? new Date(snap.savedAt) : null;
    const fecha = dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : "—";
    const tf = formatCurrency(snap.totalFisico ?? 0);
    const saldo = formatCurrency(snap.saldoResumen ?? 0);
    const diff = snap.diferenciaFisicoVsSaldo;
    const diffStr = typeof diff === "number" && !Number.isNaN(diff) ? formatCurrency(diff) : "—";
    const syncLabel = snap.supabaseId ? "En la nube" : "Solo local";
    [fecha, tf, saldo, diffStr, syncLabel].forEach((txt) => {
      const td = document.createElement("td");
      td.textContent = txt;
      tr.appendChild(td);
    });
    const tdBtn = document.createElement("td");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost cuadraturas-vista-action-btn";
    b.textContent = "Usar en formulario";
    b.disabled = !canWrite || !snapshotHasDenomData(snap);
    b.addEventListener("click", () => applySnapshotToCuadraturaForm(snap));
    tdBtn.appendChild(b);
    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  });
}

async function renderCuadraturasVistaCloudTable() {
  const section = document.getElementById("cuadraturas-cloud-section");
  const loading = document.getElementById("cuadraturas-cloud-loading");
  const empty = document.getElementById("cuadraturas-cloud-empty");
  const wrap = document.getElementById("cuadraturas-cloud-table-wrap");
  const tbody = document.getElementById("cuadraturas-cloud-body");
  if (!section || !loading || !empty || !wrap || !tbody) return;
  if (!state.useSupabase || !getSupabase()) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  const isSuper = isSuperRole();
  const perms = state.movementsPermissions || { can_read: true, can_write: false };
  const canRead = isSuper || !!perms.can_read;
  const canWrite = isSuper || !!perms.can_write;
  if (!canRead) {
    loading.classList.add("hidden");
    wrap.classList.add("hidden");
    tbody.innerHTML = "";
    empty.textContent = "No tenés permiso para leer cuadraturas en el servidor.";
    empty.classList.remove("hidden");
    return;
  }
  empty.textContent = "No hay cuadraturas en el servidor.";
  loading.classList.remove("hidden");
  empty.classList.add("hidden");
  wrap.classList.add("hidden");
  tbody.innerHTML = "";
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cuadratura_snapshots")
    .select("id, saved_at, created_at, creator_email, payload")
    .order("saved_at", { ascending: false })
    .limit(100);
  loading.classList.add("hidden");
  if (error) {
    console.error(error);
    setCuadraturasVistaMsg(error.message || "Error al cargar desde Supabase.", true);
    empty.classList.remove("hidden");
    return;
  }
  setCuadraturasVistaMsg("", false);
  const rows = data || [];
  if (rows.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  wrap.classList.remove("hidden");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const dt = row.saved_at ? new Date(row.saved_at) : null;
    const fecha = dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : String(row.saved_at || "—");
    const tf = formatCurrency(payload.totalFisico ?? 0);
    const email = row.creator_email ? String(row.creator_email) : "";
    const who = email.includes("@") ? email.split("@")[0] : (email || "—");
    const td1 = document.createElement("td");
    td1.textContent = fecha;
    const td2 = document.createElement("td");
    td2.textContent = tf;
    const td3 = document.createElement("td");
    td3.textContent = who;
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    const tdBtn = document.createElement("td");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost cuadraturas-vista-action-btn";
    b.textContent = "Usar en formulario";
    b.disabled = !canWrite || !snapshotHasDenomData(payload);
    b.addEventListener("click", () => applySnapshotToCuadraturaForm(payload));
    tdBtn.appendChild(b);
    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  });
}

function showCuadraturasSavedPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-cuadraturas");
  const deleted = document.getElementById("panel-deleted");
  const admin = document.getElementById("panel-admin");
  if (main) main.classList.add("hidden");
  if (deleted) deleted.classList.add("hidden");
  if (admin) admin.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
}

function hideCuadraturasSavedPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-cuadraturas");
  if (main) main.classList.remove("hidden");
  if (panel) panel.classList.add("hidden");
}

async function refreshCuadraturasSavedPanelContent() {
  renderCuadraturasVistaLocalTable();
  await renderCuadraturasVistaCloudTable();
}

async function openCuadraturasSavedPanel() {
  setCuadraturasVistaMsg("", false);
  await refreshCuadraturasSavedPanelContent();
  showCuadraturasSavedPanel();
}

function refreshCuadraturasVistaIfOpen() {
  const panel = document.getElementById("panel-cuadraturas");
  if (!panel || panel.classList.contains("hidden")) return;
  void refreshCuadraturasSavedPanelContent();
}

function updateCuadraturaCompare() {
  CUADRADURA_DENOMS.forEach((d) => {
    const monto = parseCuadraturaMontoInput(getCuadraturaMontoInputEl(d));
    updateCuadraturaDenomHint(d, monto);
  });

  const saldo = getSummaryTotals().saldo;
  const physical = getCuadraturaPhysicalTotal();
  const totalEl = document.getElementById("cuad-total-fisico");
  const saldoRefEl = document.getElementById("cuad-saldo-ref");
  const compareEl = document.getElementById("cuad-comparacion");
  if (totalEl) totalEl.textContent = formatCurrency(physical);
  if (saldoRefEl) saldoRefEl.textContent = formatCurrency(saldo);
  if (!compareEl) return;

  const saldoRedondeado = Math.round(saldo);
  const diff = physical - saldoRedondeado;
  if (physical === 0 && CUADRADURA_DENOMS.every((d) => {
    return parseCuadraturaMontoInput(getCuadraturaMontoInputEl(d)) === 0;
  })) {
    compareEl.textContent = "";
    compareEl.className = "cuadratura-msg";
    return;
  }
  if (diff === 0) {
    compareEl.textContent = "Coincide con el saldo del resumen.";
    compareEl.className = "cuadratura-msg ok";
  } else if (diff > 0) {
    compareEl.textContent = `Sobran ${formatCurrency(diff)} respecto al saldo.`;
    compareEl.className = "cuadratura-msg warn";
  } else {
    compareEl.textContent = `Faltan ${formatCurrency(Math.abs(diff))} respecto al saldo.`;
    compareEl.className = "cuadratura-msg warn";
  }
}

function setupCuadraturaListeners() {
  const btn = document.getElementById("btn-cuadratura-toggle");
  const panel = document.getElementById("panel-cuadratura");
  if (btn && panel) {
    btn.addEventListener("click", () => {
      panel.classList.toggle("hidden");
      const open = !panel.classList.contains("hidden");
      btn.setAttribute("aria-expanded", String(open));
      if (open) {
        setCuadraturaHistorialMsg("", false);
        setCuadraturaCloudMsg("", false);
        refreshCuadraturaHistorialUi();
      }
    });
  }
  CUADRADURA_DENOMS.forEach((d) => {
    const el = getCuadraturaMontoInputEl(d);
    if (el) el.addEventListener("input", updateCuadraturaCompare);
  });
  const btnClear = document.getElementById("btn-cuadratura-clear");
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      CUADRADURA_DENOMS.forEach((d) => {
        const el = getCuadraturaMontoInputEl(d);
        if (el) el.value = "0";
      });
      updateCuadraturaCompare();
    });
  }
  const btnGuardar = document.getElementById("btn-cuadratura-guardar");
  if (btnGuardar) btnGuardar.addEventListener("click", saveCuadraturaCopy);
  const btnSalir = document.getElementById("btn-cuadratura-salir");
  if (btnSalir && panel && btn) {
    btnSalir.addEventListener("click", () => {
      panel.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    });
  }
  const btnExportJson = document.getElementById("btn-cuadratura-export-json");
  if (btnExportJson) {
    btnExportJson.addEventListener("click", () => {
      const list = readCuadraturaSnapshotsFromStorage();
      if (!list.length) {
        setCuadraturaHistorialMsg("No hay datos para exportar.", true);
        return;
      }
      exportCuadraturaSnapshotsJSON();
    });
  }
  const btnUploadAll = document.getElementById("btn-cuadratura-upload-all");
  if (btnUploadAll) {
    btnUploadAll.addEventListener("click", async () => {
      btnUploadAll.disabled = true;
      try {
        await uploadPendingCuadraturaSnapshots();
      } finally {
        refreshCuadraturaHistorialUi();
      }
    });
  }
  const btnImportJson = document.getElementById("btn-cuadratura-import-json");
  const fileCuadImport = document.getElementById("file-cuadratura-import");
  if (btnImportJson && fileCuadImport) {
    btnImportJson.addEventListener("click", () => fileCuadImport.click());
    fileCuadImport.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) void handleCuadraturaImportFile(f);
      e.target.value = "";
    });
  }
  const btnRefreshCloud = document.getElementById("btn-cuadratura-refresh-cloud");
  if (btnRefreshCloud) {
    btnRefreshCloud.addEventListener("click", () => void loadCuadraturaCloudHistorial());
  }
}

function populateMovementDatalist(inputId, datalistId, movementField, selectedValue) {
  const input = document.getElementById(inputId);
  const datalist = document.getElementById(datalistId);
  if (!datalist) return;
  const preserve = selectedValue !== undefined
    ? String(selectedValue ?? "").trim()
    : String(input?.value ?? "").trim();
  const names = new Set(
    state.movements
      .map((m) => (m[movementField] || "").trim())
      .filter(Boolean)
  );
  if (preserve) names.add(preserve);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  datalist.innerHTML = "";
  sorted.forEach((nombre) => {
    const opt = document.createElement("option");
    opt.value = nombre;
    datalist.appendChild(opt);
  });
  if (input && selectedValue !== undefined) {
    input.value = preserve;
  }
}

function updateLocalDatalist(selectedValue) {
  populateMovementDatalist("local", "local-list", "local", selectedValue);
}

function updateConceptDatalist(selectedValue) {
  populateMovementDatalist("concept", "concept-list", "concept", selectedValue);
}

function applyFilters(movements) {
  const text = (document.getElementById("filter-text")?.value || "").trim().toLowerCase();
  const type = document.getElementById("filter-type")?.value || "todos";
  const { desde, hasta } = getFilterDateBounds();
  return movements.filter((m) => {
    const matchesType = type === "todos" || m.type === type;
    const combined = (m.concept || "") + " " + (m.local || "") + " " + (m.notes || "");
    const matchesText = !text || combined.toLowerCase().includes(text);
    const date = (m.date || "").trim();
    const matchesDesde = !desde || date >= desde;
    const matchesHasta = !hasta || date <= hasta;
    return matchesType && matchesText && matchesDesde && matchesHasta;
  });
}

function renderTable() {
  const tbody = document.getElementById("movements-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const filtered = applyFilters(state.movements);
  const sorted = filtered.slice().sort((a, b) => {
    const col = state.sortBy || "date";
    const dir = state.sortDir === "desc" ? -1 : 1;
    let res = 0;
    if (col === "id") {
      res = String(a.id).localeCompare(String(b.id));
    } else if (col === "creator") {
      res = (a.creator_email || "").localeCompare(b.creator_email || "", "es", { sensitivity: "base" });
    } else if (col === "date") {
      res = (a.date || "").localeCompare(b.date || "");
    } else if (col === "local") {
      res = (a.local || "").localeCompare(b.local || "", "es", { sensitivity: "base" });
    } else if (col === "concept") {
      res = (a.concept || "").localeCompare(b.concept || "", "es", { sensitivity: "base" });
    } else if (col === "type") {
      const at = a.type === "egreso" ? "2" : "1";
      const bt = b.type === "egreso" ? "2" : "1";
      res = at.localeCompare(bt);
    } else if (col === "amount") {
      res = (a.amount || 0) - (b.amount || 0);
    } else {
      res = String(a.id).localeCompare(String(b.id));
    }
    if (res === 0 && col !== "id") {
      // desempate consistente
      res = String(a.id).localeCompare(String(b.id));
    }
    return res * dir;
  });
  sorted.forEach((m) => {
    const tr = document.createElement("tr");
    tr.className = "movement-row";
    tr.dataset.type = m.type === "egreso" ? "egreso" : "ingreso";
    tr.appendChild(createCell(formatShortId(m.id), "cell-id"));
    tr.appendChild(createCell(m.date || "", "cell-date"));
    tr.appendChild(createCell(m.local || "", "cell-local"));
    tr.appendChild(createCell(m.concept || "", "cell-concept"));
    const tdType = document.createElement("td");
    tdType.className = "cell-type";
    const spanType = document.createElement("span");
    spanType.className = `cell-type ${m.type}`;
    spanType.textContent = m.type === "ingreso" ? "Ingreso" : "Egreso";
    tdType.appendChild(spanType);
    tr.appendChild(tdType);
    const tdAmount = document.createElement("td");
    tdAmount.className = "cell-amount";
    tdAmount.textContent = formatCurrency(m.amount);
    tr.appendChild(tdAmount);
    const notesText = (m.notes || "").trim();
    const tdNotes = createCell(notesText, "cell-notes");
    if (!notesText) tdNotes.classList.add("cell-notes-empty");
    tr.appendChild(tdNotes);
    tr.appendChild(createCell(m.creator_email || "—", "cell-creator"));
    const tdActions = document.createElement("td");
    tdActions.className = "cell-actions";
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const btnEdit = document.createElement("button");
    btnEdit.className = "edit-btn";
    btnEdit.textContent = "Editar";
    btnEdit.addEventListener("click", () => startEdit(m.id));
    const btnDelete = document.createElement("button");
    btnDelete.className = "delete-btn";
    btnDelete.textContent = "Borrar";
    btnDelete.addEventListener("click", () => deleteMovement(m.id));
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);
    tdActions.appendChild(actions);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
  recalcSummary();
  updateLocalDatalist();
  updateConceptDatalist();
  updateSortUI();
  applyRolePermissions();
}

function movementsToCSV(movements) {
  const headers = ["Id", "Fecha", "Local", "Concepto", "Tipo", "Monto", "Notas", "Creado por"];
  const escape = (value) => {
    const str = (value ?? "").toString().replace(/\r?\n/g, " ");
    const needsQuotes = /[",;]/.test(str);
    const escaped = str.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  const rows = movements.map((m) => [
    m.id || "",
    m.date || "",
    m.local || "",
    m.concept || "",
    m.type === "egreso" ? "Egreso" : "Ingreso",
    typeof m.amount === "number" ? String(m.amount).replace(".", ",") : "",
    m.notes || "",
    m.creator_email || "",
  ]);
  const lines = [headers, ...rows].map((cols) => cols.map(escape).join(";"));
  return lines.join("\r\n");
}

function exportExcel() {
  const all = state.movements || [];
  if (!all.length) {
    if (typeof alert !== "undefined") alert("No hay movimientos para exportar.");
    return;
  }
  const csv = movementsToCSV(all);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caja-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exportado para Excel.");
}

function setSort(column) {
  if (!column) return;
  if (state.sortBy === column) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortBy = column;
    state.sortDir = "asc";
  }
  renderTable();
}

function updateSortUI() {
  const headers = document.querySelectorAll(".sort-header");
  headers.forEach((el) => {
    const col = el.dataset.sortCol;
    const arrow = el.querySelector(".sort-arrow");
    if (!arrow) return;
    if (state.sortBy === col) {
      arrow.textContent = state.sortDir === "asc" ? "▲" : "▼";
      el.classList.add("sorted");
      el.classList.toggle("sorted-desc", state.sortDir === "desc");
    } else {
      arrow.textContent = "↕";
      el.classList.remove("sorted");
      el.classList.remove("sorted-desc");
    }
  });
}

function exportExcelFiltered() {
  const filtered = applyFilters(state.movements || []);
  if (!filtered.length) {
    if (typeof alert !== "undefined") alert("No hay movimientos filtrados para exportar.");
    return;
  }
  const csv = movementsToCSV(filtered);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caja-movimientos-filtrados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exportado filtrado para Excel.");
}

function applyRolePermissions() {
  const isSuper = isSuperRole();

  const perms = state.movementsPermissions || { can_read: true, can_write: false };
  const canReadMovements = isSuper || !!perms.can_read;
  const canWriteMovements = isSuper || !!perms.can_write;

  const canImport = canWriteMovements;
  const canViewDeleted = canReadMovements;

  const form = document.getElementById("movement-form");
  if (form) {
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = !canWriteMovements;
    const clearBtn = document.getElementById("btn-clear-form");
    if (clearBtn) clearBtn.disabled = !canWriteMovements;

    // Lectura deshabilita el formulario completo.
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      el.disabled = !canWriteMovements;
    });
  }

  document.querySelectorAll(".edit-btn").forEach((btn) => { btn.disabled = !canWriteMovements; });
  document.querySelectorAll(".delete-btn").forEach((btn) => { btn.disabled = !canWriteMovements; });

  const fileImport = document.getElementById("file-import");
  if (fileImport) fileImport.disabled = !canImport;
  const fileImportMenu = document.getElementById("file-import-menu");
  if (fileImportMenu) fileImportMenu.disabled = !canImport;

  // Panel de eliminados solo si puede leer.
  const btnVerEliminados = document.getElementById("btn-ver-eliminados");
  if (btnVerEliminados) btnVerEliminados.style.display = canViewDeleted ? "" : "none";
  const menuVer = document.getElementById("menu-ver-eliminados");
  if (menuVer) menuVer.style.display = canViewDeleted ? "" : "none";

  // Deshabilitar exportaciones si no puede leer.
  const btnExportMain = document.getElementById("btn-export-main");
  if (btnExportMain) btnExportMain.disabled = !canReadMovements;
  const exportOptions = document.querySelectorAll("#export-dropdown-menu .export-option");
  exportOptions.forEach((b) => { b.disabled = !canReadMovements; });
  ["menu-export", "menu-export-excel", "menu-export-excel-filtered"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canReadMovements;
  });

  // Crear usuarios (solo super) en UI.
  const menuCreateUser = document.getElementById("menu-admin-create-user");
  if (menuCreateUser) menuCreateUser.classList.toggle("hidden", !isSuper);
  const btnCreateUserTop = document.getElementById("btn-admin-create-user-top");
  if (btnCreateUserTop) btnCreateUserTop.classList.toggle("hidden", !isSuper);

  const cuadPanel = document.getElementById("panel-cuadratura");
  if (cuadPanel) {
    cuadPanel.querySelectorAll('input[type="number"]').forEach((el) => {
      el.disabled = !canWriteMovements;
    });
  }
  const btnCuadGuardar = document.getElementById("btn-cuadratura-guardar");
  if (btnCuadGuardar) btnCuadGuardar.disabled = !canWriteMovements;
  const btnCuadLimpiar = document.getElementById("btn-cuadratura-clear");
  if (btnCuadLimpiar) btnCuadLimpiar.disabled = !canWriteMovements;

  const btnRefVista = document.getElementById("btn-cuadraturas-vista-refresh");
  if (btnRefVista) {
    btnRefVista.disabled = !state.useSupabase || !getSupabase() || !canReadMovements;
  }

  refreshCuadraturaHistorialUi();
  refreshCuadraturasVistaIfOpen();
}

async function createUserViaAdminApi() {
  try {
    const email = (window.prompt("Email del nuevo usuario:") || "").trim();
    if (!email) return;

    const password = window.prompt("Contraseña del nuevo usuario (mín. 6):") || "";
    if (password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    const roleInput = (window.prompt("Rol: escribe 'super', 'admin' o 'user':", "user") || "").trim();
    const role = (roleInput === "super" || roleInput === "admin" || roleInput === "user") ? roleInput : "user";

    const session = await getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      alert("No hay sesión activa. Recarga la página e inicia sesión nuevamente.");
      return;
    }

    const resp = await fetch(`${API_BASE}/api/admin/create-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, password, role }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 404) alert("La API no está disponible (404). Si estás en local, ejecuta 'vercel dev' o abre la app desde la URL desplegada en Vercel.");
      else alert(data?.error || data?.message || "Error al crear usuario.");
      showToast("No se pudo crear el usuario.");
      return;
    }

    showToast("Usuario creado correctamente.");
  } catch (e) {
    console.error(e);
    alert("Error inesperado creando el usuario.");
  }
}

function createCell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text ?? "";
  return td;
}

function clearMovementFormErrors() {
  const msg = document.getElementById("movement-form-error");
  if (msg) {
    msg.textContent = "";
    msg.classList.add("hidden");
  }
  document.querySelectorAll("#movement-form .field.has-error").forEach((el) => {
    el.classList.remove("has-error");
  });
}

function showMovementFormError(message, fieldIds = []) {
  const msg = document.getElementById("movement-form-error");
  if (msg) {
    msg.textContent = message;
    msg.classList.remove("hidden");
  }
  fieldIds.forEach((id) => {
    const input = document.getElementById(id);
    const field = input?.closest(".field");
    if (field) field.classList.add("has-error");
  });
  msg?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function validateMovementForm(form) {
  const missingFields = [];
  const missingLabels = [];
  const date = (form.date?.value || "").trim();
  const concept = (form.concept?.value || "").trim();
  const amountStr = String(form.amount?.value ?? "").trim().replace(",", ".");
  const amount = parseFloat(amountStr);

  if (!date) {
    missingFields.push("date");
    missingLabels.push("fecha");
  }
  if (!concept) {
    missingFields.push("concept");
    missingLabels.push("concepto");
  }
  if (form.amount?.value === "" || form.amount?.value == null) {
    missingFields.push("amount");
    missingLabels.push("monto");
  } else if (isNaN(amount) || amount < 0) {
    missingFields.push("amount");
    missingLabels.push("monto válido (≥ 0)");
  }

  if (missingFields.length === 0) {
    return { valid: true, fields: [], message: "", date, concept, amount, amountStr };
  }

  const message = missingLabels.length === 1
    ? `Completá el campo obligatorio: ${missingLabels[0]}.`
    : `Completá los campos obligatorios: ${missingLabels.join(", ")}.`;
  return { valid: false, fields: missingFields, message };
}

function setMovementFormSubmitting(submitting, submitBtn) {
  if (!submitBtn) return;
  if (submitting) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";
  } else {
    submitBtn.textContent = state.editingId ? "Actualizar" : "Guardar";
    submitBtn.disabled = false;
    applyRolePermissions();
  }
}

function resetForm() {
  const form = document.getElementById("movement-form");
  if (form) {
    form.reset();
    const dateInput = document.getElementById("date");
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    const typeEl = document.getElementById("type");
    if (typeEl) typeEl.value = "ingreso";
    updateLocalDatalist("");
    updateConceptDatalist("");
  }
  clearMovementFormErrors();
  state.editingId = null;
}

function startEdit(id) {
  const movement = state.movements.find((m) => m.id === id);
  if (!movement) return;
  if (!canEditMovement(movement)) {
    showCenterDialog("No puede editar este movimiento.");
    return;
  }
  const form = document.getElementById("movement-form");
  if (!form) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ""; };
  updateLocalDatalist(movement.local);
  updateConceptDatalist(movement.concept);
  set("date", movement.date);
  set("type", movement.type || "ingreso");
  set("amount", movement.amount);
  set("notes", movement.notes);
  state.editingId = id;
  clearMovementFormErrors();
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.textContent = "Actualizar";
  }
}

function deleteMovement(id) {
  if (!canDeleteMovement()) {
    showCenterDialog("No está autorizado a eliminar.");
    return;
  }
  if (!confirm("¿Eliminar este movimiento? Quedará en el registro de eliminados.")) return;
  // Diferir el trabajo pesado para no bloquear INP (respuesta al clic)
  setTimeout(async () => {
    const supabase = getSupabase();
    if (state.useSupabase && supabase && navigator.onLine) {
      const { error } = await supabase.from("movements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        showToast("Error al eliminar.");
        return;
      }
      state.movements = state.movements.filter((m) => m.id !== id);
      saveMovementsLocal(state.movements);
      renderTable();
      showToast("Movimiento eliminado.");
      return;
    }
    state.movements = state.movements.filter((m) => m.id !== id);
    saveMovementsLocal(state.movements);
    renderTable();
    showToast("Movimiento eliminado.");
  }, 0);
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  clearMovementFormErrors();

  const validation = validateMovementForm(form);
  if (!validation.valid) {
    showMovementFormError(validation.message, validation.fields);
    return;
  }

  const { date, concept, amount } = validation;
  const type = form.type?.value || "ingreso";
  const local = (form.local?.value || "").trim();
  const notes = (form.notes?.value || "").trim();
  const payload = { date, local, concept, type, amount, notes };

  setMovementFormSubmitting(true, submitBtn);
  try {
    const supabase = getSupabase();
    if (state.useSupabase && supabase && navigator.onLine) {
      if (state.editingId) {
        const existing = state.movements.find((x) => x.id === state.editingId);
        if (existing && !canEditMovement(existing)) {
          showCenterDialog("No puede editar este movimiento.");
          return;
        }
        const { error } = await supabase.from("movements").update(payload).eq("id", state.editingId);
        if (error) {
          showToast("Error al actualizar: " + (error.message || "revisa la conexión."));
          return;
        }
        showToast("Movimiento actualizado.");
      } else {
        const { data, error } = await supabase
          .from("movements")
          .insert(payload)
          .select("id, creator_email, created_by")
          .single();
        if (error) {
          showToast("Error al guardar: " + (error.message || "revisa la conexión."));
          return;
        }
        showToast("Movimiento agregado.");
        state.movements = [
          ...state.movements,
          {
            id: data.id,
            ...payload,
            creator_email: data.creator_email || "",
            created_by: data.created_by || null,
          },
        ];
        renderTable();
        resetForm();
        requestAnimationFrame(() => {
          renderTable();
          const tbody = document.getElementById("movements-body");
          if (tbody && tbody.lastElementChild) tbody.lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        loadMovementsFromSupabase().then((list) => {
          if (Array.isArray(list)) {
            state.movements = list;
            renderTable();
          }
        }).catch(() => {});
        return;
      }
      state.movements = await loadMovementsFromSupabase();
      renderTable();
      resetForm();
      return;
    }

    if (state.editingId) {
      const existing = state.movements.find((x) => x.id === state.editingId);
      if (existing && !canEditMovement(existing)) {
        showCenterDialog("No puede editar este movimiento.");
        return;
      }
      state.movements = state.movements.map((m) =>
        m.id === state.editingId ? { ...m, ...payload } : m
      );
      showToast("Movimiento actualizado.");
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      state.movements.push({ id, ...payload, created_by: null, creator_email: "" });
      showToast("Movimiento agregado.");
    }
    saveMovementsLocal(state.movements);
    renderTable();
    resetForm();
  } finally {
    setMovementFormSubmitting(false, submitBtn);
  }
}

function exportJSON() {
  const dataStr = JSON.stringify(state.movements, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caja-movimientos-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exportado como JSON.");
}

async function importJSONFromFile(file) {
  const text = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file, "utf-8");
  });
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert("El archivo no tiene el formato esperado (no es una lista).");
      return;
    }
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: item.date || "",
        concept: item.concept || "",
        type: item.type === "egreso" ? "egreso" : "ingreso",
        amount: Number(item.amount) || 0,
        local: item.local || "",
        notes: item.notes || "",
        created_by: item.created_by || null,
        creator_email: item.creator_email || "",
      }));
    const supabaseImport = getSupabase();
    if (state.useSupabase && supabaseImport && navigator.onLine) {
      for (const row of cleaned) {
        const { date, local, concept, type, amount, notes } = row;
        await supabaseImport.from("movements").insert({ date, local, concept, type, amount, notes });
      }
      state.movements = await loadMovementsFromSupabase();
      showToast("Datos importados.");
    } else {
      state.movements = cleaned;
      saveMovementsLocal(state.movements);
      showToast("Datos importados.");
    }
    renderTable();
  } catch (err) {
    console.error(err);
    alert("No se pudo leer el archivo JSON.");
  }
}

async function loadDeletedMovements() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("movements")
    .select("id, date, local, concept, type, amount, notes, deleted_at, creator_email, created_by")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) return [];
  return (data || []).map((r) => ({
    ...rowToMovement(r),
    deleted_at: r.deleted_at,
  }));
}

function renderDeletedPanel(list) {
  const tbody = document.getElementById("deleted-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  (list || []).forEach((m) => {
    const tr = document.createElement("tr");
    tr.appendChild(createCell(m.date || ""));
    tr.appendChild(createCell(m.local || ""));
    tr.appendChild(createCell(m.concept || ""));
    const tdType = document.createElement("td");
    const span = document.createElement("span");
    span.className = `cell-type ${m.type}`;
    span.textContent = m.type === "ingreso" ? "Ingreso" : "Egreso";
    tdType.appendChild(span);
    tr.appendChild(tdType);
    const tdAmount = document.createElement("td");
    tdAmount.className = "cell-amount";
    tdAmount.textContent = formatCurrency(m.amount);
    tr.appendChild(tdAmount);
    tr.appendChild(createCell(m.notes || ""));
    tr.appendChild(createCell(m.creator_email || "—"));
    tr.appendChild(createCell(formatDateTime(m.deleted_at)));
    const tdRestore = document.createElement("td");
    const btnRestore = document.createElement("button");
    btnRestore.className = "edit-btn";
    btnRestore.textContent = "Restaurar";
    btnRestore.addEventListener("click", () => restoreMovement(m.id));
    tdRestore.appendChild(btnRestore);
    tr.appendChild(tdRestore);
    tbody.appendChild(tr);
  });
}

async function restoreMovement(id) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("movements").update({ deleted_at: null }).eq("id", id);
  if (error) {
    showToast("Error al restaurar.");
    return;
  }
  state.deletedMovements = await loadDeletedMovements();
  renderDeletedPanel(state.deletedMovements);
  state.movements = await loadMovementsFromSupabase();
  renderTable();
  showToast("Movimiento restaurado.");
}

function showDeletedPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-deleted");
  const cuad = document.getElementById("panel-cuadraturas");
  if (main) main.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
  if (cuad) cuad.classList.add("hidden");
}

function hideDeletedPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-deleted");
  if (main) main.classList.remove("hidden");
  if (panel) panel.classList.add("hidden");
}

async function openDeletedPanel() {
  if (state.useSupabase && getSupabase()) {
    state.deletedMovements = await loadDeletedMovements();
    renderDeletedPanel(state.deletedMovements);
  } else {
    renderDeletedPanel([]);
  }
  showDeletedPanel();
}

// --- Administración (solo super) ---
function showAdminPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-admin");
  const deletedPanel = document.getElementById("panel-deleted");
  const cuad = document.getElementById("panel-cuadraturas");
  if (main) main.classList.add("hidden");
  if (deletedPanel) deletedPanel.classList.add("hidden");
  if (cuad) cuad.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
}

function hideAdminPanel() {
  const main = document.querySelector("main");
  const panel = document.getElementById("panel-admin");
  const deletedPanel = document.getElementById("panel-deleted");
  if (main) main.classList.remove("hidden");
  if (deletedPanel) deletedPanel.classList.add("hidden");
  if (panel) panel.classList.add("hidden");
}

async function getAccessTokenForAdminApi() {
  const session = await getSession();
  return session?.access_token || "";
}

function getUserRoleFromUserObj(u) {
  const rawRole =
    u?.user_metadata?.role ??
    u?.raw_user_meta_data?.role ??
    u?.app_metadata?.role ??
    u?.raw_app_meta_data?.role ??
    null;
  return normalizeAppRole(rawRole);
}

/** Interpreta booleanos que vienen de la API (evita tratar el string "false" como truthy). */
function adminPanelPermBool(value, defaultWhenMissing) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const l = value.trim().toLowerCase();
    if (l === "true" || l === "t" || l === "1") return true;
    if (l === "false" || l === "f" || l === "0") return false;
  }
  return defaultWhenMissing;
}

async function loadAdminUsers() {
  const tbody = document.getElementById("admin-users-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const loadingRow = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 5;
  td.textContent = "Cargando...";
  loadingRow.appendChild(td);
  tbody.appendChild(loadingRow);

  const token = await getAccessTokenForAdminApi();
  if (!token) {
    tbody.innerHTML = "";
    showToast("No hay sesión activa.");
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/api/admin/list-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 404) alert("La API no está disponible (404). Si estás en local, ejecuta 'vercel dev' o abre la app desde la URL desplegada en Vercel.");
      else alert(data?.error || "No se pudo listar usuarios.");
      tbody.innerHTML = "";
      return;
    }

    const users = data?.users || [];
    tbody.innerHTML = "";
    if (!users.length) {
      const empty = document.createElement("tr");
      const tdEmpty = document.createElement("td");
      tdEmpty.colSpan = 5;
      tdEmpty.textContent = "No hay usuarios.";
      empty.appendChild(tdEmpty);
      tbody.appendChild(empty);
      return;
    }

    users.forEach((u) => {
      const userId = u?.id || u?.user_id || "";
      const email = u?.email || "";
      const role = getUserRoleFromUserObj(u);
      const cr = u?.can_read_movements;
      const cw = u?.can_write_movements;
      const canReadMovements = role === "super" ? true : adminPanelPermBool(cr, true);
      const canWriteMovements = role === "super" ? true : adminPanelPermBool(cw, false);

      const tr = document.createElement("tr");
      tr.appendChild(createCell(email));

      const tdRead = document.createElement("td");
      const cbRead = document.createElement("input");
      cbRead.type = "checkbox";
      cbRead.checked = canReadMovements;
      tdRead.appendChild(cbRead);
      tr.appendChild(tdRead);

      const tdWrite = document.createElement("td");
      const cbWrite = document.createElement("input");
      cbWrite.type = "checkbox";
      cbWrite.checked = canWriteMovements;
      tdWrite.appendChild(cbWrite);
      tr.appendChild(tdWrite);

      const tdRole = document.createElement("td");
      const select = document.createElement("select");
      select.value = role;
      select.dataset.userId = userId;
      select.dataset.originalRole = role;
      ["super", "admin", "user"].forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        if (r === role) opt.selected = true;
        select.appendChild(opt);
      });
      tdRole.appendChild(select);
      tr.appendChild(tdRole);

      const tdActions = document.createElement("td");
      const btnSave = document.createElement("button");
      btnSave.type = "button";
      btnSave.className = "btn secondary";
      btnSave.textContent = "Guardar";
      btnSave.addEventListener("click", async () => {
        const nextRole = select.value;
        const uid = select.dataset.userId;
        const roleChanged = nextRole !== (select.dataset.originalRole || "");
        if (roleChanged) await updateUserRoleAdmin(uid, nextRole);
        const permOk = await updateMovementsPermissionsAdmin(uid, cbRead.checked, cbWrite.checked);
        if (permOk) await loadAdminUsers();
        if (roleChanged) select.dataset.originalRole = nextRole;
      });
      tdActions.appendChild(btnSave);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = "";
    const errRow = document.createElement("tr");
    const errTd = document.createElement("td");
    errTd.colSpan = 5;
    errTd.textContent =
      "No se pudo cargar la lista (revisa la consola). En local suele faltar la API: ejecuta «vercel dev» en esta carpeta o despliega y usa la URL de Vercel en CAJA_API_BASE.";
    errTd.style.color = "var(--danger, #f87171)";
    errRow.appendChild(errTd);
    tbody.appendChild(errRow);
    alert("Error listando usuarios.");
  }
}

async function updateUserRoleAdmin(userId, role) {
  if (!userId) return;
  const token = await getAccessTokenForAdminApi();
  if (!token) {
    alert("No hay sesión activa.");
    return;
  }
  const resp = await fetch(`${API_BASE}/api/admin/update-user-role`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId, role }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 404) alert("La API no está disponible (404). Si estás en local, ejecuta 'vercel dev' o abre la app desde la URL desplegada en Vercel.");
    else alert(data?.error || "Error actualizando rol.");
  } else {
    showToast("Rol actualizado.");
  }
}

async function updateMovementsPermissionsAdmin(userId, canRead, canWrite) {
  if (!userId) return false;
  const token = await getAccessTokenForAdminApi();
  if (!token) {
    alert("No hay sesión activa.");
    return false;
  }

  const resp = await fetch(`${API_BASE}/api/admin/update-module-permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      userId,
      module: "movements",
      can_read: !!canRead,
      can_write: !!canWrite,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 404) alert("La API no está disponible (404). Si estás en local, ejecuta 'vercel dev' o abre la app desde la URL desplegada en Vercel.");
    else alert(data?.error || "Error actualizando permisos.");
    return false;
  }
  showToast("Permisos actualizados.");
  return true;
}

async function createUserFromAdminPanel() {
  const email = (document.getElementById("admin-create-email")?.value || "").trim();
  const password = document.getElementById("admin-create-password")?.value || "";
  const role = document.getElementById("admin-create-role")?.value || "user";

  if (!email) return alert("Falta email.");
  if (password.length < 6) return alert("La contraseña debe tener al menos 6 caracteres.");

  const token = await getAccessTokenForAdminApi();
  if (!token) return alert("No hay sesión activa.");

  const resp = await fetch(`${API_BASE}/api/admin/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, password, role }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 404) alert("La API no está disponible (404). Si estás en local, ejecuta 'vercel dev' o abre la app desde la URL desplegada en Vercel.");
    else alert(data?.error || "Error al crear usuario.");
    return;
  }

  showToast("Usuario creado correctamente.");
  document.getElementById("admin-create-password").value = "";
  await loadAdminUsers();
}

async function openAdminPanel() {
  if (state.currentRole !== "super") return;
  showAdminPanel();
  await loadAdminUsers();
}

function getAuthRedirectUrl() {
  const path = window.location.pathname || "/";
  return `${window.location.origin}${path}`;
}

async function handleOAuthReturn() {
  const supabase = getSupabase();
  if (!supabase) return;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleanUrl || "/");

  if (error) {
    console.warn("Error al completar OAuth:", error);
    showLoginScreen();
    setupLoginListeners();
    showLoginView("login");
    setLoginError("No se pudo completar el inicio de sesión con Google. Intenta de nuevo.");
  }
}

async function enterAppAfterAuth() {
  showAppContent();
  await loadCurrentUserRole();
  if (state.currentRole !== "super") hideAdminPanel();
  await initAppContent();
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.style.display = "";
}

function setLoginButtonsDisabled(disabled) {
  ["btn-login-entrar", "btn-login-crear", "btn-login-google"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

async function doGoogleLogin() {
  setLoginError("");
  const supabase = getSupabase();
  if (!supabase) {
    setLoginError("Error de conexión. Recarga la página.");
    return;
  }

  const btnGoogle = document.getElementById("btn-login-google");
  const googleLabel = btnGoogle?.querySelector(".btn-google-label");
  if (btnGoogle) btnGoogle.disabled = true;
  if (googleLabel) googleLabel.textContent = "Redirigiendo…";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("not enabled") || msg.includes("unsupported provider")) {
      setLoginError(
        "Google no está activado en Supabase. Entra a Authentication → Providers → Google, actívalo y guarda el Client ID y Secret de Google Cloud."
      );
    } else {
      setLoginError(error.message || "No se pudo iniciar sesión con Google.");
    }
    if (btnGoogle) btnGoogle.disabled = false;
    if (googleLabel) googleLabel.textContent = "Continuar con Google";
  }
}

// --- Login / Auth (solo cuando useSupabase) ---
function showLoginScreen() {
  const login = document.getElementById("login-screen");
  const app = document.getElementById("app-content");
  if (login) login.classList.remove("hidden");
  if (app) app.classList.add("hidden");
}

function showAppContent() {
  const login = document.getElementById("login-screen");
  const app = document.getElementById("app-content");
  if (login) login.classList.add("hidden");
  if (app) app.classList.remove("hidden");
  hideAdminPanel();
  hideDeletedPanel();
  hideCuadraturasSavedPanel();
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.style.display = "";
  if (typeof syncMenuVisibility === "function") syncMenuVisibility();
  syncPortalHomeUi();
}

function setLoginMessage(msg, isSuccess) {
  const el = document.getElementById("login-message");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
  el.classList.toggle("login-error", msg && !isSuccess);
  el.classList.toggle("login-success", msg && isSuccess);
}
function setLoginError(msg) {
  setLoginMessage(msg, false);
}

async function getSession() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function loadCurrentUserRole() {
  const supabase = getSupabase();
  if (!supabase) {
    state.currentRole = "user";
    return "user";
  }

  function decodeJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return {};
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      const jsonStr = atob(base64);
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  }

  // 1) Intentar leer role desde el JWT (más fiable que depender del objeto user)
  try {
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token || session?.access_token || "";
    const payload = decodeJwtPayload(token);
    const rawRoleFromJwt =
      payload?.user_metadata?.role ??
      payload?.app_metadata?.role ??
      payload?.role ??
      null;

    if (rawRoleFromJwt != null && String(rawRoleFromJwt).trim() !== "") {
      const mapped = normalizeAppRole(rawRoleFromJwt);
      state.currentRole = mapped;
      return mapped;
    }
  } catch {
    // seguir con fallback
  }

  // 2) Fallback: intentar leer desde auth.getUser()
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn("No se pudo obtener el usuario actual:", error);
    state.currentRole = "user";
    return "user";
  }

  const rawRole =
    data?.user?.user_metadata?.role ??
    data?.user?.raw_user_meta_data?.role ??
    data?.user?.app_metadata?.role ??
    data?.user?.raw_app_meta_data?.role ??
    null;
  const role = normalizeAppRole(rawRole);
  state.currentRole = role;
  return role;
}

async function loadMyMovementsPermissions() {
  if (!state.useSupabase) {
    state.movementsPermissions = { can_read: true, can_write: true };
    return;
  }
  state.movementsPermissions = { can_read: true, can_write: false };
  if (isSuperRole()) {
    state.movementsPermissions = { can_read: true, can_write: true };
    return;
  }
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("user_module_permissions")
      .select("can_read,can_write")
      .eq("module", "movements")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return;
    state.movementsPermissions = {
      can_read: !!data.can_read,
      can_write: !!data.can_write,
    };
  } catch (e) {
    console.warn("No se pudo cargar permisos del módulo:", e);
  }
}

function getLoginEmailPassword() {
  const form = document.getElementById("login-form");
  if (!form) return { email: "", password: "", role: "full" };
  const email = (form.email?.value || "").trim();
  const password = form.password?.value || "";
  const role = form.role?.value || "full";
  return { email, password, role };
}

async function doLogin() {
  const { email, password } = getLoginEmailPassword();
  if (!email || !password) {
    setLoginError("Completa correo y contraseña.");
    return;
  }
  setLoginError("");
  const supabase = getSupabase();
  if (!supabase) {
    setLoginError("Error de conexión. Recarga la página.");
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setLoginError("No hay cuenta con este correo o la contraseña es incorrecta. Si es la primera vez, usa «Crear cuenta».");
    return;
  }
  setLoginButtonsDisabled(true);
  try {
    await enterAppAfterAuth();
  } finally {
    setLoginButtonsDisabled(false);
  }
}

async function doSignUp() {
  setLoginError("La creación de cuentas está deshabilitada. Contacta a un usuario super.");
  return;
  const { email, password, role } = getLoginEmailPassword();
  if (!email || !password) {
    setLoginError("Completa correo y contraseña.");
    return;
  }
  if (password.length < 6) {
    setLoginError("La contraseña debe tener al menos 6 caracteres.");
    return;
  }
  setLoginError("");
  const supabase = getSupabase();
  if (!supabase) {
    setLoginError("Error de conexión. Recarga la página.");
    return;
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: role === "viewer" ? "viewer" : "full" },
    },
  });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("exceeded")) {
      setLoginError("Demasiados intentos. Espera 10–15 minutos antes de volver a intentar.");
    } else {
      setLoginError(error.message || "Error al crear la cuenta. ¿Ya tienes una? Prueba «Entrar».");
    }
    return;
  }
  if (data?.user && !data.session) {
    setLoginMessage("Revisa tu correo para activar la cuenta (y la carpeta de spam). No vuelvas a pulsar «Crear cuenta».", true);
    const btnCrear = document.getElementById("btn-login-crear");
    if (btnCrear) {
      btnCrear.disabled = true;
      const textOrig = btnCrear.textContent;
      btnCrear.textContent = "Revisa tu correo…";
      setTimeout(() => {
        btnCrear.disabled = false;
        btnCrear.textContent = textOrig;
      }, 60000);
    }
    return;
  }
  showAppContent();
  setLoginButtonsDisabled(true);
  try {
    await enterAppAfterAuth();
  } finally {
    setLoginButtonsDisabled(false);
  }
}

function showLoginView(view) {
  const form = document.getElementById("login-form");
  const recoverView = document.getElementById("login-recover-view");
  const newPasswordView = document.getElementById("login-new-password-view");
  if (form) form.classList.toggle("hidden", view !== "login");
  if (recoverView) recoverView.classList.toggle("hidden", view !== "recover");
  if (newPasswordView) newPasswordView.classList.toggle("hidden", view !== "new-password");
}

function setupLoginListeners() {
  const form = document.getElementById("login-form");
  const btnEntrar = document.getElementById("btn-login-entrar");
  const btnCrear = document.getElementById("btn-login-crear");
  const btnOlvide = document.getElementById("btn-olvide-password");
  const btnVolver = document.getElementById("btn-volver-login");
  const btnEnviarEnlace = document.getElementById("btn-enviar-enlace");
  const btnGuardarPassword = document.getElementById("btn-guardar-password");
  const btnGoogle = document.getElementById("btn-login-google");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin();
  });

  if (btnEntrar) btnEntrar.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
  if (btnCrear) btnCrear.addEventListener("click", (e) => { e.preventDefault(); doSignUp(); });
  if (btnGoogle) btnGoogle.addEventListener("click", (e) => { e.preventDefault(); void doGoogleLogin(); });

  if (btnOlvide) btnOlvide.addEventListener("click", () => {
    setLoginMessage("", false);
    showLoginView("recover");
    const emailEl = document.getElementById("recover-email");
    if (emailEl) { emailEl.value = document.getElementById("login-email")?.value || ""; emailEl.focus(); }
  });
  if (btnVolver) btnVolver.addEventListener("click", () => {
    const recoverMsg = document.getElementById("recover-message");
    if (recoverMsg) recoverMsg.classList.add("hidden");
    showLoginView("login");
  });
  if (btnEnviarEnlace) btnEnviarEnlace.addEventListener("click", doForgotPassword);
  if (btnGuardarPassword) btnGuardarPassword.addEventListener("click", doUpdatePassword);
}

function setRecoverMessage(msg, isSuccess) {
  const el = document.getElementById("recover-message");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
  el.classList.toggle("login-error", msg && !isSuccess);
  el.classList.toggle("login-success", msg && isSuccess);
}
function setNewPasswordMessage(msg, isSuccess) {
  const el = document.getElementById("new-password-message");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
  el.classList.toggle("login-error", msg && !isSuccess);
  el.classList.toggle("login-success", msg && isSuccess);
}

async function doForgotPassword() {
  const emailEl = document.getElementById("recover-email");
  const email = (emailEl?.value || "").trim();
  if (!email) {
    setRecoverMessage("Escribe tu correo.", false);
    return;
  }
  setRecoverMessage("");
  const supabase = getSupabase();
  if (!supabase) {
    setRecoverMessage("Error de conexión. Recarga la página.", false);
    return;
  }
  const redirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("rate limit") || msg.includes("exceeded")) {
      setRecoverMessage("Demasiados intentos. Espera 10–15 minutos antes de volver a enviar el enlace. Si tienes acceso a Supabase, puedes restablecer la contraseña desde Authentication → Users.", false);
    } else {
      setRecoverMessage(error.message || "No se pudo enviar el enlace.", false);
    }
    return;
  }
  setRecoverMessage("Revisa tu correo (y la carpeta de spam) para restablecer la contraseña.", true);
}

async function doUpdatePassword() {
  const newPass = document.getElementById("new-password")?.value || "";
  const repeat = document.getElementById("new-password-repeat")?.value || "";
  if (newPass.length < 6) {
    setNewPasswordMessage("La contraseña debe tener al menos 6 caracteres.", false);
    return;
  }
  if (newPass !== repeat) {
    setNewPasswordMessage("Las contraseñas no coinciden.", false);
    return;
  }
  setNewPasswordMessage("");
  const supabase = getSupabase();
  if (!supabase) {
    setNewPasswordMessage("Error de conexión.", false);
    return;
  }
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) {
    setNewPasswordMessage(error.message || "No se pudo guardar.", false);
    return;
  }
  setNewPasswordMessage("Contraseña actualizada. Entrando…", true);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  showAppContent();
  const btnGuardar = document.getElementById("btn-guardar-password");
  if (btnGuardar) btnGuardar.disabled = true;
  await loadCurrentUserRole();
  if (state.currentRole !== "super") hideAdminPanel();
  await initAppContent();
  if (btnGuardar) btnGuardar.disabled = false;
  document.getElementById("btn-logout")?.style.setProperty("display", "");
}

function syncMenuVisibility() {
  const btnVer = document.getElementById("btn-ver-eliminados");
  const btnLogout = document.getElementById("btn-logout");
  const menuVer = document.getElementById("menu-ver-eliminados");
  const menuLogout = document.getElementById("menu-logout");
  if (menuVer) menuVer.style.display = btnVer && btnVer.style.display !== "none" ? "" : "none";
  if (menuLogout) menuLogout.style.display = btnLogout && btnLogout.style.display !== "none" ? "" : "none";
}

async function initAppContent() {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  const btnVerEliminados = document.getElementById("btn-ver-eliminados");
  if (btnVerEliminados) btnVerEliminados.style.display = state.useSupabase ? "" : "none";
  syncMenuVisibility();
  syncPortalHomeUi();
  setupEventListeners();
  setupOfflineDetection();
  if (state.useSupabase && getSupabase()) {
    await loadCurrentUserRole();
  }
  await refreshCurrentUserId();
  await loadMyMovementsPermissions();
  initFilterDefaults();
  syncFilterPeriodControls();
  state.movements = await loadMovements();
  renderTable();
  applyRolePermissions();
  setupRealtime();
}

function setupEventListeners() {
  const form = document.getElementById("movement-form");
  if (form) form.addEventListener("submit", handleSubmit);

  ["date", "concept", "amount"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        el.closest(".field")?.classList.remove("has-error");
        const errEl = document.getElementById("movement-form-error");
        if (errEl && !document.querySelector("#movement-form .field.has-error")) {
          errEl.textContent = "";
          errEl.classList.add("hidden");
        }
      });
    }
  });

  const btnClear = document.getElementById("btn-clear-form");
  if (btnClear) btnClear.addEventListener("click", (e) => { e.preventDefault(); resetForm(); });

  setupThemeToggle();
  setupMovementsViewToggle();

  const dateInput = document.getElementById("date");
  const btnCalendar = document.getElementById("btn-open-calendar");
  if (btnCalendar) btnCalendar.addEventListener("click", () => {
    if (dateInput && typeof dateInput.showPicker === "function") dateInput.showPicker();
    else if (dateInput) { dateInput.focus(); dateInput.click(); }
  });

  const btnExportMain = document.getElementById("btn-export-main");
  const exportMenu = document.getElementById("export-dropdown-menu");
  function closeExportMenu() {
    if (exportMenu) exportMenu.classList.add("hidden");
  }
  if (btnExportMain && exportMenu) {
    btnExportMain.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("hidden");
    });
    const options = exportMenu.querySelectorAll(".export-option");
    options.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        const type = opt.dataset.export;
        if (type === "json") exportJSON();
        else if (type === "excel-all") exportExcel();
        else if (type === "excel-filtered") exportExcelFiltered();
        closeExportMenu();
      });
    });
    document.body.addEventListener("click", () => closeExportMenu());
    exportMenu.addEventListener("click", (e) => e.stopPropagation());
  }

  const fileImport = document.getElementById("file-import");
  if (fileImport) fileImport.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) { importJSONFromFile(file); e.target.value = ""; }
  });

  ["filter-text", "filter-type", "filter-period-diario", "filter-period-mes", "filter-date-desde", "filter-date-hasta"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === "filter-text" ? "input" : "change", renderTable);
  });
  const filterAnio = document.getElementById("filter-period-anio");
  if (filterAnio) filterAnio.addEventListener("input", renderTable);
  const periodMode = document.getElementById("filter-period-mode");
  if (periodMode) {
    periodMode.addEventListener("change", () => {
      syncFilterPeriodControls();
      renderTable();
    });
  }
  const centerDlg = document.getElementById("center-dialog");
  const centerOk = document.getElementById("center-dialog-ok");
  if (centerOk && centerDlg) {
    centerOk.addEventListener("click", () => centerDlg.classList.add("hidden"));
    centerDlg.addEventListener("click", (e) => {
      if (e.target === centerDlg) centerDlg.classList.add("hidden");
    });
  }

  const sortHeaders = document.querySelectorAll(".sort-header");
  sortHeaders.forEach((el) => {
    el.addEventListener("click", () => {
      const col = el.dataset.sortCol;
      setSort(col);
    });
  });
  const btnVerEliminados = document.getElementById("btn-ver-eliminados");
  if (btnVerEliminados) btnVerEliminados.addEventListener("click", openDeletedPanel);
  const btnVerCuadraturasGuardadas = document.getElementById("btn-ver-cuadraturas-guardadas");
  if (btnVerCuadraturasGuardadas) btnVerCuadraturasGuardadas.addEventListener("click", () => void openCuadraturasSavedPanel());
  const btnCuadraturasVistaVolver = document.getElementById("btn-cuadraturas-vista-volver");
  if (btnCuadraturasVistaVolver) btnCuadraturasVistaVolver.addEventListener("click", hideCuadraturasSavedPanel);
  const btnCuadraturasVistaRefresh = document.getElementById("btn-cuadraturas-vista-refresh");
  if (btnCuadraturasVistaRefresh) {
    btnCuadraturasVistaRefresh.addEventListener("click", () => void refreshCuadraturasSavedPanelContent());
  }
  const btnVolver = document.getElementById("btn-volver-movimientos");
  if (btnVolver) btnVolver.addEventListener("click", hideDeletedPanel);

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    showLoginScreen();
  });

  const btnMenu = document.getElementById("btn-topbar-menu");
  const menuDropdown = document.getElementById("topbar-menu-dropdown");
  function closeMenu() {
    if (menuDropdown) menuDropdown.classList.add("hidden");
  }
  if (btnMenu && menuDropdown) {
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle("hidden");
    });
    document.body.addEventListener("click", () => closeMenu());
    menuDropdown.addEventListener("click", (e) => e.stopPropagation());
  }
  const menuVer = document.getElementById("menu-ver-eliminados");
  if (menuVer) menuVer.addEventListener("click", () => { openDeletedPanel(); closeMenu(); });
  const menuCuadraturas = document.getElementById("menu-ver-cuadraturas-guardadas");
  if (menuCuadraturas) menuCuadraturas.addEventListener("click", () => { void openCuadraturasSavedPanel(); closeMenu(); });
  const menuTheme = document.getElementById("menu-theme-toggle");
  if (menuTheme) menuTheme.addEventListener("click", () => { toggleTheme(); closeMenu(); });
  const menuExport = document.getElementById("menu-export");
  if (menuExport) menuExport.addEventListener("click", () => { exportJSON(); closeMenu(); });
  const menuExportExcel = document.getElementById("menu-export-excel");
  if (menuExportExcel) menuExportExcel.addEventListener("click", () => { exportExcel(); closeMenu(); });
  const menuExportExcelFiltered = document.getElementById("menu-export-excel-filtered");
  if (menuExportExcelFiltered) menuExportExcelFiltered.addEventListener("click", () => { exportExcelFiltered(); closeMenu(); });
  const menuGoPortal = document.getElementById("menu-go-portal");
  if (menuGoPortal) menuGoPortal.addEventListener("click", () => { goToPortalHome(); closeMenu(); });
  const menuAdminCreateUser = document.getElementById("menu-admin-create-user");
  if (menuAdminCreateUser) menuAdminCreateUser.addEventListener("click", () => { openAdminPanel(); closeMenu(); });
  const btnAdminCreateUserTop = document.getElementById("btn-admin-create-user-top");
  if (btnAdminCreateUserTop) btnAdminCreateUserTop.addEventListener("click", () => { openAdminPanel(); });
  const btnGoPortal = document.getElementById("btn-go-portal");
  if (btnGoPortal) btnGoPortal.addEventListener("click", goToPortalHome);

  const btnVolverAdmin = document.getElementById("btn-volver-admin");
  if (btnVolverAdmin) btnVolverAdmin.addEventListener("click", hideAdminPanel);

  const btnAdminCreate = document.getElementById("btn-admin-create");
  if (btnAdminCreate) btnAdminCreate.addEventListener("click", () => { createUserFromAdminPanel(); });
  const fileImportMenu = document.getElementById("file-import-menu");
  if (fileImportMenu) fileImportMenu.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) { importJSONFromFile(file); e.target.value = ""; closeMenu(); }
  });
  const menuLogout = document.getElementById("menu-logout");
  if (menuLogout) menuLogout.addEventListener("click", async () => {
    closeMenu();
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    showLoginScreen();
  });

  const btnFiltersToggle = document.getElementById("btn-filters-toggle");
  const filtersDetail = document.getElementById("filters-detail");
  const filtersToggleIcon = document.querySelector(".filters-toggle-icon");
  if (btnFiltersToggle && filtersDetail) {
    btnFiltersToggle.addEventListener("click", () => {
      const open = filtersDetail.classList.toggle("filters-open");
      btnFiltersToggle.setAttribute("aria-expanded", open);
      if (filtersToggleIcon) filtersToggleIcon.classList.toggle("open", open);
    });
  }

  setupCuadraturaListeners();
}

function setupRealtime() {
  const supabase = getSupabase();
  if (!state.useSupabase || !supabase) return;
  state.realtimeSubscription = supabase
    .channel("movements-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, async () => {
      state.movements = await loadMovementsFromSupabase();
      renderTable();
    })
    .subscribe();
}

function setupOfflineDetection() {
  setOfflineBanner(!navigator.onLine);
  window.addEventListener("offline", () => setOfflineBanner(true));
  window.addEventListener("online", async () => {
    setOfflineBanner(false);
    if (state.useSupabase) {
      state.movements = await loadMovements();
      renderTable();
    }
  });
}

async function init() {
  applySavedTheme();
  try {
    if (state.useSupabase && getSupabase()) {
      await handleOAuthReturn();
      const session = await getSession();
      if (!session) {
        showLoginScreen();
        setupLoginListeners();
        if (window.location.hash && window.location.hash.includes("type=recovery")) {
          showLoginView("new-password");
        } else {
          showLoginView("login");
        }
        return;
      }
      await enterAppAfterAuth();
      return;
    }

    await initAppContent();
  } catch (e) {
    console.error("Error al iniciar la app:", e);
    if (typeof alert !== "undefined") alert("Error al cargar la app. Abre la consola (F12) para más detalles.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
