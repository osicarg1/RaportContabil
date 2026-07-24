/**
 * API minimal pentru istoricul analizelor de balanta.
 * Rute:
 *   GET    /entries?company=NUME_FIRMA   -> lista intrarilor pentru o firma, ordonate cronologic
 *   POST   /entries                      -> creeaza/actualizeaza o intrare (body JSON)
 *   DELETE /entries/:id                  -> sterge o intrare
 *
 * Autorizare: header "Authorization: Bearer <API_TOKEN>".
 * <API_TOKEN> se configureaza ca secret cu:
 *   wrangler secret put API_TOKEN
 *
 * NOTA: acesta e un model de securitate simplu (un singur token, partajat),
 * potrivit pentru un instrument de uz propriu/intern. Nu ofera izolare
 * intre mai multi utilizatori si nu are limitare de rate - pastreaza tokenul privat.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!env.API_TOKEN || token !== env.API_TOKEN) {
      return jsonResponse({ error: "Neautorizat. Verifica tokenul API." }, 401);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/entries" && request.method === "GET") {
        return await handleList(url, env);
      }

      if (url.pathname === "/entries" && request.method === "POST") {
        return await handleCreate(request, env);
      }

      const deleteMatch = url.pathname.match(/^\/entries\/([^/]+)$/);
      if (deleteMatch && request.method === "DELETE") {
        return await handleDelete(deleteMatch[1], env);
      }

      return jsonResponse({ error: "Ruta necunoscuta." }, 404);
    } catch (error) {
      return jsonResponse({ error: `Eroare server: ${error && error.message ? error.message : error}` }, 500);
    }
  }
};

async function handleList(url, env) {
  const company = (url.searchParams.get("company") || "").trim();
  if (!company) {
    return jsonResponse({ error: "Parametrul 'company' este obligatoriu." }, 400);
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM balanta_istoric WHERE company_name = ? ORDER BY generated_at ASC"
  ).bind(company).all();

  return jsonResponse({ entries: results || [] }, 200);
}

async function handleCreate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Corpul cererii trebuie sa fie JSON valid." }, 400);
  }

  const companyName = String(body.company_name || "").trim();
  const reportPeriod = String(body.report_period || "").trim();

  if (!companyName || !reportPeriod) {
    return jsonResponse({ error: "company_name si report_period sunt obligatorii." }, 400);
  }

  const id = String(body.id || crypto.randomUUID());
  const generatedAt = Number(body.generated_at) || Date.now();

  await env.DB.prepare(
    `INSERT INTO balanta_istoric
      (id, company_name, report_period, mode, venituri, cheltuieli, rezultat, marja, lichiditate, grad_indatorare, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       company_name = excluded.company_name,
       report_period = excluded.report_period,
       mode = excluded.mode,
       venituri = excluded.venituri,
       cheltuieli = excluded.cheltuieli,
       rezultat = excluded.rezultat,
       marja = excluded.marja,
       lichiditate = excluded.lichiditate,
       grad_indatorare = excluded.grad_indatorare,
       generated_at = excluded.generated_at`
  ).bind(
    id,
    companyName,
    reportPeriod,
    String(body.mode || ""),
    numOrNull(body.venituri),
    numOrNull(body.cheltuieli),
    numOrNull(body.rezultat),
    numOrNull(body.marja),
    numOrNull(body.lichiditate),
    numOrNull(body.grad_indatorare),
    generatedAt
  ).run();

  return jsonResponse({ id }, 200);
}

async function handleDelete(rawId, env) {
  const id = decodeURIComponent(rawId);
  await env.DB.prepare("DELETE FROM balanta_istoric WHERE id = ?").bind(id).run();
  return jsonResponse({ deleted: true }, 200);
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
