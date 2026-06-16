# API Ponto Certificado — Documentação de Integração

> Documentação gerada a partir do WSDL oficial em 10/06/2026, complementada com testes reais
> feitos contra a API. Operações marcadas com ✅ foram testadas ao vivo neste projeto.

- **Base URL:** `https://integrar.pontocertificado.com.br/Api.svc`
- **Tecnologia:** WCF (Windows Communication Foundation) — .NET
- **WSDL:** [`?wsdl`](https://integrar.pontocertificado.com.br/Api.svc?wsdl) | [`?singleWsdl`](https://integrar.pontocertificado.com.br/Api.svc?singleWsdl) (consolidado)
- **Namespace SOAP:** `http://tempuri.org/` (SOAPAction: `http://tempuri.org/IApi/<Operacao>`)

---

## 1. Como consumir

A API expõe **duas interfaces para as mesmas operações**:

### 1.1 JSON (recomendada — usada por este projeto)

Endpoint WCF AJAX-enabled. Cada operação é acessível via:

```
POST https://integrar.pontocertificado.com.br/Api.svc/<NomeDaOperacao>
Content-Type: application/json
```

- O **body** é um objeto JSON com os parâmetros da operação (nomes em camelCase conforme o WSDL).
- A **resposta** vem envelopada em `{ "d": <resultado> }` (padrão ASP.NET AJAX).
- O HTTP status é `200` mesmo para resultados vazios (`{"d":[]}`) e para alguns erros de negócio
  (a mensagem de erro vem como string dentro de `d`).
- Operação inexistente ou método errado → `404` / `405`.

Exemplo real (testado ✅):

```bash
curl -X POST "https://integrar.pontocertificado.com.br/Api.svc/RetornaRelogiosPorMatricula" \
  -H "Content-Type: application/json" \
  -d '{"matricula":"140000117","tokenAcesso":"<token>"}'
# → {"d":[{"DataCriacao":null,"Descricao":null,"Id":0,"NumSerieRelogio":"338101079864","Status":1}]}
```

### 1.2 SOAP 1.1

```
POST https://integrar.pontocertificado.com.br/Api.svc
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://tempuri.org/IApi/<NomeDaOperacao>"
```

Cliente .NET pode ser gerado com `svcutil.exe https://integrar.pontocertificado.com.br/Api.svc?wsdl`.

### 1.3 Convenções gerais

| Convenção | Detalhe |
|---|---|
| Datas em parâmetros | String `dd/MM/yyyy` (ex.: `"01/01/2026"`) |
| Datas em respostas | String `dd/MM/yyyy HH:mm:ss` ou formato .NET `/Date(1700000000000-0300)/` |
| Matrículas | String, frequentemente com zeros à esquerda (ex.: `"000000000001"`). Comparações devem normalizar |
| Números de série de relógio | String; pode vir com pontos/zeros à esquerda dependendo da operação |
| Token | String longa (~1150 chars), obtida via `StartSession`, enviada no campo `tokenAcesso` de cada chamada |
| Campos vazios | A API frequentemente retorna `null` em campos não preenchidos pela operação (ver notas por operação) |

---

## 2. Autenticação

### `StartSession` ✅

Obtém o token de acesso usado por todas as demais operações.

**Request:**

```json
{ "chaveEmpresa": "<chave>", "usuario": "<email>", "senha": "<senha>" }
```

**Response:** `{ "d": "<tokenAcesso>" }` — string com ~1150 caracteres.

⚠️ **Erros vêm como string em `d` com HTTP 200.** Mensagens conhecidas (verificadas no
`backend/server.js`): contém `"desativada"`, `"contate o suporte"`, `"não encontrada"`,
`"inválido"/"inválida"` ou `"expirado"`. Cheque por palavras-chave, não pelo formato.

### `StartSessionParceiros`

Mesma mecânica, para contas de parceiro: `{ "chaveParceiro", "usuario", "senha" }` → `{ "d": "<tokenAcessoParceiro>" }`.
O token de parceiro é usado em `ListarEmpresas` e `ListarFuncionariosComPontoBatido`.

### `LoginCheck`

Valida credenciais sem criar sessão: `{ "usuario", "senha" }` → `{ "d": true|false }`.

---

## 3. Operações por categoria

### 3.1 Funcionários / Trabalhadores

| Operação | Request | Response (`d`) |
|---|---|---|
| `ListarFuncionarios` ✅ | `{ tokenAcesso }` | `Funcionario[]` (ver §4.1) |
| `SelecionaFuncionarioCategoria` ✅ | `{ dataAtualizacao, tokenAcesso }` | `FuncionarioCategoriaInfo[]` (ver §4.2) |
| `SelecionaTrabalhadores` | `{ dataAtualizacao, tokenAcesso }` | `TrabalhadorBHInfo[]` (ver §4.3) |
| `InserirAtualizarFuncionario` | `{ lstFuncionario: Funcionario[], tokenAcesso }` | `string[]` (mensagens por item) |
| `InserirAtualizarFuncionarioAsync` | idem | `string[]` |
| `DesabilitarFuncionarios` | `{ lstMatriculas: string[], tokenAcesso }` | `string[]` |
| `AtivarFuncionarios` | `{ lstMatriculas: string[], tokenAcesso }` | `string[]` |
| `InserirAtualizarTrabalhadorApto` | `{ cpf, apto: bool, tokenAcesso }` | `string` |
| `SelecionaCargoFuncao` | `{ dataAtualizacao, tokenAcesso }` | `CargoFuncaoInfo[]` (`Id`, `Descricao`, `UpdateDate`) |
| `SelecionaDepartamentos` | `{ dataAtualizacao, tokenAcesso }` | `DepartamentoBHInfo[]` (`Id`, `Descricao`, `UpdateDate`) |
| `SelecionaCategoriaAtividade` | `{ dataAtualizacao, tokenAcesso }` | `CategoriaAtividade[]` (`CodCategoria`, `CodAtividade`, `Atividade`, `StatusAtividade`, `FlagForaCerca`) |

**Notas de teste (✅):**
- `ListarFuncionarios` retornou 2.144 funcionários para a empresa DNP/São João só com o token.
  Campos efetivamente preenchidos: `Id`, `Matricula`, `Nome`, `Cpf`, `Pis`, `Ativo`. Os demais
  (`Cargo`, `Departamento`, `Email`, `DataAdmissao`...) vieram `null`.
- `SelecionaFuncionarioCategoria` com `dataAtualizacao: ""` retornou **0 itens**; com data antiga
  (`"01/01/2020"`) retornou todos. O parâmetro filtra por data de atualização — use uma data antiga
  para carga completa. **Não retorna nome do funcionário**, só `Matricula` + status.

### 3.2 Relógios (REPs)

| Operação | Request | Response (`d`) |
|---|---|---|
| `RetornaRelogiosInfo` ✅ | `{ tokenAcesso, datainicio, datafim, status }` | `RelogioStatus[]` (ver §4.4) |
| `RetornaRelogios` | `{ tokenAcesso }` | `RelogioStatus[]` |
| `RetornaRelogiosPorMatricula` ✅ | `{ matricula, tokenAcesso }` | `RelogioStatus[]` — **relógios vinculados à matrícula** |
| `NumeroSerieRelogio` | `{ tokenAcesso }` | `string[]` (só números de série) |
| `insereRelogio` | `{ lstRelogio: Relogio[], tokenAcesso }` | `string[]` (ver §4.5 para o tipo `Relogio`) |
| `vinculaFuncionarioRelogio` | `{ lstFuncRel: VinculoFuncionarioRelogio[], tokenAcesso }` | `string[]` |
| `VinculaFuncionarioRelogioPorLista` | `{ vinculosFuncionarioRelogio: VinculosFuncionarioRelogio[], tokenAcesso }` | `string[]` |

**Tipos de vínculo:**

```ts
// vinculaFuncionarioRelogio — um vínculo por item
VinculoFuncionarioRelogio { MatriculaFuncionario: string, NumSerieRelogio: string, Status: boolean }

// VinculaFuncionarioRelogioPorLista — produto cartesiano matrículas × relógios
VinculosFuncionarioRelogio { MatriculasFuncionarios: string[], NumerosSerieRelogios: string[], Vincular: boolean }
```

**Notas de teste (✅):**
- `RetornaRelogiosInfo` com `{ datainicio: "01/01/2020", datafim: "31/12/2030", status: "4" }`
  (status 4 = Todos) retornou 368 relógios com **todos** os campos preenchidos:
  `{"DataCriacao":"09/03/2021 06:34:49","Descricao":"SINALIZACAO - RILDO","Id":696608,"NumSerieRelogio":"19140696608","Status":1}`.
- `RetornaRelogiosPorMatricula` preenche **apenas** `NumSerieRelogio` e `Status` (vínculo);
  `DataCriacao`, `Descricao` e `Id` vêm `null`/`0`. Para descrição do relógio, cruze com
  `RetornaRelogiosInfo` pelo número de série. Matrícula sem vínculo → `{"d":[]}` (HTTP 200).

### 3.3 Marcações de ponto

Todas retornam `Marcacao[]` (ver §4.6), exceto onde indicado.

| Operação | Request | Observação |
|---|---|---|
| `SelecionaMarcacoes` ✅ | `{ numSerieRelogio, matriculaFuncionario, dataInicio, dataFim, tokenAcesso }` | Filtros opcionais (string vazia = todos). Usada por este projeto |
| `SelecionaMarcacoesAntigo` | idem | Variante legada |
| `SelecionaMarcacoesRumo` / `SelecionaMarcacoesTeste` | idem | Variantes específicas de cliente |
| `SelecionaMarcacoesPosteriorIdInformado` | `{ ultIdImportado: int, tokenAcesso }` | Incremental — marcações com `id` > informado |
| `SelecionaMarcacoesPosteriorIdInformadoAntigo` / `...Rumo` | idem | Variantes |
| `SelecionaMarcacoesPosteriorIdInformadoStefanini` | idem | Retorna `MarcacaoStefanini[]` (= `Marcacao` sem `RespostaFormulario`) |
| `SelecionaMarcacoesDeclaracoesPosteriorIdInformado` | `{ ultIdMarcacaoImportado: int, ultIdDeclaracaoImportado: int, tokenAcesso }` | Marcações + declarações incrementais |
| `SelecionaMarcacoesMatriculasInformado` | `{ Matriculas: string[], tokenAcesso }` | Retorna `MarcacaoStefanini[]` |
| `SelecionaMarcacaoPorIDLimite` | `{ idMarcacao: int, quantidade: int, tokenAcesso }` | Paginação por ID |
| `SelecionaMarcacaoPorIDLimiteAntigo` | idem | Variante legada |
| `RetornaRespostaFormularioPorMarcacao` | `{ MarcacaoId: int, tokenAcesso }` | Retorna `RetornoFormulario` (`Data`, `DataOrigem`, `MarcacaoId`, `MarcacaoOrigemId`, `Mensagem`) |
| `RetornaSelfieEmpresaIdUltimoSelfieId` | `{ ultimoSelfieId: int, tokenAcesso }` | Retorna `SelfieContract[]` (selfies das marcações, incremental) |

**Recepção de dados (sentido relógio → servidor):**

| Operação | Request | Response |
|---|---|---|
| `RecebeMatricula` | `{ matric, clock }` | `HttpStatusCode` (string, ex. `"OK"`) |
| `RecebeInputs` | `{ data_start, data_end, text, label, clock, file, matric, trab }` | `HttpStatusCode` |
| `RecebeEscala` | `{ escala: EscalaViewModel, tokenAcesso }` | `string` |

```ts
EscalaViewModel { Id: int, CnpjEmpresa, CpfTrabalhador, Data, Entrada, IntervaloInicial, IntervaloFinal, Saida, Mensagem }
```

### 3.4 AFD (Arquivo Fonte de Dados — Portaria 671/MTP)

Todas retornam `{ "d": "<conteúdo do AFD como string>" }`.

| Operação | Request |
|---|---|
| `GeraAFD` | `{ numeroSerie, dataInicial, dataFinal, tokenAcesso }` |
| `GeraAFDUnico` | `{ dataInicial, dataFinal, tokenAcesso, numeroRelogioCabecalho }` — AFD único de todos os relógios |
| `GeraAFDmodeloREPP` | `{ dataInicial, dataFinal, tokenAcesso }` |
| `GeraAFDmodeloREPA` | `{ inicioBusca, fimBusca, tokenAcesso }` |
| `GeraAFDDataRecepcao` | `{ numeroSerie, dataInicial, dataFinal, tokenAcesso }` — filtra pela data de recepção |

### 3.5 Unidades administrativas / Locais

| Operação | Request | Response (`d`) |
|---|---|---|
| `ListarUnidadeAdministrativa` ✅ | `{ tokenAcesso }` | `LocalDeOperacaoContract[]` — `{ Id, Descricao, DescricaoEmpresa, Hierarquia, CpfCnpj, UsuarioEmail }` |
| `InserirAtualizarUnidadeAdministrativa` | `{ lstUnidade: LocalDeOperacaoInfo[], tokenAcesso }` | `string[]` |
| `IncluiUnidadeAdministrativa` | `{ unidadePai, descricaoUnidade, listaEmails: string[], tokenAcesso }` | `string` |
| `ExcluiUnidadesAdministrativas` | `{ tokenAcesso }` | `string` ⚠️ exclui em massa — usar com cuidado |

### 3.6 Cercas (geofencing)

| Operação | Request | Response (`d`) |
|---|---|---|
| `ListarCercas` | `{ tokenAcesso }` | `CercaContract[]` — `{ IdCerca, NomeCerca, DescricaoCerca, Tipo, Latitude, Longitude, Raio, IdLocal, Local, StatusCerca, StatusLocal }` |
| `ListarFuncionariosCercas` | `{ tokenAcesso }` | `CercaFuncionario[]` — `{ IdCerca, NomeCerca, DescricaoCerca, Matriula (sic), Status }` |

> Nota: o campo `Matriula` da `CercaFuncionario` está com typo no contrato oficial.

### 3.7 Empresas / Usuários do portal

| Operação | Request | Response (`d`) |
|---|---|---|
| `CadastraEmpresa` | `{ cnpjCpf, nomeEmpresa, nome, email, indicacao, tokenAcesso }` | `string` |
| `CadastraEmpresaNovo` | `{ nomeEmpresa, nome, email, senha, confirmeSenha, telefone, indicacao, tokenAcesso }` | `string` |
| `CadastraEmpresaParceiro` | `{ cnpjCpf, nomeEmpresa, nome, email, indicacao, senhaDeAcesso, tokenAcesso, disparaEmailSenha: bool, autoAtivarRelogios: bool }` | `string` |
| `CriaChaveEmpresa` | `{ usuario, senha, cnpj, tokenAcesso }` | `string` (chave da empresa) |
| `RetornaDadosEmpresaComJson` | `{ idEmpresa: int }` | `string[]` (campo `RetornaDadosEmpresaComJsonResult`) |
| `AlteraSenhaPortal` | `{ cnpjCpf, email, novaSenha, tokenAcesso }` | `string` |
| `InseriUsuario` | `{ email, privilegio, recebeEmail: bool, tokenAcesso }` | `string` |
| `InsereOuAtualizaUsuario` | `{ email, privilegio, recebeEmail: bool, tokenAcesso, situacao: bool }` | `string` |
| `AtualizaStatusPorPrivilegio` | `{ privilegio, tokenAcesso, situacao: bool }` | `string` |
| `ListarEmpresas` | `{ tokenAcessoParceiro }` | `EmpresaCNPJ[]` — `{ CNPJ, Nome }` (token de **parceiro**) |
| `ListarFuncionariosComPontoBatido` | `{ cnpj, tokenAcessoParceiro }` | `FuncionarioCPF[]` — `{ CPF, Matricula, Nome }` (token de **parceiro**) |

### 3.8 Afastamentos e justificativas

| Operação | Request | Response (`d`) |
|---|---|---|
| `InserirAfastamento` | `{ descricaoAfastamento, inicioAfastamento, terminoAfastamento, listaTrabalhador: string[], tokenAcesso }` | `string` |
| `RetornaJustificativaInfo` | `{ tokenAcesso, datainicio, datafim }` | `InputStatus[]` — `{ NumRelogio, NomeRelog, MatriculaTrab, NomeTrab, PisTrab, Label, Texto, File, Dataini, Datafim, Datacri, NomeEmpresa, CpfCnpjEmpresa }` |

### 3.9 Webhooks

Tipos de retorno: `WebhookResponse { id: int, publisher, secret, webhookType, webhookURI }`.

| Operação | Request | Response (`d`) |
|---|---|---|
| `WebhookSubscription` | `{ webhookURI, webhookType, tokenAcesso }` | `WebhookResponse` (guarde o `secret`) |
| `GetSubscriptions` | `{ tokenAcesso }` | `WebhookResponse[]` |
| `GetSubscriptionBySecret` | `{ secret, tokenAcesso }` | `WebhookResponse` |
| `UpdateWebhookURI` | `{ secret, webhookURI, tokenAcesso }` | `WebhookResponse` |

### 3.10 Utilitários

| Operação | Request | Response |
|---|---|---|
| `VersionApi` | `{}` | `{ "VersionApiResult": "<versão>" }` ⚠️ sem envelope `d` |
| `GetDb` | `{}` | `{ "GetDbResult": "<nome do banco>" }` ⚠️ sem envelope `d` |
| `Encrypt` | `{ dataList: string[], key }` | `{ "EncryptResult": [{ "Key": "...", "Value": "..." }] }` ⚠️ sem envelope `d` |

---

## 4. Tipos de dados (DataContracts)

### 4.1 `Funcionario` (WcfApi)

Retornado por `ListarFuncionarios`; enviado em `InserirAtualizarFuncionario`.

```ts
{
  Id: int,
  Matricula: string,
  Nome: string,
  Cpf: string,
  Pis: string,
  Ativo: boolean,
  FuncionarioAtivo: boolean | null,
  Cargo: string | null,
  Departamento: string | null,
  Email: string | null,
  DataAdmissao: string | null,
  DataNascimento: string | null,
  CargaHorariaMaxima: double,
  CodigoUnidade: string | null,
  UnidadeAdministrativa: string | null,
  ControleAcesso: boolean,
  WebMarcacao: boolean | null,
  TipoVinculo: int,
  Sexo: char,
  Fuso: string | null,
  Senha: string | null,
  SenhaCriptografada: string | null,
  NumeroCtps: string | null,
  NumeroSerieCtps: string | null,
  UfCtps: string | null,
  Foto: base64 | null,
  FotoBase64: string | null
}
```

### 4.2 `FuncionarioCategoriaInfo` (Entidade.Models)

Retornado por `SelecionaFuncionarioCategoria`.

```ts
{
  Matricula: string,
  Categoria: string,
  CodCategoria: int,
  StatusCategoria: int,
  StatusFuncionario: int,   // 1 = ativo (convenção usada neste projeto)
  UpdateDate: "/Date(...)/" // herdado de BaseInfo
}
```

### 4.3 `TrabalhadorBHInfo` (Entidade.Models)

Retornado por `SelecionaTrabalhadores`.

```ts
{
  Nome: string, Cpf: string, Pis: string, Email: string,
  TrabalhadorEmpresaMatricula: string, TrabalhadorEmpresaVinculo: int,
  CargoEFuncaoId: int, CargoEFuncaoNome: string,
  DepartamentoId: int, DepartamentoNome: string,
  DataAdmissao: dateTime, Status: int, Idioma: string,
  UpdateDate: dateTime
}
```

### 4.4 `RelogioStatus` (WcfApi)

Retornado por `RetornaRelogios`, `RetornaRelogiosInfo` e `RetornaRelogiosPorMatricula`.

```ts
{
  Id: int,                 // null/0 em RetornaRelogiosPorMatricula
  NumSerieRelogio: string,
  Descricao: string,       // null em RetornaRelogiosPorMatricula
  DataCriacao: string,     // "dd/MM/yyyy HH:mm:ss"; null em RetornaRelogiosPorMatricula
  Status: StatusRelogionEnum (int)
}
```

### 4.5 `Relogio` (WcfApi)

Enviado em `insereRelogio` (cadastro de relógio/ponto virtual).

```ts
{
  Nome: string, Responsavel: string, Senha: string,
  TipoEndereco: string, Logradouro: string, Numero: string, Bairro: string,
  Cidade: string, Uf: string, Cep: string, UnidadeAdm: string,
  Gps: boolean, QRCode: boolean, RecFacial: boolean, Selfie: boolean,
  SelfieMoldura: boolean, SelfiWifi: boolean, EsqueciCracha: boolean
}
```

### 4.6 `Marcacao` (Entidade.Models)

Retornado pelas operações `SelecionaMarcacoes*`.

```ts
{
  id: int,                       // ID sequencial — usado nas consultas incrementais
  NSR: int,                      // Número Sequencial de Registro (Portaria 671)
  DataMarcacao: dateTime,
  DataInsercao: dateTime,        // quando chegou ao servidor
  MatriculaFuncionario: string,
  CPF: string, PIS: string, TrabalhadorId: int,
  NumSerieRelogio: string,
  TipoRegistro: int,
  IdLocal: int, NomeLocal: string, DescricaoLocal: string, CodigoUnidade: string,
  GPSLatitude: string, GPSLongitude: string, FlagForaCerca: boolean,
  Atividade: string,
  Formulario: string, RespostaFormulario: string,
  LstRespostas: [{ Campo: string, Valor: string }]
}
```

`MarcacaoStefanini` = `Marcacao` sem o campo `RespostaFormulario`.

### 4.7 `SelfieContract` (WcfApi)

```ts
{
  SelfieIdentificacao: int, SelfieCaminho: string, SelfieSimilaridade: string,
  EmpresaTrabalhadorMatricula: string, TrabalhadorDescricao: string,
  CategoriaDescricao: string, DataMarcacao: string, HoraMarcacao: string
}
```

---

## 5. Enums

### `StatusRelogionEnum` (campo `Status` de `RelogioStatus`)

| Valor | Nome | Significado |
|---|---|---|
| -1 | `Excluso` | Excluído |
| 0 | `AAtivar` | Aguardando ativação |
| 1 | `Ativo` | Ativo |
| 2 | `Inativo` | Inativo |
| 3 | `NaoAtivado` | Não ativado |
| 4 | `Todos` | Usado **como filtro** no parâmetro `status` de `RetornaRelogiosInfo` |

> Atenção: este projeto trata `status === 4` na UI de relógios como "Online" porque consulta
> `RetornaRelogiosInfo` com filtro `"4"` — não confundir o valor de filtro com o status do registro.

### `HttpStatusCode` (`RecebeMatricula`, `RecebeInputs`)

Enum padrão do .NET serializado como string (`"OK"`, `"Created"`, `"BadRequest"`, ...).

---

## 6. Receitas prontas (testadas ✅)

### Descobrir em quais relógios cada funcionário está cadastrado/ativo

```text
1. StartSession                      → token
2. ListarFuncionarios                → lista de matrículas (+ nome, CPF, PIS)
3. RetornaRelogiosPorMatricula       → por matrícula: [{ NumSerieRelogio, Status }]
4. RetornaRelogiosInfo (status "4")  → catálogo de relógios (join por NumSerieRelogio
                                       para obter Descricao/DataCriacao)
```

Exemplo real: matrícula `140000117` → relógio `338101079864`, `Status: 1` (Ativo).

### Carga completa de funcionários com categoria

```json
POST /Api.svc/SelecionaFuncionarioCategoria
{ "dataAtualizacao": "01/01/2020", "tokenAcesso": "<token>" }
```

(`dataAtualizacao` vazia retorna 0 itens — sempre informe uma data antiga para full load.)

### Importação incremental de marcações

Guarde o maior `id` importado e chame `SelecionaMarcacoesPosteriorIdInformado` com `ultIdImportado`.

---

## 7. Como este projeto consome a API

- **Proxy:** o frontend chama `/api/<Operacao>`, reescrito para `/Api.svc/<Operacao>`
  (dev: `src/proxy.conf.json`; produção: `backend/server.js`, que também diferencia rotas locais).
- **Tokens:** `GET /api/empresas-config/tokens` (backend) faz `StartSession` para cada empresa
  ativa cadastrada no MySQL e devolve os tokens; o frontend itera todos os tokens em cada consulta
  e deduplica os resultados.
- **Operações usadas:** `StartSession`, `SelecionaMarcacoes`, `RetornaRelogiosInfo`,
  `ListarUnidadeAdministrativa`, `SelecionaFuncionarioCategoria`, `RetornaRelogiosPorMatricula`
  (URLs em `src/environments/environment*.ts`).

---

## 8. Lista completa de operações (índice)

`SelecionaTrabalhadores` · `SelecionaCargoFuncao` · `SelecionaDepartamentos` ·
`InserirAtualizarFuncionario` · `InserirAtualizarFuncionarioAsync` · `LoginCheck` ·
`RecebeMatricula` · `RecebeInputs` · `DesabilitarFuncionarios` · `AtivarFuncionarios` ·
`StartSession` · `StartSessionParceiros` · `Encrypt` · `CadastraEmpresa` · `AlteraSenhaPortal` ·
`CadastraEmpresaParceiro` · `CadastraEmpresaNovo` · `SelecionaMarcacoes` ·
`SelecionaMarcacoesAntigo` · `SelecionaMarcacoesRumo` · `SelecionaMarcacoesTeste` ·
`SelecionaMarcacoesPosteriorIdInformado` · `SelecionaMarcacoesPosteriorIdInformadoAntigo` ·
`SelecionaMarcacoesDeclaracoesPosteriorIdInformado` · `SelecionaMarcacoesPosteriorIdInformadoRumo` ·
`SelecionaMarcacoesPosteriorIdInformadoStefanini` · `SelecionaMarcacoesMatriculasInformado` ·
`SelecionaMarcacaoPorIDLimite` · `SelecionaMarcacaoPorIDLimiteAntigo` · `NumeroSerieRelogio` ·
`RetornaRelogios` · `GeraAFDUnico` · `GeraAFD` · `GeraAFDmodeloREPP` · `GeraAFDmodeloREPA` ·
`GeraAFDDataRecepcao` · `SelecionaFuncionarioCategoria` · `SelecionaCategoriaAtividade` ·
`InserirAtualizarUnidadeAdministrativa` · `ListarUnidadeAdministrativa` · `ListarFuncionarios` ·
`ListarFuncionariosCercas` · `ListarCercas` · `CriaChaveEmpresa` ·
`RetornaSelfieEmpresaIdUltimoSelfieId` · `RetornaDadosEmpresaComJson` · `insereRelogio` ·
`VinculaFuncionarioRelogioPorLista` · `vinculaFuncionarioRelogio` · `RetornaRelogiosPorMatricula` ·
`RetornaRelogiosInfo` · `RetornaJustificativaInfo` · `VersionApi` · `GetDb` ·
`ExcluiUnidadesAdministrativas` · `InseriUsuario` · `InsereOuAtualizaUsuario` ·
`AtualizaStatusPorPrivilegio` · `IncluiUnidadeAdministrativa` · `InserirAfastamento` ·
`RecebeEscala` · `WebhookSubscription` · `GetSubscriptionBySecret` · `UpdateWebhookURI` ·
`GetSubscriptions` · `InserirAtualizarTrabalhadorApto` · `RetornaRespostaFormularioPorMarcacao` ·
`ListarEmpresas` · `ListarFuncionariosComPontoBatido`
