// Configuración Supabase (online multiusuario).
// Pega entre las comillas: 1) Tu Project URL  2) Tu anon public key (Supabase → Settings → API).
window.CAJA_SUPABASE_URL = "https://lpmpczarkjvnwjhwghqg.supabase.co";
window.CAJA_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbXBjemFya2p2bndqaHdnaHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5OTkzMzIsImV4cCI6MjA4NjU3NTMzMn0.wVO0qIhvnk1i64MDBFrlur48QSsqL253g4ImgXAltGQ";
// Menú principal (portal con enlaces a otras apps). Vacío = se ocultan los botones «Volver al menú principal».
// Cuando tengas el portal en un repo/deploy aparte, pon aquí su URL, p. ej. "https://tu-portal.vercel.app/"
window.CAJA_PORTAL_HOME_URL = "";

// API admin: con «vercel dev» las rutas /api son el mismo origen (dejar ""). Con Live Server / archivo local no hay /api: apuntar al deploy.
// Si defines window.CAJA_API_BASE antes de cargar config.js, no se sobrescribe.
(function () {
  if (typeof window === "undefined" || typeof window.CAJA_API_BASE !== "undefined") return;
  var loc = window.location || {};
  var proto = loc.protocol || "";
  var host = loc.hostname || "";
  var port = String(loc.port || "");
  var isFile = proto === "file:";
  var isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]";
  // vercel dev suele usar 3000; mismo origen tiene /api
  var isLikelyVercelDev = isLocalHost && (port === "3000" || port === "3001");
  if (isLikelyVercelDev) {
    window.CAJA_API_BASE = "";
    return;
  }
  var needsRemoteApi = isFile || isLocalHost;
  window.CAJA_API_BASE = needsRemoteApi ? "https://caja-app.vercel.app" : "";
})();
