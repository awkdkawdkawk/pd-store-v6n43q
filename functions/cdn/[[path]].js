/**
 * Приватный прокси POLITDYNASTY на Pages Functions.
 * GitHub-репозиторий может быть приватным — наружу отдаём только файлы,
 * GitHub-токен хранится в секрете Pages (GH_TOKEN).
 *
 * GET  /cdn/manifest.json
 * GET  /cdn/mods/<путь>
 * GET  /cdn/releases/download/<тег>/<файл>
 */

const REPO = "awkdkawdkawk/pd-store-v6n43q";
const API = "https://api.github.com";
const BRANCH = "main";

async function proxy(request, env) {
  const url = new URL(request.url);
  const rel = url.pathname.replace(/^\/cdn\//, "");

  if (rel === "health") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }

  const auth = {
    Authorization: "Bearer " + (env.GH_TOKEN || ""),
    "User-Agent": "pd-pages-cdn",
    Accept: "application/vnd.github+json",
  };

  try {
    if (rel === "manifest.json") {
      const r = await fetch("https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/manifest.json", {
        headers: auth,
        cf: { cacheTtl: 60 },
      });
      if (!r.ok) return new Response("manifest unavailable", { status: 502 });
      return new Response(r.body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const relMatch = rel.match(/^releases\/download\/([^/]+)\/(.+)$/);
    if (relMatch) {
      const tag = decodeURIComponent(relMatch[1]);
      const name = decodeURIComponent(relMatch[2]);
      const relInfo = await fetch(API + "/repos/" + REPO + "/releases/tags/" + encodeURIComponent(tag), {
        headers: auth,
        cf: { cacheTtl: 600 },
      });
      if (!relInfo.ok) return new Response("release not found", { status: 404 });
      const data = await relInfo.json();
      const asset = (data.assets || []).find(a => a.name === name);
      if (!asset) return new Response("asset not found", { status: 404 });

      const bin = await fetch(API + "/repos/" + REPO + "/releases/assets/" + asset.id, {
        headers: { Authorization: auth.Authorization, "User-Agent": "pd-pages-cdn", Accept: "application/octet-stream" },
        redirect: "follow",
      });
      if (!bin.ok) return new Response("asset fetch failed", { status: 502 });

      const headers = {
        "Content-Type": bin.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": bin.headers.get("Content-Disposition") || 'attachment; filename="' + asset.name + '"',
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      };
      const len = bin.headers.get("Content-Length");
      if (len) headers["Content-Length"] = len;
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(bin.body, { headers });
    }

    if (rel.startsWith("mods/")) {
      const rest = rel.replace(/^mods\//, "");
      if (!/^[A-Za-z0-9._\-\/]+$/.test(rest)) return new Response("bad path", { status: 400 });
      const r = await fetch("https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/mods/" + rest, {
        headers: auth,
        cf: { cacheTtl: 86400 },
      });
      if (!r.ok) return new Response("mod file not found", { status: r.status });
      return new Response(r.body, {
        headers: {
          "Content-Type": r.headers.get("Content-Type") || "application/octet-stream",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response("not found", { status: 404 });
  } catch (e) {
    return new Response("proxy error", { status: 502 });
  }
}

export async function onRequest({ request, env }) {
  return proxy(request, env);
}
