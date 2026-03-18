const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, obj) {
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
  const role = userData?.user_metadata?.role;
  return role === "super" || role === "full";
}

module.exports = async (req, res) => {
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

    const contentType = req.headers["content-type"] || "";
    const bodyRaw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });

    let body = {};
    if (contentType.includes("application/json") && bodyRaw) {
      try { body = JSON.parse(bodyRaw); } catch {}
    }

    const { userId, module, can_read, can_write } = body || {};
    if (!userId || !module) return json(res, 400, { error: "Faltan userId o module" });

    const nextCanRead = !!can_read;
    const nextCanWrite = !!can_write;

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
        module,
        can_read: nextCanRead,
        can_write: nextCanWrite,
      }),
    });

    return json(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

