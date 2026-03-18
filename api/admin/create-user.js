const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, obj) {
  return res.status(status).json(obj);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) return {};

  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: "Faltan variables de entorno en Vercel." });
    }

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];
    if (!accessToken) return json(res, 401, { error: "Falta access token" });

    const body = await readJsonBody(req);
    const { email, password, role } = body || {};
    if (!email || !password) return json(res, 400, { error: "Faltan email o password" });

    const allowedRoles = ["super", "admin", "user"];
    const nextRole = allowedRoles.includes(role) ? role : "user";

    // 1) Verificar rol actual usando el access token del usuario logueado
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    const userData = await userResp.json().catch(() => ({}));
    const currentRole = userData?.user_metadata?.role;
    if (currentRole !== "super" && currentRole !== "full") {
      return json(res, 403, { error: "Solo super puede crear usuarios" });
    }

    // 2) Crear usuario usando el service role (server-side)
    const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: nextRole },
      }),
    });

    const createData = await createResp.json().catch(() => ({}));
    if (!createResp.ok) {
      return json(res, createResp.status || 400, {
        error: createData?.message || createData?.error || "No se pudo crear el usuario",
      });
    }

    const createdUser = createData?.user || createData;
    const userId = createdUser?.id || createdUser?.user_id || createdUser?.user?.id || "";
    const canRead = true;
    const canWrite = nextRole === "super" ? true : false;

    if (userId) {
      // Inicializar permisos para el módulo movements
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_module_permissions?on_conflict=user_id,module`,
        {
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
        },
      ).catch(() => {});
    }

    return json(res, 201, { ok: true, user: createdUser });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Error interno" });
  }
};

