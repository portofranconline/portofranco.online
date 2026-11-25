// Função "instagram" (Supabase Edge Function)
// Busca as métricas da conta @portofranco.online pela API oficial do Instagram
// (Instagram API com Login do Instagram — não precisa de Facebook).
// Devolve: perfil, publicações dos últimos 30 dias (com alcance de cada uma)
// e números da conta nos últimos 30 dias (alcance, visualizações, visitas ao perfil...).
// Só o administrador do sistema pode usar.
//
// Segredo (Edge Functions › Secrets):
//   IG_TOKEN  token de acesso do Instagram (gerado no app da Meta, vale 60 dias).
// A função renova o token sozinha a cada 7 dias e guarda o novo na tabela public.segredos
// (criada pelo sql/03-instagram.sql), então ele não vence enquanto o sistema for usado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const API = "https://graph.instagram.com/v23.0";

async function ig(path: string, token: string) {
  const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}access_token=${token}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "erro do Instagram");
  return j;
}

async function pegarToken(adm: ReturnType<typeof createClient>) {
  const { data } = await adm.from("segredos").select("valor,atualizado").eq("nome", "ig_token").maybeSingle();
  let token = data?.valor || Deno.env.get("IG_TOKEN") || "";
  if (!token) throw new Error("Falta o segredo IG_TOKEN no Supabase.");
  const velho = !data || Date.now() - new Date(data.atualizado).getTime() > 7 * 864e5;
  if (velho) {
    try {
      const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
      const j = await r.json();
      if (j.access_token) token = j.access_token;
      await adm.from("segredos").upsert({ nome: "ig_token", valor: token, atualizado: new Date().toISOString() });
    } catch (_) { /* se não renovar agora, tenta de novo na próxima */ }
  }
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 1. só administrador
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const ok = await sb.rpc("eh_admin");
    if (ok.error || ok.data !== true) return resp({ erro: "Apenas o administrador pode ver a análise." }, 403);

    const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = await pegarToken(adm);

    // 2. perfil
    const perfil = await ig("/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count", token);

    // 3. publicações (as mais recentes) e alcance de cada uma dos últimos 30 dias
    const lim = Date.now() - 30 * 864e5;
    const m = await ig("/me/media?fields=id,timestamp,like_count,comments_count,media_type,media_product_type,permalink,caption,media_url,thumbnail_url&limit=50", token);
    const media = (m.data || []) as Record<string, unknown>[];
    await Promise.all(media.filter((x) => new Date(String(x.timestamp)).getTime() >= lim).map(async (x) => {
      try {
        const ins = await ig(`/${x.id}/insights?metric=reach,views,shares,saved,total_interactions`, token);
        for (const it of ins.data || []) x[it.name] = it.values?.[0]?.value ?? it.total_value?.value ?? null;
      } catch (_) { /* alguns tipos de publicação não têm todas as métricas */ }
    }));

    // 4. números da conta nos últimos 30 dias
    const since = Math.floor(lim / 1000), until = Math.floor(Date.now() / 1000);
    const conta: Record<string, number | null> = {};
    for (const met of ["reach", "views", "profile_views", "accounts_engaged", "total_interactions", "website_clicks"]) {
      try {
        const j = await ig(`/me/insights?metric=${met}&period=day&metric_type=total_value&since=${since}&until=${until}`, token);
        conta[met] = j.data?.[0]?.total_value?.value ?? null;
      } catch (_) { conta[met] = null; }
    }
    // alcance dia a dia (para o gráfico)
    let alcanceDia: { d: string; v: number }[] = [];
    try {
      const j = await ig(`/me/insights?metric=reach&period=day&since=${since}&until=${until}`, token);
      alcanceDia = (j.data?.[0]?.values || []).map((v: { end_time: string; value: number }) => ({ d: v.end_time.slice(0, 10), v: v.value }));
    } catch (_) { /* opcional */ }

    return resp({ perfil: { ...perfil, media }, conta, alcanceDia, em: new Date().toISOString() });
  } catch (e) {
    const m = String((e as Error).message || e);
    if (/expired|session|Invalid OAuth|token/i.test(m)) return resp({ erro: "O token do Instagram venceu ou é inválido. Gere um novo e atualize IG_TOKEN." }, 401);
    return resp({ erro: m }, 500);
  }
});
