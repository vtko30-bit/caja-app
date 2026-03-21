/** Cabeceras CORS para llamar a la API desde otro origen (p. ej. Live Server → Vercel). */
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** Responde al preflight OPTIONS. Devuelve true si ya se respondió. */
function handleCorsPreflight(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors, handleCorsPreflight };
