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

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];
    if (!accessToken) return json(res, 401, { error: "Falta access token" });

    const ok = await verifySuper(accessToken);
    if (!ok) return json(res, 403, { error: "Solo super puede listar usuarios" });

    // Admin listing. Dependiendo de tu versión, puede venir como { users: [...] } o como array.
    const listResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100&page=1`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    const listData = await listResp.json().catch(() => ({}));
    if (!listResp.ok) {
      return json(res, listResp.status || 400, { error: listData?.message || listData?.error || "Error al listar" });
    }

    const users = listData?.users || listData?.data || listData || [];
    return json(res, 200, { users });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

