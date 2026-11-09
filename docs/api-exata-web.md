# API ExataWeb V12 — referência usada pela integração

> Documentação operacional dos endpoints consumidos pelo backend. A integração é
> **somente leitura** para funcionários e status; a única escrita é a baixa de
> pontos (`baixaponto671`).
>
> Implementação: `backend/exata-api.js` e `backend/exata-sync.js`.

---

## 1. Configuração e autenticação

As credenciais são globais da conta e ficam em `backend/.env`:

```env
EXATA_API_BASE_URL=
EXATA_API_USER=
EXATA_API_PASSWORD=
EXATA_API_TIMEOUT_MS=30000
EXATA_TOKEN_TTL_MS=900000
```

Fluxo:

1. `POST /login` com `{ "userName": "...", "password": "..." }`.
2. A resposta contém `{ "token": "<jwt>" }`.
3. As chamadas protegidas usam `Authorization: Bearer <token>`.
4. O backend reaproveita o token até o `exp` do JWT (ou `EXATA_TOKEN_TTL_MS`).
5. Em `401`/`403`, o token é renovado e a chamada é repetida **uma única vez**.

Token e senha nunca são registrados em log.

---

## 2. Erros

| HTTP | Formato observado | Tratamento |
|---|---|---|
| `400` | array de erros por item (`{ retorno }`) | detalhes preservados em `ExataApiError.details` |
| `406` | string pura | mensagem convertida em exceção legível |
| `401`/`403` | — | renova o token e repete uma vez |
| timeout | — | `AbortSignal.timeout(EXATA_API_TIMEOUT_MS)` |

---

## 3. Endpoints

### 3.1 Empresas

```http
GET /integra/v1/protected/empresas
```

Retorna as empresas da conta. Campo usado como identificador: `empresasistema`.
Outros campos aproveitados: `empresacliente`, `descricao`, `empresaOrgErp`,
`filialEstabeErp`, `depositoReqInterna`.

### 3.2 Funcionários

```http
GET /integra/v1/protected/funcionarios/{empresasistema}
```

Campos mapeados para `funcionario_exata`:

| API | Coluna |
|---|---|
| `matricula` | `matricula` (sempre string, preserva zeros à esquerda) |
| `pis`, `cpf` | `pis`, `cpf` |
| `codturma`, `descricaoTurma` | `codturma`, `descricao_turma` |
| `cartao`, `nome`, `email` | `cartao`, `nome`, `email` |
| `codErp`, `centroCusto` | `cod_erp`, `centro_custo` |
| `codFuncao`, `codSetor`, `descSetor` | `cod_funcao`, `cod_setor`, `desc_setor` |
| `admissao`, `intervaloMinimo` | `admissao`, `intervalo_minimo` |
| `status`, `statusInicio`, `statusFim` | `status`, `status_inicio`, `status_fim` |
| `ultimamodificacao` | `ultima_modificacao` |

Somente leitura: não há `POST /funcionarios` (inclusão/alteração/exclusão).

### 3.3 Status de funcionários

```http
GET /integra/v1/protected/v2/status_funcionarios/read/{empresasistema}
```

Grava o catálogo em `status_funcionario_exata` e permite mapear cada status para um
evento local (`Ferias`, `Atestado`, `Afastado`, `Suspensao` etc.). O mapeamento manual
não escreve nada na Exata.

### 3.4 Pontos (Portaria 671)

```http
POST /integra/v2/protected/pontos671
Content-Type: application/json

{
  "empresa": 7,
  "qtde": 100,
  "dtInicial": "09/11/2026",
  "dtFinal": "09/11/2026",
  "status": "N"
}
```

- Datas em `DD/MM/AAAA`.
- `status = "N"` retorna pontos ainda não exportados.
- A paginação repete a consulta até vir menos que `qtde`.
- `qtde` é configurável por `EXATA_PONTOS_QTDE` (1..1000).

Identidade de uma marcação (não existe `id` na Exata):

```
(empresa_config_id, empresasistema, reppid, nsr)
```

`marcacao_id` fica `NULL`. `data` + `hora` são gravados como recebidos, sem conversão de
timezone.

Campos mapeados: `nsr`, `reppid`, `data`, `hora`, `pis`, `cpf`, `matricula`, `coletor`,
`turma`, `latitude`, `longitude`, `status`, `dataHoraColeta`, `hash`, `tipoColetor`,
`registro`.

### 3.5 Baixa de pontos

```http
POST /integra/v2/protected/baixaponto671
Content-Type: application/json

[
  { "empresa": 7, "nsr": 1001, "reppid": 12 },
  { "empresa": 7, "nsr": 1002, "reppid": 12 }
]
```

Regras de segurança:

1. os pontos são persistidos no banco **antes** da baixa;
2. a baixa é enviada em lotes;
3. se a baixa falhar, os dados permanecem com `status_exportacao = 'N'`;
4. a próxima execução reconsulta os mesmos pontos e o upsert idempotente evita duplicidade.

---

## 4. Recursos não disponíveis na ExataWeb V12

A integração **não** usa (e a UI oculta para o provedor `exata`):

- listagem/gestão de relógios e REPs;
- vínculos funcionário-relógio;
- webhooks;
- geração de AFD.

---

## 5. Scripts úteis

```bash
# Fumaça (login, empresas, funcionários, status e 1 dia de pontos)
node backend/scripts/exata-smoke.js [empresasistema] [AAAA-MM-DD]

# Testes unitários e de fluxo (sem credenciais)
cd backend && npm test

# Testes contra a conta real (PowerShell)
cd backend
$env:EXATA_INTEGRATION=1; npm test
$env:EXATA_INTEGRATION=1; $env:EXATA_INTEGRATION_BAIXA=1; npm test

# Testes contra a conta real (Bash)
cd backend
EXATA_INTEGRATION=1 npm test
EXATA_INTEGRATION=1 EXATA_INTEGRATION_BAIXA=1 npm test
```
