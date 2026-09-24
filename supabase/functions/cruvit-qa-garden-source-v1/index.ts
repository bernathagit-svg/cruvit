import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = new Set([
  "https://friendly-taiyaki-64aacb.netlify.app",
  "https://main--friendly-taiyaki-64aacb.netlify.app"
]);

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://friendly-taiyaki-64aacb.netlify.app";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex, nofollow",
    "vary": "Origin"
  };
}

function reply(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "content-type": "application/json; charset=utf-8" }
  });
}

function bearer(req: Request) {
  const raw = String(req.headers.get("authorization") || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  let key = "";
  const secretJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretJson) {
    try { key = JSON.parse(secretJson)?.default || ""; } catch {}
  }
  if (!key) key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SUPABASE_ADMIN_CONFIG_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "GET") return reply(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const token = bearer(req);
  if (!token || token.length < 32) return reply(401, { ok: false, code: "QA_CAPABILITY_REQUIRED" }, origin);

  const url = new URL(req.url);
  const runId = String(url.searchParams.get("runId") || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,159}$/.test(runId)) {
    return reply(400, { ok: false, code: "RUN_ID_REQUIRED" }, origin);
  }

  const admin = adminClient();
  const tokenHash = await sha256Hex(token);

  const { data: cap, error: capErr } = await admin
    .from("qa_runtime_capabilities")
    .select("token_sha256,run_id,purpose,design_id,source_media_id,expires_at,max_reads,read_count,active")
    .eq("token_sha256", tokenHash)
    .maybeSingle();

  if (capErr) return reply(500, { ok: false, code: "CAPABILITY_LOOKUP_FAILED" }, origin);
  if (!cap || cap.active !== true || cap.run_id !== runId || cap.purpose !== "garden-design-source-photo") {
    return reply(403, { ok: false, code: "QA_CAPABILITY_INVALID" }, origin);
  }
  if (new Date(cap.expires_at).getTime() <= Date.now()) {
    return reply(403, { ok: false, code: "QA_CAPABILITY_EXPIRED" }, origin);
  }
  if (Number(cap.read_count) >= Number(cap.max_reads)) {
    return reply(429, { ok: false, code: "QA_CAPABILITY_READ_LIMIT" }, origin);
  }

  const { data: design, error: designErr } = await admin
    .from("garden_designs")
    .select("id,source_media_id,status")
    .eq("id", cap.design_id)
    .maybeSingle();

  if (designErr || !design || String(design.source_media_id || "") !== String(cap.source_media_id)) {
    return reply(409, { ok: false, code: "QA_SOURCE_DESIGN_MISMATCH" }, origin);
  }

  const { data: media, error: mediaErr } = await admin
    .from("garden_media")
    .select("id,storage_bucket,storage_path,mime_type,byte_size,validation_state,purpose")
    .eq("id", cap.source_media_id)
    .maybeSingle();

  if (
    mediaErr || !media ||
    media.validation_state !== "validated" ||
    media.purpose !== "design_source" ||
    media.storage_bucket !== "user-garden-media"
  ) {
    return reply(409, { ok: false, code: "QA_SOURCE_MEDIA_INVALID" }, origin);
  }

  const { data: blob, error: downloadErr } = await admin.storage
    .from(media.storage_bucket)
    .download(media.storage_path);

  if (downloadErr || !blob) {
    return reply(502, { ok: false, code: "QA_SOURCE_DOWNLOAD_FAILED" }, origin);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length || (Number(media.byte_size) > 0 && bytes.length !== Number(media.byte_size))) {
    return reply(409, { ok: false, code: "QA_SOURCE_BYTES_MISMATCH" }, origin);
  }

  const { error: countErr } = await admin
    .from("qa_runtime_capabilities")
    .update({ read_count: Number(cap.read_count) + 1 })
    .eq("token_sha256", tokenHash)
    .eq("read_count", Number(cap.read_count));

  if (countErr) return reply(409, { ok: false, code: "QA_CAPABILITY_COUNT_UPDATE_FAILED" }, origin);

  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors(origin),
      "content-type": media.mime_type || "image/jpeg",
      "content-length": String(bytes.length),
      "x-content-type-options": "nosniff",
      "x-cruvit-qa-run": runId,
      "x-cruvit-qa-source": "validated-design-source"
    }
  });
});