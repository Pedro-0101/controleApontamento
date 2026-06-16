# Resumo da Auditoria — O que precisa ser feito

Auditoria de 10/06/2026, commit `c3e2449`. Resumo rápido (planos detalhados não foram escritos — pedir `/improve plan <item>` para detalhar qualquer um).

## Ordem recomendada

### 1. Consertar a suíte de testes (URGENTE — bloqueia todo o resto)
- `npm test -- --watch=false` está **vermelho: 13 de 34 arquivos de spec falham**, a maioria erro de setup/DI em testes triviais "should create".
- Sem suíte verde, nenhuma outra correção pode ser validada.
- Verificação: `npm test -- --watch=false` → 0 falhas.

### 2. Tirar credenciais do código + ROTACIONAR senhas
- Senha root do MySQL hardcoded em: `backend/server.js:11-17`, `backend/desativar_funcionarios.js`, `backend/update_admissions.js`, `backend/verificar_funcionarios.js`.
- **Pior: as credenciais do banco também estão em `src/environments/environment.ts:3-6` — vão compiladas para o bundle JS público no navegador.** O frontend nem usa esses campos; deletar.
- Credenciais da API Ponto Certificado (email/senha/chave) hardcoded no seed em `backend/server.js:122-125` e em `test-api.js`.
- Chave AES estática em `environment.ts:7`.
- Fazer: mover tudo para variáveis de ambiente / `.env` (fora do git, com `.env.example`), e **trocar a senha do MySQL e as credenciais da API** — já estão queimadas no histórico do git.

### 3. Atualizar dependências vulneráveis (rápido)
- Frontend: Angular ≤21.2.3 tem 2 advisories de XSS (high) → `npm audit fix` (corrige dentro do 21.x).
- Backend: `cd backend; npm audit fix` → corrige `path-to-regexp` (high, ReDoS) e `qs` (moderate).
- Verificar com a suíte verde do item 1 + `ng build`.

### 4. Unificar a regra do "dia lógico" (4h vs 5h) — bug real
- `src/app/core/services/marcacao/marcacao.service.ts:254` e `:388` usam `hour < 4`; a linha `:587` usa `hour < 5`. Batida às 04:30 cai em dias diferentes dependendo do caminho do código.
- Fazer: criar constante única (decidir se a regra é 04:00 ou 05:00), usar nos 3 lugares.
- **Antes de mexer**: escrever testes de caracterização do `formatarMarcacoesPorDia` com batidas às 03:59 / 04:00 / 04:30 / 05:00 (hoje o spec do serviço só tem `toBeTruthy`).

### 5. Corrigir semântica do batch-insert (backend)
- `backend/server.js:415-477`: erros por matrícula são engolidos dentro do loop e a transação **comita o parcial** retornando `success:false`. No retry, `comentario_dia` usa `INSERT` puro → **comentários duplicados** para as matrículas que já tinham dado certo.
- Fazer: ou rollback total no primeiro erro, ou tornar o insert de comentário idempotente (chave única matrícula+data ou checagem prévia).

## Itens importantes mas que podem esperar

- **Backend sem autenticação nenhuma**: ~40 rotas abertas (só o login valida `accessCode`), CORS aberto (`server.js:20`). Mitigado por estar só na rede interna, mas qualquer máquina na LAN altera dados de ponto. Exige design (sessão server-side + middleware).
- **Performance dos filtros**: computeds em `marcacao.service.ts:47-97` re-filtram o dataset inteiro por opção de dropdown; sort da tabela recalcula `getWorkedMinutes()` a cada comparação (`tabela-funcionarios.ts:52-99`).
- **Bundle inicial**: `export.service.ts:2-4` importa xlsx+jspdf (~600KB) estaticamente e é alcançado pela rota eager do painel; trocar por `import()` dinâmico nos métodos de export.
- **xlsx 0.18.5 abandonado no npm** (CVEs sem fix via npm) → migrar para `exceljs` quando der.
- **`server.js` com 1373 linhas** (proxy + migrações DDL + 10 grupos de rotas) → quebrar em `routes/`, `db.js`, `utils.js`. Pré-requisito para testar o backend.
- **DX**: sem ESLint, README é boilerplate do Angular CLI, sem CLAUDE.md, sem `.env.example`.
- **Código morto**: `src/app/examples/` (nada referencia) e `FuncionarioService` (wrapper puro do `EmployeeService`).

## Direção (funcionalidades)

- **Terminar a feature relógios↔funcionários**: a spec (`docs/superpowers/specs/2026-06-10-relogios-funcionarios-design.md`) deixa explícito o escopo futuro (adicionar/remover funcionário, ativar/desativar, colunas Cadastrado/Ativo). O model `relogio-vinculado` e mudanças no `funcionario-relogio` service estão **não commitados no working tree** agora — commitar ou descartar antes de qualquer outra coisa.

## Descartados na auditoria (não re-investigar)

- "Promise.all sem await no prefetch" — erros já são tratados dentro de `prefetchMarcacoes`; benigno.
- "Angular 21 é pre-release" — falso, é a stable atual (problema real é o item 3).
- "Auditoria não tem UI" — falso, `feature/auditoria` está implementada.
- "Cache de prefetch fica stale após edições" — majoritariamente mitigado (cache é consumido no uso + `clearPrefetchCache` no refresh); só resta edge case perto da meia-noite.
- Cookie HttpOnly via JS — impossível no client; faz parte do redesign de auth.

## Comandos de verificação do projeto

- Testes: `npm test -- --watch=false`
- Build: `ng build`
- Audit: `npm audit` (raiz) e `cd backend; npm audit`
- Backend: `cd backend; npm start` | Frontend: `npm start`
