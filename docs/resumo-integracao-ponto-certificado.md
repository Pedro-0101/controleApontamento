# Resumo de Integração — Ponto Certificado

> Documento destinado ao time comercial para avaliação de compatibilidade com sistemas de gestão de ponto.
> Atualizado em: Novembro 2026

---

## Capacidades de Integração

### 1. Autenticação e Segurança

| Capacidade | Descrição | Status |
|---|---|---|
| **Autenticação por Token** | Token de acesso temporário obtido via credenciais (empresa + usuário + senha). Todas as operações subsequentes utilizam este token. | ✅ Implementado |
| **Multi-Empresa** | Suporte a múltiplas empresas com credenciais independentes. Cada empresa possui chave própria e token individual. | ✅ Implementado |
| **Tratamento de Erros** | Detecção automática de tokens expirados, empresas desativadas e credenciais inválidas com mensagens descritivas. | ✅ Implementado |

### 2. Gestão de Funcionários

| Capacidade | Descrição | Status |
|---|---|---|
| **Consulta de Funcionários** | Listagem completa de funcionários com dados cadastrais (matrícula, nome, CPF, PIS, status). | ✅ Implementado |
| **Funcionários por Categoria** | Consulta de vínculo empregatício e status de categoria por funcionário. | ✅ Implementado |
| **Sincronização de Cadastro** | Atualização automática do cadastro de funcionários no sistema local. | ✅ Implementado |
| **Gestão de Status** | Ativação e desativação de funcionários de forma individual ou em lote. | ✅ Implementado |

### 3. Gestão de Relógios (REPs)

| Capacidade | Descrição | Status |
|---|---|---|
| **Listagem de Relógios** | Consulta de todos os relógios cadastrados com status, descrição e data de criação. | ✅ Implementado |
| **Relógios por Funcionário** | Consulta dos relógios vinculados a uma matrícula específica. | ✅ Implementado |
| **Ativação/Desativação** | Controle de status dos relógios (ativo/inativo) de forma individual ou em lote. | ✅ Implementado |
| **Status Online** | Verificação do status de conexão dos relógios com o servidor. | ✅ Implementado |

### 4. Vínculo Funcionário-Relógio

| Capacidade | Descrição | Status |
|---|---|---|
| **Vinculação Individual** | Vinculação de um funcionário a um relógio específico. | ✅ Implementado |
| **Vinculação em Lote** | Vinculação de múltiplos funcionários a múltiplos relógios em uma única operação. | ✅ Implementado |
| **Desvinculação** | Remoção de vínculo entre funcionário e relógio. | ✅ Implementado |

### 5. Marcações de Ponto

| Capacidade | Descrição | Status |
|---|---|---|
| **Consulta por Período** | Busca de marcações com filtro por data início/fim. | ✅ Implementado |
| **Filtros por Relógio** | Consulta de marcações filtradas por relógio específico. | ✅ Implementado |
| **Filtros por Funcionário** | Consulta de marcações filtradas por matrícula. | ✅ Implementado |
| **Combinação de Filtros** | Suporte a filtros combinados (funcionário + relógio + período). | ✅ Implementado |
| **Multi-Empresa** | Consolidação de marcações de todas as empresas em uma única consulta. | ✅ Implementado |

### 6. Locais e Unidades Administrativas

| Capacidade | Descrição | Status |
|---|---|---|
| **Consulta de Unidades** | Listagem de unidades administrativas e locais de operação. | ✅ Implementado |

### 7. Dados Complementares

| Capacidade | Descrição | Status |
|---|---|---|
| **AFD (Arquivo Fonte de Dados)** | Geração de arquivos no formato da Portaria 671/MTP para fiscalização. | ✅ Implementado |

### 8. Integração Avançada

| Capacidade | Descrição | Status |
|---|---|---|
| **Webhooks** | Notificações automáticas em tempo real para eventos de ponto (marcações, vínculos). | ✅ Implementado |
| **Importação Incremental** | Sincronização contínua usando último ID importado, evitando retrabalho. | ✅ Implementado |

---

## Tipos de Dados Suportados

### Marcações de Ponto

| Campo | Tipo | Descrição |
|---|---|---|
| Data/Hora | DateTime | Data e hora da marcação |
| Matrícula | String | Identificador do funcionário |
| Número de Série | String | Identificador do relógio |
| Local | String | Local da marcação |
| GPS | String | Coordenadas geográficas |
| NSR | Int | Número Sequencial de Registro (Portaria 671) |
| Tipo de Registro | Int | Tipo da marcação (entrada, saída, intervalo) |

### Funcionários

| Campo | Tipo | Descrição |
|---|---|---|
| Matrícula | String | Identificador único |
| Nome | String | Nome completo |
| CPF | String | CPF do funcionário |
| PIS | String | PIS/PASEP |
| Status | Boolean | Funcionário ativo/inativo |

### Relógios

| Campo | Tipo | Descrição |
|---|---|---|
| Número de Série | String | Identificador único do dispositivo |
| Descrição | String | Nome/descrição do relógio |
| Status | Int | Status (ativo, inativo, pendente) |
| Data de Criação | DateTime | Data de cadastro |

---

## Fluxos de Integração

### Fluxo 1: Importação Inicial de Dados

```
1. Autenticar → Obter token de acesso
2. Consultar funcionários → Sincronizar cadastro completo
3. Consultar relógios → Sincronizar dispositivos
4. Consultar vínculos → Sincronizar relacionamentos
5. Consultar marcações → Importar registros históricos
```

**Frequência:** Uma vez na implantação
**Dados_envolvidos:** Funcionários + Relógios + Vínculos + Marcações históricas

### Fluxo 2: Sincronização Contínua de Marcações

```
1. Autenticar → Obter token de acesso
2. Consultar marcações incrementais → Apenas novas desde última sincronização
3. Processar e armazenar localmente
```

**Frequência:** Diária ou em tempo real (via webhooks)
**Dados envolvidos:** Novas marcações de ponto

### Fluxo 3: Gestão de Vínculos

```
1. Autenticar → Obter token de acesso
2. Visualizar prévia de alterações
3. Aplicar vinculações/desvinculações
4. Sincronizar com API externa
```

**Frequência:** Sob demanda (admissão, desligamento, transferência)
**Dados envolvidos:** Funcionários + Relógios + Vínculos

### Fluxo 4: Geração de Relatórios

```
1. Autenticar → Obter token de acesso
2. Consultar marcações do período
3. Consolidar dados de todas as empresas
4. Gerar relatórios e AFD
```

**Frequência:** Mensal ou conforme necessidade
**Dados envolvidos:** Marcações + Funcionários + Locais

---

## Capacidades Avançadas

### Multi-Empresa

- Suporte a múltiplas empresas com credenciais independentes
- Tokens gerenciados centralmente com renovação automática

### Segurança e Auditoria

- Logs completos de todas as operações

### Performance

- Consultas em paralelo para múltiplos tokens
- Processamento em lotes para operações de grande volume

---

## Requisitos Técnicos

### Para Integração

| Requisito | Especificação |
|---|---|
| Protocolo | HTTPS (TLS 1.2+) |
| Formato | JSON |
| Autenticação | Token temporário via header |
| Encoding | UTF-8 |

### Para Sincronização

| Requisito | Especificação |
|---|---|
| Frequência mínima | Diária |
| Formato de data | DD/MM/YYYY ou ISO 8601 |
| Matrículas | String com zeros à esquerda |
| Números de série | String (pode conter pontos/zeros) |

---

## Compatibilidade com Sistemas de Ponto

Este sistema é compatível com qualquer solução que suporte:

- Autenticação via token/chave de API
- Consulta de marcações de ponto por período
- Gestão de funcionários (CRUD)
- Gestão de dispositivos (relógios/REPs)
- Vínculo funcionário-dispositivo
- Exportação em formato AFD (Portaria 671/MTP)
- Integração via webhooks (tempo real)
- Suporte a múltiplas empresas

---

## Planejamento de Execução no Projeto

Divisão adotada para implementar a integração neste sistema:

| Fase | Escopo | Status |
|---|---|---|
| **Fase 1 — Autenticação e Segurança** | Token por empresa, cache/renovação automática, detecção de token expirado, tratamento de empresas desativadas e remoção de credenciais do frontend. | ✅ **Concluída em 07/11/2026** (commit `725559d`) |
| **Fase 2 — Sincronização de Funcionários e Relógios** | Carga inicial e sincronização de cadastro de funcionários e REPs. | ✅ **Concluída em 07/11/2026** |
| **Fase 3 — Marcações** | Carga histórica por período e sincronização incremental por último ID. | ✅ **Concluída em 09/11/2026** |
| **Fase 4 — Vínculos Funcionário-Relógio** | Vinculação/desvinculação individual e em lote. | ⬜ Pendente |
| **Fase 5 — AFD, Relatórios e Webhooks** | Geração de AFD, relatórios consolidados e notificações em tempo real. | ⬜ Pendente |

**Entregas da Fase 1 já implementadas:**

- `backend/ponto-api.js` centraliza o `StartSession`, classifica erros da API e mantém cache de tokens com TTL configurável (`PONTO_TOKEN_TTL_MS`).
- `GET /api/empresas-config/tokens?force=1` força a renovação dos tokens.
- `PontoApiService` (frontend) detecta token inválido/expirado na resposta, renova a sessão da empresa e repete a operação uma única vez.
- `ApiSessionService` faz renovação periódica com deduplicação de chamadas concorrentes.
- Credenciais do banco e da API externa movidas para `backend/.env` (ignorado pelo git), com modelo em `backend/.env.example`.
- Sessão do portal passou a usar token opaco emitido pelo backend; o código de acesso não é mais gravado em cookie nem enviado ao navegador.
- Credenciais, chave AES e URLs antigas removidas do bundle do frontend.

**Entregas da Fase 2 já implementadas:**

- `backend/ponto-sync.js` faz a carga inicial e a sincronização de funcionários (`ListarFuncionarios`) e relógios/REPs (`RetornaRelogiosInfo`) de todas as empresas ativas ou de uma empresa específica.
- Funcionários existentes são atualizados por matrícula preservando empresa, local, cargo e status local (o status só é alterado com `atualizarStatus: true`).
- Funcionários novos são inseridos com a empresa local definida em `empresas_config.empresa_id` ou por correspondência automática de nome; sem vínculo, entram sem empresa e são contabilizados no resumo.
- Relógios são upsertados pelo número de série normalizado (sem pontos/zeros à esquerda), preservando o controle local de ativo/inativo.
- Novos endpoints: `POST /api/sincronizacao/executar` e `GET /api/sincronizacao/historico`.
- Cada execução é registrada em `sincronizacao_execucao` (status, duração, empresas processadas e resumo em JSON).
- Tela **Configurações → Empresas da API** ganhou os botões *Sincronizar tudo*, *Sincronizar* (por empresa), *Histórico* e o campo de empresa local padrão por conta da API.

**Entregas da Fase 3 já implementadas:**

- `backend/ponto-sync.js` importa marcações via `SelecionaMarcacoes` (carga por período) e `SelecionaMarcacoesPosteriorIdInformado` (incremental pelo último ID) de todas as empresas ativas ou de uma empresa específica.
- A carga por período divide o intervalo em blocos diários (máximo de 3.660 dias por execução) para evitar timeouts da API externa; aceita filtros opcionais de matrícula e número de série do relógio.
- Marcações são gravadas em `marcacoes_ponto` com chave única `(empresa_config_id, marcacao_id)`, em lotes de 500 registros, preservando NSR, GPS, local, tipo de registro, formulário e respostas.
- A empresa local de cada marcação é resolvida pela matrícula em `qrcod_2023`; quando a matrícula não existe ou pertence a mais de uma empresa, usa-se a empresa padrão da conta da API.
- O progresso incremental fica em `marcacao_sync_estado` (`ultimo_id`, data/tipo da última sincronização e total importado). O ID só avança, nunca retrocede.
- Novos endpoints: `POST /api/sincronizacao/marcacoes` (body `empresaConfigIds`, `modo` `periodo`/`incremental`, `dataInicio`, `dataFim`, `matriculaFuncionario`, `numSerieRelogio`) e `GET /api/sincronizacao/marcacoes/status`.
- Tela **Configurações → Empresas da API** ganhou o painel *Marcações de ponto* com formulário de importação por período (filtros de empresa, matrícula e relógio), botão de sincronização incremental, status por empresa (última carga, último ID e total importado) e aviso para a primeira carga.

---

## Observações Importantes

1. **Formato de Datas:** O sistema aceita tanto formato brasileiro (DD/MM/YYYY) quanto ISO (YYYY-MM-DD).

2. **Matrículas:** Devem ser tratadas como strings para preservar zeros à esquerda.

3. **Tokens:** Possuem validade limitada e devem ser renovados periodicamente.

4. **Rate Limiting:** Recomenda-se processar consultas em lotes para evitar sobrecarga.

5. **AFD:** Geração obrigatória para fins de fiscalização conforme Portaria 671/MTP.

---

*Documento gerado automaticamente a partir da análise do sistema de controle de apontamento.*
