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
    if (!ok) return json(res, 403, { error: "Solo super puede modificar permisos" });

    const body = await readJsonBody(req);
    const { userId, module, can_read, can_write } = body || {};
    if (!userId || !module) return json(res, 400, { error: "Faltan userId o module" });

    const uid = String(userId).trim();
    const mod = String(module).trim();
    const nextCanRead = !!can_read;
    const nextCanWrite = !!can_write;

    const headers = {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    };

    // 1) Actualizar fila existente (PostgREST upsert con on_conflict a veces falla según versión)
    const patchUrl = `${SUPABASE_URL}/rest/v1/user_module_permissions?user_id=eq.${encodeURIComponent(uid)}&module=eq.${encodeURIComponent(mod)}`;
    const patchResp = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ can_read: nextCanRead, can_write: nextCanWrite }),
    });

    let updatedRows = [];
    if (patchResp.ok) {
      const pt = await patchResp.text();
      try {
        updatedRows = pt ? JSON.parse(pt) : [];
      } catch {
        updatedRows = [];
      }
      if (!Array.isArray(updatedRows)) updatedRows = updatedRows ? [updatedRows] : [];
      if (updatedRows.length > 0) {
        return json(res, 200, { ok: true });
      }
    } else {
      const errData = await patchResp.json().catch(() => ({}));
      return json(res, patchResp.status || 400, {
        error: errData?.message || errData?.error || errData?.details || "Error al actualizar permisos",
      });
    }

    // 2) No había fila: insertar
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/user_module_permissions`, {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: uid,
        module: mod,
        can_read: nextCanRead,
        can_write: nextCanWrite,
      }),
    });

    if (!insertResp.ok) {
      const errData = await insertResp.json().catch(() => ({}));
      const errMsg = errData?.message || errData?.error || errData?.hint || "Error al guardar permisos";
      return json(res, insertResp.status || 400, { error: errMsg });
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

