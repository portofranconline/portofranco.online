// Função "instagram" (Supabase Edge Function)
// Busca os dados públicos de um perfil Profissional do Instagram pela API oficial da Meta
// (Business Discovery) e devolve para a tela "Análise de Instagram".
// Só o administrador do sistema pode usar.
//
// Segredos (Edge Functions › Secrets):
//   IG_USER_ID  ID da conta Profissional do @portofranco.online (Instagram Business Account ID)
//   IG_TOKEN    token de acesso de longa duração da Meta
// SUPABASE_URL e SUPABASE_ANON_KEY já vêm prontos no Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 1. só administrador
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const adm = await sb.rpc("eh_admin");
    if (adm.error || adm.data !== true) return resp({ erro: "Apenas o administrador pode analisar perfis." }, 403);

    // 2. usuário do Instagram
    const { username } = await req.json().catch(() => ({}));
    const u = String(username ?? "").trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(u)) return resp({ erro: "Link ou usuário do Instagram inválido." }, 400);

    const IG_USER_ID = Deno.env.get("IG_USER_ID"), IG_TOKEN = Deno.env.get("IG_TOKEN");
    if (!IG_USER_ID || !IG_TOKEN) return resp({ erro: "Faltam os segredos IG_USER_ID e IG_TOKEN no Supabase." }, 500);

    // 3. Business Discovery (API oficial)
    const campos =
      `business_discovery.username(${u}){username,name,biography,profile_picture_url,followers_count,follows_count,media_count,` +
      `media.limit(60){id,timestamp,like_count,comments_count,media_type,permalink,caption,media_url,thumbnail_url}}`;
    const url = `https://graph.facebook.com/v21.0/${IG_USER_ID}?fields=${encodeURIComponent(campos)}&access_token=${IG_TOKEN}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) {
      const m = String(j.error.message || "");
      if (/cannot be found|does not exist|business/i.test(m))
        return resp({ erro: "Perfil não encontrado ou não é Profissional (Criador/Empresa). A API só analisa perfis Profissionais." }, 404);
      if (/expired|session|token/i.test(m)) return resp({ erro: "O token da Meta venceu. Gere um novo e atualize IG_TOKEN." }, 401);
      return resp({ erro: "Instagram: " + m }, 502);
    }
    const bd = j.business_discovery;
    const perfil = { ...bd, media: (bd.media && bd.media.data) || [] };
    return resp({ perfil });
  } catch (e) {
    return resp({ erro: String((e as Error).message || e) }, 500);
  }
});
