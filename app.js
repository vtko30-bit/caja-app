// Caja - Movimientos (local y/o online con Supabase)
const STORAGE_KEY = "caja_movimientos_v1";

const supabaseUrl = (typeof window !== "undefined" && window.CAJA_SUPABASE_URL) || "";
const supabaseAnonKey = (typeof window !== "undefined" && window.CAJA_SUPABASE_ANON_KEY) || "";
const useSupabase = !!(supabaseUrl && supabaseAnonKey);
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

let state = {
  movements: [],
  editingId: null,
  useSupabase,
  deletedMovements: [],
  realtimeSubscription: null,
};

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
  };
}

async function loadMovementsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("movements")
    .select("id, date, local, concept, type, amount, notes")
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
    minimumFractionDigits: 2,
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

function recalcSummary() {
  const ingresos = state.movements
    .filter((m) => m.type === "ingreso")
    .reduce((acc, m) => acc + (m.amount || 0), 0);
  const egresos = state.movements
    .filter((m) => m.type === "egreso")
    .reduce((acc, m) => acc + (m.amount || 0), 0);
  const saldo = ingresos - egresos;
  const si = document.getElementById("sum-ingresos");
  const se = document.getElementById("sum-egresos");
  const ss = document.getElementById("sum-saldo");
  if (si) si.textContent = formatCurrency(ingresos);
  if (se) se.textContent = formatCurrency(egresos);
  if (ss) ss.textContent = formatCurrency(saldo);
}

function updateLocalDatalist() {
  const datalist = document.getElementById("local-datalist");
  if (!datalist) return;
  const locales = [...new Set(state.movements.map((m) => (m.local || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  datalist.innerHTML = "";
  locales.forEach((nombre) => {
    const opt = document.createElement("option");
    opt.value = nombre;
    datalist.appendChild(opt);
  });
}

function updateConceptDatalist() {
  const datalist = document.getElementById("concept-datalist");
  if (!datalist) return;
  const conceptos = [...new Set(state.movements.map((m) => (m.concept || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  datalist.innerHTML = "";
  conceptos.forEach((nombre) => {
    const opt = document.createElement("option");
    opt.value = nombre;
    datalist.appendChild(opt);
  });
}

function applyFilters(movements) {
  const text = (document.getElementById("filter-text")?.value || "").trim().toLowerCase();
  const type = document.getElementById("filter-type")?.value || "todos";
  const desde = (document.getElementById("filter-date-desde")?.value || "").trim();
  const hasta = (document.getElementById("filter-date-hasta")?.value || "").trim();
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
    if ((a.date || "") !== (b.date || "")) return (a.date || "").localeCompare(b.date || "");
    return String(a.id).localeCompare(String(b.id));
  });
  sorted.forEach((m) => {
    const tr = document.createElement("tr");
    tr.appendChild(createCell(m.date || ""));
    tr.appendChild(createCell(m.local || ""));
    tr.appendChild(createCell(m.concept || ""));
    const tdType = document.createElement("td");
    const spanType = document.createElement("span");
    spanType.className = `cell-type ${m.type}`;
    spanType.textContent = m.type === "ingreso" ? "Ingreso" : "Egreso";
    tdType.appendChild(spanType);
    tr.appendChild(tdType);
    const tdAmount = document.createElement("td");
    tdAmount.className = "cell-amount";
    tdAmount.textContent = formatCurrency(m.amount);
    tr.appendChild(tdAmount);
    tr.appendChild(createCell(m.notes || ""));
    const tdActions = document.createElement("td");
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
}

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function resetForm() {
  const form = document.getElementById("movement-form");
  if (form) {
    form.reset();
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar";
  }
  state.editingId = null;
}

function startEdit(id) {
  const movement = state.movements.find((m) => m.id === id);
  if (!movement) return;
  const form = document.getElementById("movement-form");
  if (!form) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("date", movement.date);
  set("local", movement.local);
  set("concept", movement.concept);
  set("type", movement.type || "ingreso");
  set("amount", movement.amount);
  set("notes", movement.notes);
  state.editingId = id;
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Actualizar";
}

function deleteMovement(id) {
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
  const date = (form.date?.value || "").trim();
  const concept = (form.concept?.value || "").trim();
  const type = form.type?.value || "ingreso";
  const amountRaw = String(form.amount?.value || "0").trim().replace(",", ".");
  const amount = parseFloat(amountRaw) || 0;
  const local = (form.local?.value || "").trim();
  const notes = (form.notes?.value || "").trim();
  if (!date || !concept || !type || !amount) {
    alert("Completa fecha, concepto, tipo y monto.");
    return;
  }
  const payload = { date, local, concept, type, amount, notes };

  const supabase = getSupabase();
  if (state.useSupabase && supabase && navigator.onLine) {
    if (state.editingId) {
      const { error } = await supabase.from("movements").update(payload).eq("id", state.editingId);
      if (error) {
        showToast("Error al actualizar: " + (error.message || "revisa la conexión."));
        return;
      }
      showToast("Movimiento actualizado.");
    } else {
      const { data, error } = await supabase.from("movements").insert(payload).select("id").single();
      if (error) {
        showToast("Error al guardar: " + (error.message || "revisa la conexión."));
        return;
      }
      showToast("Movimiento agregado.");
    }
    state.movements = await loadMovementsFromSupabase();
    renderTable();
    resetForm();
    return;
  }

  if (state.editingId) {
    state.movements = state.movements.map((m) =>
      m.id === state.editingId ? { ...m, ...payload } : m
    );
    showToast("Movimiento actualizado.");
  } else {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.movements.push({ id, ...payload });
    showToast("Movimiento agregado.");
  }
  saveMovementsLocal(state.movements);
  renderTable();
  resetForm();
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
    .select("id, date, local, concept, type, amount, notes, deleted_at")
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
  if (main) main.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
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
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.style.display = "";
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

function getLoginEmailPassword() {
  const form = document.getElementById("login-form");
  if (!form) return { email: "", password: "" };
  const email = (form.email?.value || "").trim();
  const password = form.password?.value || "";
  return { email, password };
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
  showAppContent();
  const btnEntrar = document.getElementById("btn-login-entrar");
  const btnCrear = document.getElementById("btn-login-crear");
  if (btnEntrar) btnEntrar.disabled = true;
  if (btnCrear) btnCrear.disabled = true;
  await initAppContent();
  if (btnEntrar) btnEntrar.disabled = false;
  if (btnCrear) btnCrear.disabled = false;
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.style.display = "";
}

async function doSignUp() {
  const { email, password } = getLoginEmailPassword();
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
  const { data, error } = await supabase.auth.signUp({ email, password });
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
  const btnEntrar = document.getElementById("btn-login-entrar");
  const btnCrear = document.getElementById("btn-login-crear");
  if (btnEntrar) btnEntrar.disabled = true;
  if (btnCrear) btnCrear.disabled = true;
  await initAppContent();
  if (btnEntrar) btnEntrar.disabled = false;
  if (btnCrear) btnCrear.disabled = false;
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.style.display = "";
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
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin();
  });

  if (btnEntrar) btnEntrar.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
  if (btnCrear) btnCrear.addEventListener("click", (e) => { e.preventDefault(); doSignUp(); });

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
  const redirectTo = window.location.origin + window.location.pathname + window.location.search;
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
  await initAppContent();
  if (btnGuardar) btnGuardar.disabled = false;
  document.getElementById("btn-logout")?.style.setProperty("display", "");
}

async function initAppContent() {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  const btnVerEliminados = document.getElementById("btn-ver-eliminados");
  if (btnVerEliminados) btnVerEliminados.style.display = state.useSupabase ? "" : "none";
  setupEventListeners();
  setupOfflineDetection();
  state.movements = await loadMovements();
  renderTable();
  setupRealtime();
}

function setupEventListeners() {
  const form = document.getElementById("movement-form");
  if (form) form.addEventListener("submit", handleSubmit);

  const btnClear = document.getElementById("btn-clear-form");
  if (btnClear) btnClear.addEventListener("click", (e) => { e.preventDefault(); resetForm(); });

  const dateInput = document.getElementById("date");
  const btnCalendar = document.getElementById("btn-open-calendar");
  if (btnCalendar) btnCalendar.addEventListener("click", () => {
    if (dateInput && typeof dateInput.showPicker === "function") dateInput.showPicker();
    else if (dateInput) { dateInput.focus(); dateInput.click(); }
  });

  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", exportJSON);

  const fileImport = document.getElementById("file-import");
  if (fileImport) fileImport.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) { importJSONFromFile(file); e.target.value = ""; }
  });

  ["filter-text", "filter-type", "filter-date-desde", "filter-date-hasta"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === "filter-text" ? "input" : "change", renderTable);
  });
  const btnClearDate = document.getElementById("btn-clear-date-filter");
  if (btnClearDate) btnClearDate.addEventListener("click", () => {
    const desde = document.getElementById("filter-date-desde");
    const hasta = document.getElementById("filter-date-hasta");
    if (desde) desde.value = "";
    if (hasta) hasta.value = "";
    renderTable();
  });

  const btnVerEliminados = document.getElementById("btn-ver-eliminados");
  if (btnVerEliminados) btnVerEliminados.addEventListener("click", openDeletedPanel);
  const btnVolver = document.getElementById("btn-volver-movimientos");
  if (btnVolver) btnVolver.addEventListener("click", hideDeletedPanel);

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    showLoginScreen();
  });
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
  try {
    if (state.useSupabase && getSupabase()) {
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
      showAppContent();
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
