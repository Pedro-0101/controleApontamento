# Resumo de Integração — ExataWeb (Portaria 671)

> Status real da implementação no sistema de controle de apontamento.
> Atualizado em: **09/11/2026** — Fase 7 (qualidade contínua) implementada.

---

## 1. Visão geral

A integração com a **ExataWeb V12** roda em paralelo à **Ponto Certificado**. Cada conta da
API tem um `provedor` explícito em `empresas_config`:

- `pontocertificado` — integração antiga, mantida sem alterações.
- `exata` — nova integração, **somente leitura**, baseada em `empresasistema`.

Nada da Ponto Certificado foi removido. As consultas de sincronização, relatórios, vínculos,
webhooks e AFD filtram a conta Exata quando a funcionalidade não existe nela.

### Escopo implementado

| Fase | Escopo | Status |
|---|---|---|
| 1 | Cliente HTTP, login JWT, cache/renovação e script de fumaça | ✅ Concluída |
| 2 | Descoberta de empresas, mapeamento local e funcionários | ✅ Concluída |
| 3 | Marcações por período/incremental e baixa (`baixaponto671`) | ✅ Concluída |
| 4 | Status de funcionários (somente leitura) | ✅ Concluída |
| 5 | Relatórios consolidados e ocultação de telas inexistentes | ✅ Concluída |
| 6 | Coexistência, validação, monitoramento e rollback | ✅ Concluída em 09/11/2026 |
| 7 | Qualidade contínua (testes, logs, métricas e documentação) | ✅ **Concluída em 09/11/2026** |

---

## 2. Configuração

As credenciais são **globais da conta Exata** e ficam somente no `backend/.env` (fora do git):

```env
EXATA_API_BASE_URL=
EXATA_API_USER=
EXATA_API_PASSWORD=
EXATA_API_TIMEOUT_MS=30000
EXATA_TOKEN_TTL_MS=900000
EXATA_PONTOS_QTDE=100
EXATA_INCREMENTAL_DIAS=30
```

O modelo completo está em `backend/.env.example`. Nenhuma credencial é enviada ao frontend
nem gravada em log.

---

## 3. Arquitetura e dados

```
backend/exata-api.js      cliente HTTP puro (login, Bearer, endpoints, erros)
backend/exata-sync.js     regras de sincronização, validação, monitoramento e rollback
backend/exata-schema.js   migrações idempotentes
backend/provedor-api.js   abstração de provedor usada pelo fluxo comum
```

### Tabelas principais

| Tabela | Papel |
|---|---|
| `empresas_config` | conta global `exata` (`chave = 'exata'`, `provedor = 'exata'`) e demais contas |
| `empresas_exata` | empresas descobertas, `empresasistema`, mapeamento `empresa_id` e ativo/inativo |
| `funcionario_exata` | espelho dos funcionários por empresa/matrícula |
| `marcacoes_ponto` | marcações com `provedor`, `empresasistema`, `reppid`, `nsr` e `status_exportacao` |
| `marcacao_sync_estado_exata` | progresso incremental por empresa |
| `status_funcionario_exata` | catálogo de status e mapeamento para eventos locais |
| `sincronizacao_execucao` | auditoria de cada execução (`EXATA_*`) |

### Identidade de uma marcação

A Exata não devolve `id` de marcação. A chave é:

```
(empresa_config_id, empresasistema, reppid, nsr)
```

`marcacao_id` fica `NULL` para a Exata. O índice único garante idempotência: reexecutar uma
carga atualiza o registro existente e não cria duplicata.

---

## 4. Endpoints

### Sincronização

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/sincronizacao/exata` | empresas descobertas, mapeamento e resumo |
| `POST` | `/api/sincronizacao/exata/empresas/sincronizar` | descobre/atualiza todas as empresas |
| `PUT` | `/api/sincronizacao/exata/empresas/:id` | ajusta empresa local e ativo/inativo |
| `POST` | `/api/sincronizacao/exata/funcionarios` | importa funcionários (leitura) |
| `POST` | `/api/sincronizacao/exata/pontos` | importa pontos por período ou incremental |
| `GET` | `/api/sincronizacao/exata/pontos/status` | estado por empresa |
| `POST` | `/api/sincronizacao/exata/status` | importa catálogo de status (leitura) |
| `GET` | `/api/sincronizacao/exata/status` | catálogo e mapeamentos |
| `PUT` | `/api/sincronizacao/exata/status/:id` | ajusta o evento local do status |

### Fase 6 — coexistência e rollout

| Método | Rota | Função |
|---|---|---|
| `PUT` | `/api/sincronizacao/exata/conta` | ativa/desativa a conta Exata (rollback) |
| `GET` | `/api/sincronizacao/exata/validacao` | contagens por empresa/dia |
| `GET` | `/api/sincronizacao/exata/validacao?formato=csv` | exportação CSV para o solicitante |
| `GET` | `/api/sincronizacao/exata/monitoramento` | saúde, baixas pendentes, duplicidades e execuções |

Filtros da validação: `dataInicio`, `dataFim`, `empresasExataIds` (lista separada por vírgula).

---

## 5. Fluxos operacionais

### 5.1 Carga por período (histórico)

1. Em **Configurações → Empresas da API → Marcações de ponto — ExataWeb**.
2. Selecione a empresa (ou todas), a data inicial/final e o lote (`qtde`).
3. Clique em **Importar período**.
4. O backend consulta `POST /pontos671` com `status = "N"`, pagina até vir menos que `qtde`,
   persiste cada página e só então chama `POST /baixaponto671`.
5. Se a baixa falhar, os dados permanecem no banco e a próxima execução reconsulta os mesmos
   pontos com upsert idempotente.

### 5.2 Incremental

Consulta os pontos não exportados (`status = "N"`). Quando não existe estado anterior, usa
`EXATA_INCREMENTAL_DIAS` (padrão 30) como janela inicial. O progresso fica em
`marcacao_sync_estado_exata`.

### 5.3 Rollout completo (Fase 6)

O botão **Executar rollout** no painel ExataWeb executa, em sequência:

1. ativa a conta Exata, se necessário;
2. descobre todas as empresas da conta;
3. sincroniza funcionários de todas as empresas ativas;
4. sincroniza o catálogo de status e reflete os eventos locais;
5. importa os pontos incrementais;
6. atualiza os painéis de status, monitoramento e validação.

Cada etapa é auditada em `sincronizacao_execucao`. A Ponto Certificado continua funcionando
durante todo o processo.

---

## 6. Validação pelo solicitante

Depois do rollout:

1. Abra **Rollout e coexistência → Contagens para validação**.
2. Informe o período e a empresa (ou todas).
3. Clique em **Gerar contagens**.
4. Confira por empresa/dia: marcações, funcionários distintos, exportadas, pendentes e faixa de NSR.
5. Clique em **Exportar CSV** e entregue o arquivo ao solicitante.

Resumo disponível no topo do painel: total de marcações, funcionários, exportadas, pendentes,
empresas com dados e dias cobertos.

---

## 7. Monitoramento

O endpoint/painel de monitoramento exibe:

- **Saúde**: `OK` ou `ATENCAO`.
- **Alertas**: empresas sem empresa local, chaves duplicadas, baixas pendentes e execuções com erro.
- **Pontos**: total importado, total do dia, primeira/última marcação e baixas pendentes.
- **Execuções recentes por tipo** com status, duração, empresas processadas e erro.
- **Duplicidades**: conferência da chave `(empresasistema, reppid, nsr)`.
- **Baixas pendentes por empresa**, com a data mais antiga.

Logs do backend incluem `empresa_config_id`, `empresasistema`, operação e contadores
(`[Exata] pontos.fim ...`). Tokens e senhas nunca são registrados.

---

## 8. Rollback

O rollback **não apaga dados** e **não afeta a Ponto Certificado**:

1. Em **Rollout e coexistência**, clique em **Desativar conta (rollback)**.
2. Ou chame `PUT /api/sincronizacao/exata/conta` com `{ "ativo": 0 }`.
3. A partir daí, qualquer sincronização Exata é bloqueada com mensagem clara.
4. As telas continuam exibindo os dados já importados; a conta pode ser reativada depois.

O registro de auditoria recebe `EXATA_CONTA_DESATIVAR` / `EXATA_CONTA_ATIVAR`.

Para reativar: **Ativar conta** ou `PUT /api/sincronizacao/exata/conta` com `{ "ativo": 1 }`.

---

## 9. Limitações conhecidas

A API ExataWeb V12 não oferece (e o sistema não usa para essa conta):

- listagem/gestão de relógios e REPs;
- vínculos funcionário-relógio;
- webhooks;
- geração de AFD.

Por isso, os painéis **Relógios**, **Vínculos**, **Webhooks** e **AFD** ficam ocultos ou
bloqueados para o provedor `exata`. A integração também é **somente leitura**: nenhum
funcionário ou status é escrito na Exata.

---

## 10. Qualidade contínua (Fase 7)

### 10.1 Testes unitários e de fluxo

```bash
cd backend
npm test
```

Cobrem:

- cliente Exata: login, cache do JWT, renovação em 401, erros 400/406, ausência de credenciais;
- normalização de funcionários, pontos, datas, matrícula e status;
- camada de provedores (`provedor-api`);
- idempotência: reexecutar a mesma carga por período não cria duplicatas;
- falha na baixa: os pontos permanecem no banco e são recuperados na execução seguinte;
- logs sem credenciais, com contexto e contadores;
- métricas padronizadas (`buscados`, `persistidos`, `baixados`, `erros`);
- geração do CSV de validação.

Arquivos: `exata-api.test.js`, `exata-sync.test.js`, `provedor-api.test.js`,
`exata-observability.test.js` e `exata-fluxo.test.js`.

### 10.2 Testes de integração com a conta real

Desabilitados por padrão. Executam login, empresas, funcionários, status e consulta de pontos.

PowerShell:

```powershell
$env:EXATA_INTEGRATION=1; npm test
```

A baixa (`baixaponto671`) altera o estado da conta e exige habilitação extra:

```powershell
$env:EXATA_INTEGRATION=1; $env:EXATA_INTEGRATION_BAIXA=1; npm test
```

Bash:

```bash
EXATA_INTEGRATION=1 npm test
EXATA_INTEGRATION=1 EXATA_INTEGRATION_BAIXA=1 npm test
```

Requisitos: `backend/.env` com `EXATA_API_BASE_URL`, `EXATA_API_USER` e `EXATA_API_PASSWORD`.
Os testes nunca imprimem token ou senha.

### 10.3 Logs e métricas

O módulo `backend/exata-observability.js` centraliza os logs. Cada empresa gera uma linha com
operação, `empresa_config_id`, `empresasistema` e contadores, por exemplo:

```
[Exata] pontos.empresa empresa_config_id=1 empresasistema=7 modo=periodo status=OK buscados=120 inseridos=100 atualizados=20 baixados=120 erros=0
```

Chaves sensíveis (`token`, `senha`, `password`, `authorization`, `secret`, `credencial`) são
mascaradas automaticamente como `[redacted]`; valores longos são truncados. As métricas também
são gravadas em `sincronizacao_execucao.resumo` e retornadas no campo `metricas` da sincronização
de pontos.

### 10.4 Frontend

```bash
npm run build
```

Valida o frontend Angular.

### 10.5 Documentação da API

A referência dos endpoints usados está em `docs/api-exata-web.md`.

---

## 11. Pendências para encerramento

- [ ] Informar/confirmar as credenciais reais da Exata no `backend/.env`.
- [ ] Executar o rollout com a conta real.
- [ ] Executar `EXATA_INTEGRATION=1 npm test` com a conta real.
- [ ] Entregar as contagens por empresa/dia ao solicitante e obter o aceite.
- [ ] Monitorar por alguns dias baixas pendentes, duplicidades e execuções com erro.
- [ ] Testar o rollback (desativar e reativar) em ambiente controlado.
