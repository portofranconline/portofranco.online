/* Porto Franco Online — exportação do Excel no formato ORIGINAL.
   Usa a planilha original (guardada criptografada em modelos/*.bin; a chave fica no banco,
   só o administrador lê) e grava por cima os clientes, pagamentos e despesas do sistema.
   O formato da planilha só muda quando o modelo for trocado. */
(function () {
  "use strict";
  var BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/excel\.js(\?.*)?$/, "") : "";
  var CFG = {
    painel: { doc: "painel/main", bin: "modelos/painel.bin", nome: "CONTROLE PAINEL.xlsx", cli: "CLIENTES PAINEL", ctl: "CONTROLE PAINEL ", max: 100 },
    online: { doc: "online/main", bin: "modelos/online.bin", nome: "PORTO FRANCO ONLINE - PUBLICIDADE.xlsx", cli: "CLIENTES ONLINE", ctl: "CONTROLE ONLINE ", max: 200 }
  };
  var MES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  var td = new TextDecoder(), te = new TextEncoder();

  function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  var T = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function pipe(u, C) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new C("deflate-raw"))).arrayBuffer()); }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var isN = function (v) { return typeof v === "number" && isFinite(v); };
  var ser = function (d) { if (!d) return ""; var p = String(d).split("-").map(Number); if (p.length < 3 || !p[0]) return ""; return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 864e5); };
  var colN = function (L) { var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + L.charCodeAt(i) - 64; return n; };

  async function modelo(mod) {
    var db = await window.claude.use("db");
    if (!db) throw new Error("Entre como administrador para exportar.");
    var k = await db.doc("config/excel").get();
    if (!k.exists || !k.data().k) throw new Error("Falta a chave do Excel no banco (rode o sql/03-chave-excel.sql no Supabase).");
    var r = await fetch(BASE + CFG[mod].bin, { cache: "no-store" });
    if (!r.ok) throw new Error("Modelo da planilha não encontrado.");
    var all = new Uint8Array(await r.arrayBuffer());
    var key = await crypto.subtle.importKey("raw", b64(k.data().k), "AES-GCM", false, ["decrypt"]);
    var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, key, all.subarray(12));
    return { zip: new Uint8Array(plain), db: db };
  }

  function lerZip(buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), e = buf.length - 22;
    while (dv.getUint32(e, true) !== 0x06054b50) e--;
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), ents = [];
    for (var i = 0; i < n; i++) {
      var m = dv.getUint16(p + 10, true), c = dv.getUint32(p + 16, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true),
        nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cm = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true),
        name = td.decode(buf.subarray(p + 46, p + 46 + nl)), ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      ents.push({ name: name, m: m, crc: c, cs: cs, us: us, data: buf.subarray(ds, ds + cs) });
      p += 46 + nl + el + cm;
    }
    return ents;
  }
  async function texto(en) { return td.decode(en.m === 8 ? await pipe(en.data, DecompressionStream) : en.data); }
  async function gravar(en, txt) { var u = te.encode(txt); en.crc = crc(u); en.us = u.length; en.data = await pipe(u, CompressionStream); en.cs = en.data.length; en.m = 8; }
  function montarZip(ents) {
    var parts = [], cd = [], off = 0;
    var u16 = function (v) { return [v & 255, v >> 8 & 255]; }, u32 = function (v) { return [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255]; };
    ents.forEach(function (en) {
      var nb = te.encode(en.name);
      var h = new Uint8Array([80, 75, 3, 4, 20, 0, 0, 8].concat(u16(en.m), [0, 0, 33, 0], u32(en.crc), u32(en.cs), u32(en.us), u16(nb.length), [0, 0]));
      parts.push(h, nb, en.data);
      cd.push(new Uint8Array([80, 75, 1, 2, 20, 0, 20, 0, 0, 8].concat(u16(en.m), [0, 0, 33, 0], u32(en.crc), u32(en.cs), u32(en.us), u16(nb.length), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], u32(off))), nb);
      off += h.length + nb.length + en.data.length;
    });
    var csz = cd.reduce(function (s, x) { return s + x.length; }, 0);
    return new Blob(parts.concat(cd, [new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0].concat(u16(ents.length), u16(ents.length), u32(csz), u32(off), [0, 0]))]),
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* grava valores nas células, mantendo o estilo; cria a célula/linha se não existir */
  function celula(ref, s, v) {
    var a = '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : "");
    if (v === "" || v == null) return a + "/>";
    if (isN(v)) return a + "><v>" + v + "</v></c>";
    return a + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
  }
  function patch(xml, cells) {
    var linhas = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
    var estilo = {};   // estilo por coluna, pego da primeira linha que tiver a célula
    var reCel = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, m;
    var sd0 = xml.indexOf("<sheetData"), sd1 = xml.indexOf("</sheetData>");
    var corpo = xml.slice(sd0, sd1);
    while ((m = reCel.exec(corpo))) { var s = /\bs="(\d+)"/.exec(m[2]); if (s && !(m[1] in estilo)) estilo[m[1]] = s[1]; }
    linhas.forEach(function (n) {
      var cs = cells[n], cols = Object.keys(cs);
      var reRow = new RegExp('<row r="' + n + '"[^>]*?(?:/>|>[\\s\\S]*?</row>)');
      var rm = reRow.exec(corpo);
      var row;
      if (!rm) {
        row = '<row r="' + n + '"></row>';
        // insere na posição certa
        var reAll = /<row r="(\d+)"/g, pos = -1, mm;
        while ((mm = reAll.exec(corpo))) { if (+mm[1] > n) { pos = mm.index; break; } }
        corpo = pos < 0 ? corpo + row : corpo.slice(0, pos) + row + corpo.slice(pos);
        rm = reRow.exec(corpo);
      }
      row = rm[0];
      if (/\/>$/.test(row) && row.indexOf("</row>") < 0) row = row.replace(/\/>$/, "></row>");
      cols.forEach(function (L) {
        var ref = L + n, v = cs[L];
        var reC = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
        var cm = reC.exec(row);
        if (cm) { var s2 = (/\bs="(\d+)"/.exec(cm[1]) || [])[1]; var nc = celula(ref, s2, v); row = row.replace(cm[0], function () { return nc; }); return; }
        if (v === "" || v == null) return;
        var nova = celula(ref, estilo[L], v), re2 = /<c r="([A-Z]+)\d+"/g, x, ins = -1;
        while ((x = re2.exec(row))) { if (colN(x[1]) > colN(L)) { ins = x.index; break; } }
        if (ins < 0) ins = row.lastIndexOf("</row>");
        row = row.slice(0, ins) + nova + row.slice(ins);
      });
      row = row.replace(/\sspans="[^"]*"/, "");
      corpo = corpo.replace(rm[0], function () { return row; });
    });
    return xml.slice(0, sd0) + corpo + xml.slice(sd1);
  }

  async function gerar(mod, d) {
    var cfg = CFG[mod], M = await modelo(mod);
    if (!d) { var s = await M.db.doc(cfg.doc).get(); d = s.exists ? s.data() : {}; }
    var ents = lerZip(M.zip), get = function (n) { return ents.find(function (e) { return e.name === n; }); };
    // nome da aba -> arquivo
    var wb = await texto(get("xl/workbook.xml")), rels = await texto(get("xl/_rels/workbook.xml.rels")), abas = {};
    (wb.match(/<sheet [^>]*>/g) || []).forEach(function (t) {
      var nome = (/name="([^"]+)"/.exec(t) || [])[1], rid = (/r:id="([^"]+)"/.exec(t) || [])[1];
      var alvo = (new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels) || [])[1];
      if (nome && alvo) abas[nome.replace(/&amp;/g, "&")] = "xl/" + alvo.replace(/^\/?xl\//, "");
    });
    var aplicar = async function (aba, cells) { var en = get(abas[aba]); if (!en) return; await gravar(en, patch(await texto(en), cells)); };
    var C = Object.keys(d.clientes || {}).map(function (id) { return Object.assign({ id: id }, d.clientes[id]); })
      .filter(function (c) { return +c.id >= 1 && +c.id <= cfg.max; });
    var pay = function (c, y) { var a = (c.p && c.p[y]) || []; return Array.from({ length: 12 }, function (_, i) { return a[i] == null ? "" : a[i]; }); };

    // clientes
    var cc = {};
    C.forEach(function (c) {
      cc[6 + (+c.id)] = mod === "painel"
        ? { A: +c.id, B: c.nome || "", C: c.cob || "", D: c.resp || "", E: c.tel || "", F: c.ig || "", I: ser(c.ini), N: c.status || "", P: c.obs || "" }
        : { A: +c.id, B: c.nome || "", D: c.resp || "", E: c.tel || "", F: c.ig || "", G: c.plano || "", H: isN(c.valor) ? c.valor : "", I: ser(c.ini), J: c.dia || "", M: c.status || "", O: c.obs || "" };
    });
    await aplicar(cfg.cli, cc);
    // pagamentos por ano (só as abas que existem na planilha)
    for (var aba in abas) {
      if (aba.indexOf(cfg.ctl) !== 0) continue;
      var y = aba.slice(cfg.ctl.length).trim(), k = {};
      C.forEach(function (c) {
        var o = { A: +c.id }, a = pay(c, y);
        "GHIJKLMNOPQR".split("").forEach(function (L, i) { o[L] = a[i]; });
        if (mod === "painel" && y === String(new Date().getFullYear())) { o.C = c.plano || ""; o.D = c.dia || ""; o.E = isN(c.valor) ? c.valor : ""; }
        k[19 + (+c.id)] = o;
      });
      await aplicar(aba, k);
    }
    // despesas
    var D = (d.despesas || []).slice().sort(function (a, b) { return a.ano - b.ano || a.mes - b.mes; }), dc = {};
    for (var i = 0; i < 1000; i++) {
      var x = D[i];
      dc[7 + i] = x ? { A: ser(x.ent), B: x.ano, C: MES[x.mes - 1] || "", D: x.desc || "", E: x.cat || "", G: isN(x.valor) ? x.valor : "", L: ser(x.pago) }
        : { A: "", B: "", C: "", D: "", E: "", G: "", I: "", L: "" };
    }
    await aplicar("DESPESAS", dc);
    // o Excel recalcula tudo ao abrir; remove a cadeia de cálculo antiga (evita aviso de "arquivo com problema")
    var wbEn = get("xl/workbook.xml");
    await gravar(wbEn, wb.replace(/<calcPr([^>]*?)\/>/, function (t, a) { return "<calcPr" + a.replace(/\s(fullCalcOnLoad|calcCompleted)="[^"]*"/g, "") + ' fullCalcOnLoad="1"/>'; }));
    ents = ents.filter(function (e) { return e.name !== "xl/calcChain.xml"; });
    var relEn = get("xl/_rels/workbook.xml.rels");
    await gravar(relEn, rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, ""));
    var ctEn = get("[Content_Types].xml");
    await gravar(ctEn, (await texto(ctEn)).replace(/<Override [^>]*calcChain[^>]*\/>/, ""));
    return montarZip(ents);
  }

  async function baixar(mod, btn) {
    var t0 = btn && btn.textContent;
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Gerando planilha…"; }
      var blob = await gerar(mod);
      await window.PFO_SALVAR(blob, CFG[mod].nome);
      return true;
    } catch (e) { alert("Não foi possível gerar o Excel: " + ((e && e.message) || e)); return false; }
    finally { if (btn) { btn.disabled = false; btn.textContent = t0; } }
  }
  window.PFOX = { gerar: gerar, baixar: baixar, CFG: CFG };
})();
