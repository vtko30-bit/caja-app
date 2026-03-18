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
    if (!ok) return json(res, 403, { error: "Solo super puede modificar roles" });

    const contentType = req.headers["content-type"] || "";
    const bodyRaw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    let body = {};
    try {
      if (contentType.includes("application/json") && bodyRaw) body = JSON.parse(bodyRaw);
    } catch {}

    const { userId, role } = body || {};
    if (!userId || !role) return json(res, 400, { error: "Faltan userId o role" });
    const allowedRoles = ["super", "admin", "user"];
    const nextRole = allowedRoles.includes(role) ? role : "user";

    const patchResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
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
      return json(res, patchResp.status || 400, { error: patchData?.message || patchData?.error || "No se pudo actualizar" });
    }

    return json(res, 200, { ok: true, user: patchData?.user || patchData });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

