const { applyCors, handleCorsPreflight } = require("../cors");
const { readJsonBody } = require("../read-json-body");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, obj) {
  applyCors(res);
  return res.status(status).json(obj);
}

async function verifySuper(accessToken) {
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  const userData = await userResp.json().catch(() => ({}));
  const role =
    userData?.user_metadata?.role ??
    userData?.app_metadata?.role ??
    null;
  if (role === "super" || role === "full") return true;
  const s = String(role || "").trim().toLowerCase();
  return s === "super" || s === "full";
}

module.exports = async (req, res) => {
  if (handleCorsPreflight(req, res)) return;
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: "Faltan variables de entorno en Vercel." });
    }
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];
    if (!accessToken) return json(res, 401, { error: "Falta access token" });

    const ok = await verifySuper(accessToken);
    if (!ok) return json(res, 403, { error: "Solo super puede modificar roles" });

    const body = await readJsonBody(req);
    const { userId, role } = body || {};
    if (!userId || !role) return json(res, 400, { error: "Faltan userId o role" });
    const allowedRoles = ["super", "admin", "user"];
    const nextRole = allowedRoles.includes(role) ? role : "user";

    const patchResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_metadata: { role: nextRole },
      }),
    });

    const patchData = await patchResp.json().catch(() => ({}));
    if (!patchResp.ok) {
      const errMsg = patchData?.msg || patchData?.message || patchData?.error || "No se pudo actualizar";
      return json(res, patchResp.status || 400, { error: errMsg });
    }

    // Asegurar que exista la fila de permisos del módulo actual.
    const canRead = true;
    const canWrite = nextRole === "super" ? true : false;
    await fetch(`${SUPABASE_URL}/rest/v1/user_module_permissions?on_conflict=user_id,module`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        module: "movements",
        can_read: canRead,
        can_write: canWrite,
      }),
    }).catch(() => {});

    return json(res, 200, { ok: true, user: patchData?.user || patchData });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

