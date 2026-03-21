const { applyCors, handleCorsPreflight } = require("../cors");

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
  const role = userData?.user_metadata?.role;
  return role === "super" || role === "full";
}

module.exports = async (req, res) => {
  if (handleCorsPreflight(req, res)) return;
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

    // Permisos por módulo (movements)
    const permsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/user_module_permissions?module=eq.movements&select=user_id,can_read,can_write&per_page=100&page=1`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
      },
    );
    const permsData = await permsResp.json().catch(() => ({}));
    const perms = Array.isArray(permsData) ? permsData : permsData?.data || permsData?.user_module_permissions || [];
    const permsByUserId = {};
    perms.forEach((p) => {
      if (!p?.user_id) return;
      permsByUserId[p.user_id] = p;
    });

    const usersWithPerms = (users || []).map((u) => {
      const userId = u?.id || u?.user_id || "";
      const perm = permsByUserId[userId];
      const canRead = perm?.can_read ?? true;
      const canWrite = perm?.can_write ?? false;
      return { ...u, can_read_movements: canRead, can_write_movements: canWrite };
    });

    return json(res, 200, { users: usersWithPerms });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

