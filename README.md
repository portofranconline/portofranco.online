# Sistema Porto Franco Online

Site com login: **https://portofranconline.github.io/portofranco.online/**

## Pastas
```
Porto Franco Online/
├── index.html            entrada, login e menu
├── config.js             endereço e chave publicável do Supabase
├── shim.js               ligação das telas com o banco (login e dados)
├── baixar.js             downloads (Mac/PC baixa direto; iPhone abre "Salvar em Arquivos")
├── tabelas.html          tabelas como Excel (editar, baixar e subir)
├── funil.html            funil de vendas (contato → proposta → negociação → fechado)
├── excel.js              gera o Excel no formato ORIGINAL com os dados do sistema
├── modelos/              planilhas originais criptografadas (painel.bin, online.bin)
├── publicidade/          Porto Franco Online Publicidade (só administrador)
├── painel/               Painel de LED (só administrador)
├── propostas/
│   ├── online/           Proposta Porto Franco Online (aberta ao cliente)
│   └── painel/           Proposta Painel de LED (aberta ao cliente)
├── sql/
│   ├── 01-estrutura.sql        tabelas, funções e regras (vai para o GitHub)
│   └── 02-dados-iniciais.sql   dados dos clientes (SÓ no Mac)
├── excel/                      planilhas (SÓ no Mac); excel/originais = formato oficial
├── copias/                     cópias dos dados baixadas do sistema (SÓ no Mac)
└── ACESSOS.md                  links, URL e chave publicável (SÓ no Mac)
```

## Onde fica cada coisa
| Onde | O quê |
|---|---|
| GitHub `portofranconline/portofranco.online` (público) | código do site, sem dados de clientes |
| Supabase `portofranco.online` (Porto Franco Publicidade) | dados: clientes, pagamentos, despesas, modelos do Excel, logins |
| Mac `Claude › Projetos › Porto Franco Online` | cópia completa: código + sql + excel |

## Como atualizar (sempre o mesmo procedimento)
1. **Pedir a mudança ao Claude** (tela, função ou dados).
2. **Código:** o Claude altera os arquivos, testa e envia ao GitHub. O site atualiza sozinho em 1 a 3 minutos.
3. **Banco (Supabase):** se a mudança precisar, o Claude entrega um arquivo `sql/NN-descricao.sql`; abra o SQL Editor do projeto, cole e toque em **Run**.
4. **Formato do Excel:** o botão **Exportar Excel** usa sempre a planilha original (pasta `excel/originais`). Para mudar o formato, envie a planilha nova ao Claude: ele troca o modelo em `modelos/`. Sem isso, o formato nunca muda.
5. **Excel:** o Claude atualiza as planilhas da pasta `excel/`. Também dá para baixar pelo próprio sistema (botão **Baixar Excel** no Painel e na Publicidade, ou **Tabelas › Baixar Excel**).
6. **Mac:** o Claude atualiza esta pasta com a mesma versão do GitHub.

Para trazer mudanças feitas no Excel para o sistema: **Tabelas › Subir Excel** (usa a planilha baixada em Tabelas).

## Tela inicial
- **💬 Cobrar** em cada cliente vencido ou a vencer: abre o WhatsApp do cliente com a mensagem pronta (valor, vencimento e chave PIX) e marca "cobrado em". Textos e PIX em Configurações.
- Resumo do **Funil de vendas**.
- Destaque de **vencidos** e **a vencer** da Publicidade e do Painel de LED (mesma regra da aba Vencimentos).
- Botões **Exportar Excel**, **Enviar propostas** (copiar links e WhatsApp), **Configurações** e **Baixar cópia dos dados** (arquivo .json usado para atualizar os artefatos no Claude).

## Acesso
Só o **Administrador** vê e altera Publicidade, Painel de LED e Tabelas, cria logins e envia as propostas. As propostas abrem para o cliente sem login.

## Segurança
- O código é público (GitHub Pages), mas os dados não: sem login de administrador o banco não entrega nada.
- `config.js` tem só a chave publicável (`sb_publishable_`). **Nunca** coloque a chave `sb_secret_` em nenhum arquivo.
- `sql/02-dados-iniciais.sql` e a pasta `excel/` nunca vão para o GitHub (estão no `.gitignore`).
