# Sistema Porto Franco Online (privado)

Site com login que reúne:

| Caminho | O que é | Precisa de login? |
|---|---|---|
| `/` | Entrada, menu, logins de acesso e troca de senha | — |
| `/painel/` | Painel de LED: clientes, pagamentos, despesas, recibos, Excel e PDF | Sim |
| `/publicidade/` | Porto Franco Online Publicidade: clientes, pagamentos, despesas, Excel e PDF | Sim |
| `/tabelas.html` | Tabelas editáveis (como Excel), baixar e subir Excel | Sim |
| `/propostas/painel/` | Proposta do Painel de LED para o cliente | Não (é para enviar ao cliente) |
| `/propostas/online/` | Proposta de divulgação do Porto Franco Online | Não (é para enviar ao cliente) |

## Banco de dados (Supabase)
- Projeto: `portofranco.online` (organização Porto Franco Publicidade), URL em `config.js`.
- Tabela `public.app_docs` (`id`, `data`): `painel/main`, `online/main`, `proposta/main`, `tema/main`, `fotos/<n>`.
- Tabela `public.perfis`: quem pode entrar e com qual acesso.
- Instalação já feita em 25/11/2026. O arquivo `sql/instalacao.sql` (com os dados dos clientes) **não fica no GitHub**: está guardado só no Mac, em Claude › Projetos › Porto Franco Online › sql.

## Acesso
Só o **Administrador** vê e altera Publicidade, Painel de LED e Tabelas, cria logins e envia as propostas. Outros logins não veem os dados.

Os logins viram e-mails internos (`kaliel@pfonline.local`), que nunca recebem mensagens.

## Segurança
- O código é público (GitHub Pages), mas os dados não: sem login de administrador o banco não entrega nada.
- A chave em `config.js` é a publicável (`sb_publishable_`): ela é feita para ficar no site. Quem protege os dados são o login e as regras do banco (RLS): sem login, ninguém lê nem grava nada.
- **Nunca** coloque a chave `sb_secret_` em nenhum arquivo.

## Publicação (GitHub Pages, igual ao controle de estoque)
Settings → Pages → Source: **Deploy from a branch** → Branch: **main** / **(root)** → Save.
Endereço: https://portofranconline.github.io/portofranco.online/

## Abrir no computador (teste)
Na pasta do projeto, no Terminal:

    python3 -m http.server 5500

e abra http://localhost:5500
