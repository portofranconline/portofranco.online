/* Porto Franco Online — ligação dos módulos com o Supabase.
   Oferece window.claude.use("db" | "user" | "downloads") com a mesma forma que os
   aplicativos já usavam, guardando tudo na tabela public.app_docs (id, data). */
(function () {
  "use strict";
  var C = window.PFO_SUPABASE || {};
  var BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/shim\.js(\?.*)?$/, "") : location.origin + "/";
  var sb = null;
  function client() {
    if (!sb) {
      if (!window.supabase || !window.supabase.createClient) throw new Error("Biblioteca do Supabase não carregou. Verifique a internet.");
      sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "pfo-auth" } });
    }
    return sb;
  }

  var perfilCache = null;
  async function sessao() {
    var r = await client().auth.getSession();
    return r.data && r.data.session ? r.data.session : null;
  }
  async function perfil() {
    if (perfilCache) return perfilCache;
    var s = await sessao();
    if (!s) return null;
    var r = await client().from("perfis").select("login,papel").eq("user_id", s.user.id).maybeSingle();
    if (r.error || !r.data) return null;
    perfilCache = r.data;
    return perfilCache;
  }

  /* ---------- banco de documentos ---------- */
  var watchers = [];            // {kind:"doc"|"col", key, cb, err, last}
  var timer = null;

  function snapDoc(id, row) {
    var data = row ? row.data : undefined;
    return { id: id.split("/").pop(), exists: !!row, data: function () { return data === undefined ? undefined : JSON.parse(JSON.stringify(data)); } };
  }
  function snapCol(rows) {
    return {
      docs: rows.map(function (r) { var d = r.data; return { id: r.id.split("/").pop(), data: function () { return d; } }; }),
      size: rows.length, empty: rows.length === 0
    };
  }

  async function lerDoc(id) {
    var r = await client().from("app_docs").select("id,data,updated_at").eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  async function lerCol(prefixo) {
    var r = await client().from("app_docs").select("id,data,updated_at").like("id", prefixo + "/%");
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function atualizar(w) {
    try {
      if (w.kind === "doc") {
        var row = await lerDoc(w.key);
        var marca = row ? row.updated_at : "none";
        if (marca !== w.last) { w.last = marca; w.cb(snapDoc(w.key, row)); }
      } else {
        var rows = await lerCol(w.key);
        var marca2 = rows.map(function (r) { return r.id + "@" + r.updated_at; }).sort().join("|");
        if (marca2 !== w.last) { w.last = marca2; w.cb(snapCol(rows)); }
      }
    } catch (e) {
      if (w.last === null && w.err) w.err(e);
    }
  }
  function atualizarTodos(filtroId) {
    watchers.forEach(function (w) {
      if (!filtroId || (w.kind === "doc" && w.key === filtroId) || (w.kind === "col" && filtroId.indexOf(w.key + "/") === 0)) atualizar(w);
    });
  }
  function iniciarTimer() {
    if (timer) return;
    timer = setInterval(function () { if (!document.hidden) atualizarTodos(); }, C.pollMs || 6000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) atualizarTodos(); });
  }
  function observar(kind, key, cb, err) {
    var w = { kind: kind, key: key, cb: cb, err: err, last: null };
    watchers.push(w);
    atualizar(w);
    iniciarTimer();
    return function () { var i = watchers.indexOf(w); if (i >= 0) watchers.splice(i, 1); };
  }

  function docRef(id) {
    return {
      id: id.split("/").pop(), path: id,
      onSnapshot: function (cb, err) { return observar("doc", id, cb, err); },
      get: async function () { return snapDoc(id, await lerDoc(id)); },
      set: async function (data, opts) {
        if (opts && opts.merge) return this.update(data);
        var r = await client().from("app_docs").upsert({ id: id, data: data, updated_at: new Date().toISOString() });
        if (r.error) throw new Error(traduzir(r.error));
        atualizarTodos(id);
      },
      update: async function (patch) {
        /* junta o que mudou com o que já existe (em todos os níveis), sem apagar o resto */
        var atual = await lerDoc(id);
        var novo = juntar(atual && atual.data ? atual.data : {}, patch || {});
        var r = await client().from("app_docs").upsert({ id: id, data: novo, updated_at: new Date().toISOString() });
        if (r.error) throw new Error(traduzir(r.error));
        atualizarTodos(id);
      },
      /* troca só os campos enviados por inteiro (ex.: a lista toda de clientes), mantendo os outros campos */
      substituir: async function (campos) {
        var atual = await lerDoc(id);
        var novo = Object.assign({}, atual && atual.data ? atual.data : {}, campos || {});
        var r = await client().from("app_docs").upsert({ id: id, data: novo, updated_at: new Date().toISOString() });
        if (r.error) throw new Error(traduzir(r.error));
        atualizarTodos(id);
      },
      delete: async function () {
        var r = await client().from("app_docs").delete().eq("id", id);
        if (r.error) throw new Error(traduzir(r.error));
        atualizarTodos(id);
      }
    };
  }
  function ehObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function juntar(base, patch) {
    var out = ehObj(base) ? Object.assign({}, base) : {};
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      out[k] = (ehObj(v) && ehObj(out[k])) ? juntar(out[k], v) : v;
    });
    return out;
  }
  function traduzir(e) {
    var m = (e && (e.message || e.details)) || String(e);
    if (/row-level security|permission denied|42501/i.test(m)) return "seu login não tem permissão para alterar";
    return m;
  }
  var db = {
    doc: docRef,
    collection: function (nome) {
      return {
        onSnapshot: function (cb, err) { return observar("col", nome, cb, err); },
        doc: function (id) { return docRef(nome + "/" + id); },
        get: async function () { return snapCol(await lerCol(nome)); }
      };
    }
  };

  /* ---------- downloads ---------- */
  var downloads = {
    save: async function (o) {
      if (window.PFO_SALVAR) { await window.PFO_SALVAR(o.data, o.filename || "arquivo"); return true; }
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data]);
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = o.filename || "arquivo"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
      return true;
    }
  };

  /* ---------- window.claude ---------- */
  window.claude = window.claude || {};
  window.claude.use = async function (nome) {
    if (nome === "downloads") return downloads;
    if (nome === "db") {
      var p = await perfil();
      if (!p || p.papel !== "admin") return null;
      return db;
    }
    if (nome === "user") {
      var p2 = await perfil();
      return {
        name: p2 ? p2.login : "",
        role: p2 ? p2.papel : "",
        isOwner: function () { return !!p2 && p2.papel === "admin"; }
      };
    }
    return null;
  };

  /* ---------- exigir login nas páginas internas ---------- */
  window.PFO = {
    base: BASE,
    modelo: async function (nome) {
      var r = await lerDoc("modelo/" + nome);
      return { ok: !!(r && r.data && r.data.b), json: async function () { return r.data; } };
    },
    client: client, sessao: sessao, perfil: perfil, db: db, downloads: downloads,
    sair: async function () { perfilCache = null; await client().auth.signOut(); location.href = BASE; }
  };

  if (window.PFO_PROTEGIDA) {
    (async function () {
      var p = null;
      try { p = await perfil(); } catch (e) {}
      if (!p) { location.replace(BASE + "?voltar=" + encodeURIComponent(location.pathname)); return; }
      if (p.papel !== "admin") { location.replace(BASE); return; }
    })();
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.createElement("a");
      b.href = BASE; b.textContent = "☰ Menu";
      b.setAttribute("style", "position:fixed;left:10px;bottom:10px;z-index:99;background:#0b1f3a;color:#fff;padding:9px 14px;border-radius:999px;font:700 13px system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)");
      document.body.appendChild(b);
      // ?baixar=xl : baixa o Excel completo assim que os dados carregarem
      if (new URLSearchParams(location.search).get("baixar") === "xl") {
        var tentativas = 0;
        var t = setInterval(function () {
          tentativas++;
          var bt = document.getElementById("xl"), hk = document.getElementById("hk");
          if (bt && hk && hk.children.length) { clearInterval(t); setTimeout(function () { bt.click(); }, 400); history.replaceState(null, "", location.pathname); }
          else if (tentativas > 60) clearInterval(t);
        }, 500);
      }
    });
  }
})();
