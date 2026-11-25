/* Porto Franco Online — salvar arquivos (Excel, PDF, recibos, propostas).
   Funciona no Mac/PC (baixa direto) e no iPhone/iPad (abre "Salvar em Arquivos"). */
(function () {
  "use strict";
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var TIPOS = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", html: "text/html", json: "application/json" };

  function comoBlob(data, nome) {
    var ext = String(nome || "").split(".").pop().toLowerCase(), tipo = TIPOS[ext] || "application/octet-stream";
    if (data instanceof Blob) return data.type ? data : new Blob([data], { type: tipo });
    return new Blob([data], { type: tipo });
  }
  function baixarDireto(blob, nome) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = nome || "arquivo"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 15000);
  }
  function botaoSalvar(blob, nome) {
    // o iPhone só deixa salvar depois de um toque: mostra um botão para isso
    var b = document.createElement("button");
    b.textContent = "📥 Salvar " + nome;
    b.setAttribute("style", "position:fixed;left:50%;transform:translateX(-50%);bottom:70px;z-index:999;border:0;border-radius:14px;padding:14px 18px;background:#0b7285;color:#fff;font:800 15px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:92vw");
    b.onclick = function () { b.remove(); compartilhar(blob, nome, true); };
    document.body.appendChild(b);
    setTimeout(function () { if (b.isConnected) b.remove(); }, 60000);
  }
  function compartilhar(blob, nome, jaTocou) {
    var f = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      return navigator.share({ files: [f], title: nome }).catch(function (e) {
        if (e && e.name === "NotAllowedError" && !jaTocou) botaoSalvar(blob, nome);
        else if (!(e && e.name === "AbortError")) baixarDireto(blob, nome);
      });
    }
    baixarDireto(blob, nome);
    return Promise.resolve();
  }
  window.PFO_SALVAR = function (data, nome) {
    var blob = comoBlob(data, nome);
    if (IOS) return compartilhar(blob, nome, false);
    baixarDireto(blob, nome);
    return Promise.resolve(true);
  };

  // páginas públicas (propostas): oferece window.claude.use("downloads")
  if (!(window.claude && window.claude.use)) {
    var dl = { save: function (o) { return window.PFO_SALVAR(o.data, o.filename || "arquivo"); } };
    window.claude = { use: function (n) { return Promise.resolve(n === "downloads" ? dl : null); } };
  }
})();
