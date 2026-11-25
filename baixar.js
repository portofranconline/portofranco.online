/* Downloads nas páginas públicas (propostas): baixa o arquivo direto no navegador. */
(function(){
  if (window.claude && window.claude.use) return;
  var dl = { save: function (o) {
    var d = o.data, b = d instanceof Blob ? d : new Blob([d]);
    var u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = o.filename || "arquivo"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); return Promise.resolve(true);
  } };
  window.claude = { use: function (n) { return Promise.resolve(n === "downloads" ? dl : null); } };
})();
