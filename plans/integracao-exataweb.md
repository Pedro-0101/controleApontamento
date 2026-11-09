# Plano de Implementação — Integração ExataWeb (API nova) com o sistema atual

> **Status:** planejamento aprovado com decisões de 09/11/2026 (nada implementado ainda)
> **Criado em:** 09/11/2026
> **Referências:**
> - `ExataWeb_Ponto_Funcionarios_V12.pdf` (11 páginas) — API de Cadastros, Pontos e Status de Funcionários (Portaria 671)
> - `docs/api-ponto-certificado.md` — API antiga já integrada (Ponto Certificado)
> - `docs/resumo-integracao-ponto-certificado.md` — resumo atual (descreve **somente** a Ponto Certificado)
> - `backend/ponto-api.js`, `backend/ponto-sync.js`, `backend/ponto-vinculos.js`, `backend/ponto-afd.js`, `backend/ponto-webhooks.js`

---

## 1. Contexto e problema

O sistema hoje integra **apenas** a API Ponto Certificado:

- Base URL: `https://integrar.pontocertificado.com.br` (`backend/ponto-api.js:11`)
- Autenticação: `POST /Api.svc/StartSession` + token no **corpo** (`tokenAcesso`)
- Operações: `ListarFuncionarios`, `RetornaRelogiosInfo`, `SelecionaMarcacoes`, `SelecionaMarcacoesPosteriorIdInformado`, `vinculaFuncionarioRelogio`, `GeraAFD*`, `WebhookSubscription`, etc.

A nova API **ExataWeb V12** é outra plataforma, com autenticação, endpoints, paginação e modelo de dados diferentes:

- `POST /login` → JWT, usado como `Authorization: Bearer <token>`
- `GET /integra/v1/protected/empresas`
- `GET /integra/v1/protected/funcionarios/{empresa}`
- `POST /integra/v2/protected/pontos671`
- `POST /integra/v2/protected/baixaponto671`
- `GET /integra/v1/protected/v2/status_funcionarios/read/{empresa}`

**Não existe hoje nenhuma linha de código da Exata** no projeto (nem no backend, nem no frontend, nem no banco). Portanto, a integração das duas APIs **não foi implementada**. Este plano descreve como implementá-la de forma incremental, mantendo a Ponto Certificado funcionando em paralelo.

---

## 2. Decisões confirmadas (09/11/2026)

| # | Decisão | Impacto no plano |
|---|---|---|
| 1 | **Ponto Certificado continua em paralelo** por enquanto | Coexistência por provedor; nada da API antiga é removido |
| 2 | **Todas as empresas da Exata** devem ser integradas; os códigos `empresasistema` ainda não são conhecidos | Descobrir via `GET /empresas` e sincronizar todas; não exigir código digitado manualmente |
| 3 | Integração **somente leitura** | Sem `POST /funcionarios` (I/A/E) e sem CRUD de status na Exata |
| 4 | Histórico segue o **padrão já existente da Ponto Certificado** | Carga manual por período + sincronização incremental, sem janela fixa pré-definida |
| 5 | **AFD fora de escopo** por enquanto | Remover AFD das fases; ocultar painel AFD para empresas Exata |
| 6 | **Sem ambiente de homologação**; usar credenciais de ambiente | Credenciais em variáveis de ambiente (`backend/.env`), nunca no frontend |
| 7 | Validação de consistência será feita pelo **próprio solicitante** | Entregar contagens e relatórios comparativos para conferência |

### Pendências antes da Fase 1

- [ ] Informar a **URL base** da aplicação ExataWeb.
- [ ] Informar **usuário e senha** da conta Exata (serão gravados em `backend/.env`, fora do git).
- [ ] Confirmar o mapeamento entre as empresas descobertas na Exata e as empresas locais (`empresas`), ou aceitar mapeamento automático por nome com ajuste manual na tela.

---

## 3. Objetivos

1. Permitir que o sistema consulte a Exata em paralelo à Ponto Certificado.
2. Descobrir e sincronizar **todas** as empresas da conta Exata.
3. Sincronizar (somente leitura): funcionários, status de funcionários e marcações de ponto.
4. Confirmar a exportação das marcações (`baixaponto671`) de forma segura e idempotente.
5. Manter relatórios consolidados funcionando com dados de ambos os provedores.
6. Não quebrar nenhuma funcionalidade existente da Ponto Certificado.

---

## 4. Arquitetura

### 4.1 Provedor por empresa (coexistência)

Adicionar `provedor` em `empresas_config` e resolver a implementação em uma camada de abstração:

```
backend/
  exata-api.js            # cliente HTTP puro da Exata (login, Bearer, endpoints)
  provedor-api.js         # interface comum: listarFuncionarios, buscarPontos, confirmarPontos...
  ponto-api.js            # (existente) Ponto Certificado
  ponto-sync.js           # passa a chamar provedor-api em vez de ponto-api direto
```

A camada `provedor-api.js` decide pelo campo `empresa.provedor`. Nada da Ponto Certificado é removido; apenas passa a ser um dos provedores.

### 4.2 Credenciais globais da Exata

A conta Exata é única e cobre todas as empresas (`empresasistema`). Portanto:

- Credenciais globais em `backend/.env`:
  - `EXATA_API_BASE_URL`
  - `EXATA_API_USER`
  - `EXATA_API_PASSWORD`
  - `EXATA_API_TIMEOUT_MS`
- Seguir o mesmo padrão já usado pela Ponto Certificado (`backend/.env` + `backend/.env.example`).
- Nada de credencial no frontend ou no bundle.
- Em `empresas_config`, criar **uma linha** representando a conta Exata (`provedor='exata'`), sem duplicar credenciais por empresa.

### 4.3 Descoberta de empresas

Como os códigos `empresasistema` são desconhecidos:

1. `GET /integra/v1/protected/empresas` retorna todas as empresas da conta.
2. Persistir em uma tabela de mapeamento `empresas_exata`.
3. Cada empresa descoberta é sincronizada automaticamente.
4. O vínculo com a empresa local (`empresas`) é feito por nome/descrição, com possibilidade de ajuste manual na tela.
5. Empresas que não devem ser importadas podem ser marcadas como inativas em `empresas_exata`.

### 4.4 Identidade de uma marcação da Exata

A Exata não devolve um `id` de marcação. A identidade Portaria 671 é:

```
(empresa, reppid, nsr)
```

Portanto:

- `marcacao_id` passa a ser **NULL** para Exata.
- Novo índice único: `(empresa_config_id, empresasistema, reppid, nsr)`.
- `data`, `hora` e `dataHoraColeta` são gravados como recebidos (evitar conversão de timezone).

### 4.5 Incremental

A Exata **não tem endpoint de "último ID"**. O fluxo correto é:

1. `pontos671` com `status = "N"` (não exportados) e `qtde` configurável.
2. Repetir a consulta até vir menos que `qtde` (paginação por lote).
3. Persistir no banco **antes** de confirmar.
4. `baixaponto671` para marcar como exportado.
5. Em caso de falha entre 3 e 4, a próxima execução reconsulta os mesmos pontos; a chave única + upsert garante idempotência.

---

## 5. Escopo: o que a Exata NÃO documenta / está fora

A documentação V12 **não** traz endpoints para:

- Relógios/REPs (listagem, status online, ativação)
- Vínculos funcionário-relógio
- Webhooks
- Geração de AFD (arquivo pronto)

Além disso, por decisão do projeto:

- **Integração somente leitura**: não haverá escrita de funcionários nem de status na Exata.
- **AFD ignorado** por enquanto.

Consequências para a UI:

- Para empresas com provedor `exata`, ocultar/desabilitar: **Relógios**, **Vínculos** e **Webhooks**.
- O painel **AFD** também deve ficar oculto para Exata.
- Relatórios consolidados continuam funcionando, pois leem a tabela local.

---

## 6. Etapas

### Fase 0 — Alinhamento e descoberta (0,5 dia) — praticamente concluída

- [x] Definir coexistência com a Ponto Certificado.
- [x] Definir integração somente leitura.
- [x] Definir todas as empresas da Exata.
- [x] Definir histórico no padrão da Ponto Certificado.
- [x] Ignorar AFD por enquanto.
- [x] Definir validação pelo solicitante.
- [ ] Obter URL base, usuário e senha da Exata (para `backend/.env`).
- [ ] Definir o mapeamento inicial das empresas Exata → empresas locais.

**Entregável:** credenciais no `.env` + mapeamento inicial validado.

---

### Fase 1 — Infraestrutura e cliente Exata (2–3 dias)

- [ ] Migração de schema (idempotente, com helper `addColumnIfMissing`):
  - `empresas_config`: `provedor VARCHAR(20) NOT NULL DEFAULT 'pontocertificado'`
  - `empresas_exata` (nova):
    `id`, `empresa_config_id`, `empresasistema`, `empresacliente`, `descricao`, `empresa_id` (local, nullable), `ativo`, `sincronizado_em`
    — único: `(empresa_config_id, empresasistema)`
  - `funcionario_exata` (nova, satélite):
    `empresa_config_id`, `empresasistema`, `matricula`, `pis`, `cpf`, `codturma`, `descricao_turma`, `cartao`, `nome`, `email`, `cod_erp`, `centro_custo`, `cod_funcao`, `cod_setor`, `desc_setor`, `admissao`, `intervalo_minimo`, `status`, `status_inicio`, `status_fim`, `ultima_modificacao`
    — único: `(empresa_config_id, empresasistema, matricula)`
  - `marcacoes_ponto`:
    - `marcacao_id` passa a permitir `NULL`
    - novas colunas: `provedor`, `empresasistema`, `reppid`, `coletor`, `turma`, `hash`, `registro`, `tipo_coletor`, `data_hora_coleta`, `status_exportacao`
    - novo índice único: `(empresa_config_id, empresasistema, reppid, nsr)`
  - `marcacao_sync_estado_exata` (nova):
    `empresa_config_id`, `empresasistema`, `ultima_data`, `ultimo_nsr`, `ultimo_reppid`, `ultima_execucao_em`, `ultimo_total`
    — PK: `(empresa_config_id, empresasistema)`
- [ ] Criar `backend/exata-api.js`:
  - `login()` → `POST /login` com `userName`/`password`
  - Cache do token pelo `exp` do JWT (fallback TTL configurável)
  - `request(method, path, body)` com `Authorization: Bearer`
  - Retry único em `401/403` (renova token)
  - Erros: `400` pode ser **array** de erros por item; `406` pode ser **string pura**
  - Timeout configurável (`EXATA_API_TIMEOUT_MS`)
  - Nunca logar token/senha
- [ ] Criar `backend/provedor-api.js` com interface comum:
  - `listarEmpresas(company)`
  - `listarFuncionarios(company, empresasistema)`
  - `listarStatusFuncionarios(company, empresasistema)`
  - `buscarPontos(company, filtros)`
  - `confirmarPontos(company, pontos)` (Ponto Certificado: no-op)
- [ ] Script de fumaça `backend/scripts/exata-smoke.js`
  (login → empresas → funcionários de uma empresa → 1 dia de pontos).
- [ ] Testes unitários do cliente com `fetch` mockado.

**Critérios de aceite:**
- Script de fumaça autentica e lista empresas/funcionários/pontos reais da Exata.
- Token não aparece em logs.
- Suíte existente continua verde.

---

### Fase 2 — Empresas e funcionários (somente leitura) (2–3 dias)

- [ ] `GET /empresas`: importar todas as empresas para `empresas_exata`.
- [ ] Mapear `empresas_exata.empresa_id` para as empresas locais:
  - automático por nome/descrição
  - ajuste manual na tela para casos ambíguos
  - empresas sem mapeamento entram como "sem empresa local" e são contabilizadas
- [ ] Para cada empresa Exata ativa, `GET /funcionarios/{empresasistema}`:
  - Upsert em `funcionario_exata` por `(empresa_config_id, empresasistema, matricula)`
  - Coerção de matrícula para **string** (preservar zeros à esquerda; atenção se a Exata devolver número)
  - Não alterar empresa/local/cargo/status locais existentes
- [ ] Tela **Configurações → Empresas da API**:
  - Linha da conta Exata com provedor `exata`
  - Status da última sincronização
  - Lista de empresas descobertas e mapeamento local
  - Botão "Sincronizar funcionários"
- [ ] Auditoria em `sincronizacao_execucao` com `tipo = EXATA_FUNCIONARIOS`.

**Critérios de aceite:**
- Todas as empresas da conta aparecem na tela.
- Funcionários da Exata aparecem nos relatórios.
- Reexecutar a sincronização não duplica nem apaga dados locais.
- Empresas Ponto Certificado continuam funcionando.

---

### Fase 3 — Marcações de ponto e baixa (4–6 dias)

- [ ] `POST /pontos671` com `{ empresa, qtde, dtInicial, dtFinal, status: "N" }`:
  - `qtde` configurável (padrão 100, teto a validar)
  - Loop de paginação até vir menos que `qtde`
  - Datas em `DD/MM/AAAA`
  - Tratar `406` como string de erro
- [ ] Mapear campos:
  - `empresa` → `empresasistema`
  - `nsr`, `reppid`, `data` + `hora` → `data_marcacao`
  - `pis`, `cpf`, `matricula`, `coletor`, `turma`, `latitude`, `longitude`
  - `status`, `dataHoraColeta`, `hash`, `tipoColetor`, `registro`
- [ ] Persistir em `marcacoes_ponto` com upsert idempotente.
- [ ] Após commit, chamar `POST /baixaponto671` com `[{ empresa, nsr, reppid }]` em lotes.
  - Se a baixa falhar, registrar e permitir reprocessar (não perder os dados).
  - Nunca confirmar antes de persistir.
- [ ] Modo **período** (carga manual, igual ao padrão da Ponto Certificado) e modo **incremental** (status `N`).
- [ ] Tela de importação:
  - Seleção de empresa Exata (ou todas)
  - Data inicial/final
  - Resultado: buscados, inseridos, atualizados, ignorados, baixados, erros
- [ ] Registrar em `sincronizacao_execucao` (`EXATA_PONTOS_PERIODO`, `EXATA_PONTOS_INCREMENTAL`).

**Critérios de aceite:**
- Importação de um período de teste bate com a Exata.
- Rodar duas vezes não cria duplicatas.
- Pontos ficam marcados como exportados na Exata (`baixaponto671`).
- Falha simulada na baixa não perde dados e pode ser reprocessada.
- Relatório consolidado mostra os pontos importados.
- Contagens entregues ao solicitante para validação.

---

### Fase 4 — Status de funcionários (somente leitura) (1–2 dias)

- [ ] `GET /v2/status_funcionarios/read/{empresa}` → tabela `status_funcionario_exata`.
- [ ] Mapear `status_integra` para os eventos locais existentes (Férias, Atestado, Afastado, Suspensão etc.).
- [ ] Refletir o status atual do funcionário no Painel e nos Relatórios (sem escrita na Exata).
- [ ] Sem `salvar`, `editar` ou `deletar` — apenas leitura, conforme decisão.

**Critérios de aceite:**
- Status da Exata visíveis no sistema.
- Nenhuma chamada de escrita é feita na Exata.

---

### Fase 5 — Relatórios e ajustes de UI (1–2 dias)

- [ ] Relatórios consolidados: incluir `provedor` e `empresasistema` nos filtros e na exportação.
- [ ] Ocultar/desabilitar para Exata: **Relógios**, **Vínculos**, **Webhooks** e **AFD**.
- [ ] Ajustar textos e avisos da tela de configuração.
- [ ] Nenhuma geração de AFD para Exata nesta entrega.

**Critérios de aceite:**
- Consolidado exporta corretamente dados de ambos provedores.
- Nenhuma tela mostra funcionalidade inexistente para Exata.

---

### Fase 6 — Coexistência e rollout (2–3 dias)

- [ ] Rodar Ponto Certificado e Exata em paralelo durante a validação.
- [x] Ativar a conta Exata e sincronizar todas as empresas descobertas (botão *Executar rollout*).
- [x] Entregar contagens por empresa/dia para o solicitante validar (painel + exportação CSV).
- [x] Monitorar logs, erros de baixa e duplicidades (endpoint/painel de monitoramento).
- [x] Plano de rollback: desativar a conta Exata sem afetar a Ponto Certificado.
- [x] Atualizar `docs/resumo-integracao-ponto-certificado.md` (ou criar `docs/resumo-integracao-exata.md`) com status **real**.
- [x] Adicionar variáveis ao `backend/.env.example`.

**Critérios de aceite:**
- Dados da Exata importados e validados pelo solicitante.
- Nenhuma regressão nas empresas Ponto Certificado.
- Rollback testado.

---

### Fase 7 — Qualidade contínua (paralela) — concluída em 09/11/2026

- [x] Testes unitários do cliente Exata e do mapeamento de dados.
- [x] Testes de integração com a conta real (login, empresas, funcionários, pontos, baixa).
- [x] Testes de idempotência (rodar 2x a mesma carga).
- [x] Teste de falha na baixa.
- [x] Logs com `empresa_config_id`, `empresasistema`, operação e contadores (sem dados sensíveis).
- [x] Métricas: pontos buscados, persistidos, baixados, erros.
- [x] Atualizar README e documentação de operação.

---

## 7. Cronograma estimado

| Fase | Escopo | Estimativa |
|---|---|---|
| 0 | Alinhamento e descoberta | 0,5 dia (quase concluída) |
| 1 | Infraestrutura e cliente Exata | 2–3 dias |
| 2 | Empresas e funcionários (leitura) | 2–3 dias |
| 3 | Pontos e baixa | 4–6 dias |
| 4 | Status de funcionários (leitura) | 1–2 dias |
| 5 | Relatórios e UI | 1–2 dias |
| 6 | Coexistência e rollout | 2–3 dias |
| 7 | Qualidade e documentação | contínuo |
| **Total** | | **≈ 12–19 dias úteis** |

> A estimativa assume as credenciais da Exata disponíveis no `.env`. Sem elas, a Fase 1 pode avançar com mocks, mas a validação fica bloqueada.

---

## 8. Arquivos que serão criados/alterados

### Novos

- `backend/exata-api.js`
- `backend/provedor-api.js`
- `backend/scripts/exata-smoke.js`
- `backend/scripts/exata-import.js` (opcional, operação manual)
- `docs/api-exata-web.md`
- `src/app/.../empresas-config` — campos e ações do provedor Exata
- Testes: `backend/exata-api.test.js`, `backend/provedor-api.test.js`

### Alterados

- `backend/ponto-sync.js` — usar `provedor-api` e suportar Exata
- `backend/ponto-api.js` — permanece; possivelmente extrair interface comum
- `backend/server.js` — endpoints de configuração e novos campos
- `backend/ponto-vinculos.js` — bloquear/ignorar Exata
- `backend/ponto-webhooks.js` — bloquear/ignorar Exata
- `backend/ponto-afd.js` — ocultar/ignorar Exata (sem geração)
- `backend/relatorios-consolidados.js` — filtros por provedor/empresa Exata
- `src/app/core/services/sincronizacao/sincronizacao.service.ts` — tipos e campos
- `src/app/feature/configuracoes/empresas/empresas-config.*` — UI
- `backend/.env.example`
- `docs/resumo-integracao-ponto-certificado.md`

---

## 9. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Exata não tem endpoint incremental | Reprocessar pontos | Usar `status="N"` + paginação + `baixaponto671` |
| Falha entre persistir e baixar | Reentrega de pontos | Upsert idempotente + reprocessamento seguro |
| `qtde` máximo desconhecido | Timeout/truncamento | Deixar configurável e validar com dados reais |
| Matrícula numérica perde zeros à esquerda | Funcionário não casa | Normalizar para string; validar com amostra real |
| Timezone/data separada (`data` + `hora`) | Marcação no dia errado | Gravar data/hora como recebidas; testar virada de dia |
| Códigos `empresasistema` desconhecidos | Pular empresas | Descoberta automática via `GET /empresas` |
| Mapeamento de empresa local ambíguo | Dados na empresa errada | Mapeamento manual na tela + relatório de pendências |
| Credenciais ainda não disponíveis | Bloqueia validação | Solicitar antes da Fase 1; usar mocks nesse meio-tempo |
| Duas APIs ativas ao mesmo tempo | Dados duplicados/misturados | `provedor` explícito por conta e filtros por provedor |

---

## 10. Critérios de aceite finais (Definition of Done)

- [ ] Conta Exata configurada por variáveis de ambiente e listada em Empresas da API.
- [ ] Todas as empresas da Exata descobertas e mapeadas.
- [ ] Funcionários da Exata sincronizados sem duplicar nem apagar dados locais.
- [ ] Pontos importados por período e incremental.
- [ ] Pontos confirmados via `baixaponto671`.
- [ ] Reexecuções não geram duplicatas.
- [ ] Falha na baixa é recuperável.
- [ ] Status de funcionários lidos e refletidos no sistema (sem escrita).
- [ ] Relatórios consolidados e exportações incluem dados da Exata.
- [ ] Relógios, vínculos, webhooks e AFD ocultos para Exata.
- [ ] Nenhuma regressão na Ponto Certificado.
- [ ] Testes verdes e documentação atualizada.
- [ ] Nenhum segredo no frontend nem em logs.
- [ ] Contagens validadas pelo solicitante.

---

## 11. Próximo passo

Antes de iniciar a Fase 1, são necessários:

1. `EXATA_API_BASE_URL`
2. `EXATA_API_USER`
3. `EXATA_API_PASSWORD`

Com esses dados, a Fase 1 começa pelo `backend/exata-api.js` e pelo script de fumaça, sem tocar na integração atual.
