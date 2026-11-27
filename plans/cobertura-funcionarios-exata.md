# Plano — Deixar claro quais funcionários a ExataWeb retorna e quais não estão no cadastro local

> **Status:** Fases 1 e 2 implementadas; Fase 3 parcial (edição/cadastro pela cobertura)
> **Criado em:** 27/11/2026
> **Escopo:** diagnóstico somente leitura + plano de implementação
> **Arquivos-chave:** `backend/exata-sync.js`, `backend/exata-schema.js`, `backend/server.js`,
> `src/app/feature/configuracoes/empresas/empresas-config.{ts,html}`,
> `src/app/core/services/sincronizacao/sincronizacao.service.ts`

---

## 1. O que a API devolve hoje

`GET /integra/v1/protected/funcionarios/{empresa}` devolve **a lista de funcionários ativos da empresa**
(PDF ExataWeb V12, p. 4). Os campos úteis para conferência são:

| Campo da API | Uso |
|---|---|
| `matricula` | chave usada hoje para casar com o banco local |
| `nome` | conferência visual / divergência de nome |
| `cpf`, `pis` | conferência; **não existem em `qrcod_2023`** |
| `admissao` | conferência |
| `codErp`, `centroCusto`, `codSetor`, `codFuncao` | conferência de dados cadastrais |
| `status` / `ativo` | indica se o funcionário está ativo na Exata |

O backend já persiste tudo em `funcionario_exata`
(`backend/exata-sync.js:185` e `backend/exata-schema.js:101`), com a chave
`(empresa_config_id, empresasistema, matricula)`.

## 2. O que é “cadastrado no meu banco”

O cadastro local usado pelo sistema (relatórios, pontos, exportações) é a tabela
**`qrcod_2023`**. Ela é gerenciada pela tela de funcionários
(`backend/server.js:1063` para inserir, `:1135` para editar, `:1178` para excluir).

Situação atual da tabela:

- `matricula VARCHAR(20)`, `nome`, `cargo`, `local`, `ativo`, `empresa_id`,
  `data_admissao`, `bate_ponto`;
- **não** tem `cpf`/`pis`;
- **não** tem índice em `matricula` (só a `PRIMARY KEY` em `id`);
- a mesma matrícula pode aparecer mais de uma vez (hoje há duplicidades reais).

O elo entre as duas bases é **apenas a matrícula + empresa**. É exatamente aí que a
visão atual se perde.

## 3. Por que hoje não dá para enxergar o que falta

1. `espelharFuncionariosLocais` (`backend/exata-sync.js:883`) **cria automaticamente**
   uma linha em `qrcod_2023` para toda matrícula que ainda não exista em nenhuma
   empresa local. Ou seja: o “faltante” deixa de faltar sem ninguém conferir.
2. O espelho só é criado quando a empresa da Exata está mapeada para uma empresa local;
   caso contrário, o funcionário é apenas contado em `sem_empresa_local` no resumo da
   execução e **não fica registrado em lugar nenhum**.
3. O casamento é feito **só pela matrícula**, ignorando a empresa. Se a matrícula existe
   em outra empresa local, ela é considerada “existente” e não entra no espelho — mas
   também não aparece na empresa correta.
4. `total_funcionarios` na tela de empresas da Exata
   (`backend/exata-sync.js:595`) é a contagem de `funcionario_exata`, **não** a cobertura
   local.
5. Não existe endpoint, tela, CSV ou alerta que responda a pergunta “quais funcionários
   a API devolve e eu não tenho cadastrados?”.

### Diagnóstico real da base neste momento

Comparando `funcionario_exata` (669 registros) com `qrcod_2023` (1.745):

| Situação encontrada | Total |
|---|---|
| Funcionário da Exata sem **nenhuma** matrícula local | **0** |
| Matrícula local existe, mas em **outra empresa** | **175** |
| Matrícula local existe com `empresa_id` **NULL** | **27** |
| Linhas locais com cara de **espelho automático** (`cargo`, `local` e `data_admissao` vazios) | **35** |
| Exata ativo, mas registro local **inativo** | **43** |
| **Nome divergente** entre Exata e local | **18** |
| Matrículas duplicadas no `qrcod_2023` | várias |

Conclusão: o problema real não é “matrícula inexistente”, e sim **matrícula existindo em
empresa errada / sem empresa / inativa / espelhada automaticamente**. A visão precisa
mostrar isso, não apenas “existe/não existe”.

---

## 4. Proposta

Criar um **relatório de cobertura de funcionários** (somente leitura) que classifica cada
funcionário retornado pela Exata em relação ao `qrcod_2023`, com resumo, filtros, tabela
na tela e exportação CSV.

### 4.1 Classificação proposta

`situacao_cadastro` (uma por funcionário):

| Situação | Regra |
|---|---|
| `CADASTRADO` | existe linha local com a mesma matrícula **e** `empresa_id` igual à empresa local mapeada da Exata |
| `CADASTRADO_SEM_EMPRESA` | existe uma única linha local com a matrícula, mas `empresa_id` está `NULL` |
| `OUTRA_EMPRESA` | existe linha local com a matrícula, mas em outra empresa |
| `AMBIGUO` | existem várias linhas locais e nenhuma na empresa mapeada (ou mais de uma na mesma empresa) |
| `NAO_CADASTRADO` | não existe nenhuma linha local com a matrícula |
| `EMPRESA_NAO_MAPEADA` | a empresa da Exata não tem `empresa_id`; a cobertura não pode ser avaliada |

Alertas adicionais (independentes da situação):

| Alerta | Regra |
|---|---|
| `inativo_local` | linha local com `ativo = 0` |
| `nome_divergente` | nome normalizado diferente do nome da Exata |
| `possivel_espelho` | linha local com `cargo`, `local` e `data_admissao` vazios — provável criação automática |
| `duplicado` | mais de uma linha local para a mesma matrícula |
| `empresa_local_nula` | `empresa_id` da linha local é `NULL` |

Essa separação evita combinações infinitas e deixa claro **o que fazer** em cada caso.

### 4.2 Chave de casamento

1. Normalizar matrícula como string (`trim`, preservando zeros à esquerda) dos dois lados.
2. Empresa local da Exata = `empresas_exata.empresa_id`.
3. Buscar linhas locais por `matricula IN (...)` em lotes de 500 (padrão já usado no
   projeto) e resolver em JavaScript.
4. **Não** usar `TRIM(qrcod_2023.matricula)` no `WHERE` (impede uso de índice); normalizar
   em memória.
5. `cpf`/`pis` ficam apenas como informação de conferência, porque não existem no
   `qrcod_2023`.

---

## 5. Implementação em fases

### Fase 1 — Relatório de cobertura (somente leitura) — **prioridade**

**Backend (`backend/exata-sync.js`)**

Adicionar (dentro de `createExataSync`):

```js
async function relatorioCoberturaFuncionarios({
  empresasExataIds,
  situacao,        // filtra uma situação
  busca,           // matrícula, nome Exata ou nome local
  pagina = 1,
  porPagina = 50,
} = {})
```

Fluxo:

1. Carregar `empresas_exata` da conta (`id`, `empresasistema`, `descricao`, `empresa_id`)
   e o nome de cada empresa local (`empresas`).
2. Carregar `funcionario_exata` dessas empresas.
3. Carregar as linhas locais por matrícula em lotes:
   ```sql
   SELECT id, matricula, empresa_id, empresa, nome, cargo, local, ativo, data_admissao
     FROM qrcod_2023
    WHERE matricula IN (?)
   ```
4. Classificar cada funcionário conforme a seção 4.1.
5. Montar:
   ```js
   {
     success,
     resumo: {
       total,
       porSituacao: { CADASTRADO, CADASTRADO_SEM_EMPRESA, OUTRA_EMPRESA, AMBIGUO, NAO_CADASTRADO, EMPRESA_NAO_MAPEADA },
       alertas: { inativo_local, nome_divergente, possivel_espelho, duplicado },
       porEmpresa: [{ empresa_exata_id, empresasistema, descricao, total, nao_cadastrado, outra_empresa, sem_empresa_local, inativo_local }],
     },
     funcionarios: [{
       empresa_exata_id, empresasistema, empresa_exata, empresa_local_id, empresa_local_nome,
       matricula, nome_exata, nome_local, ativo_local, situacao_cadastro,
       alertas: [...],
       local: { id, empresa_id, empresa, cargo, local, data_admissao, ativo } | null,
     }],
     paginacao: { pagina, porPagina, total, totalPaginas },
   }
   ```
6. Exportar também uma função pura `classificarCoberturaFuncionario(funcionario, empresa, linhasLocais)`
   para testar sem banco.

Adicionar `gerarCsvCoberturaFuncionarios(resultado)` no mesmo padrão de
`gerarCsvValidacao` (`backend/exata-sync.js:347`), com colunas:

```
Matrícula;Nome Exata;Empresa Exata;Empresasistema;Situação;Empresa Local;Ativo Local;
Nome Local;Cargo;Local;Admissão Local;Alertas
```

**Endpoint (`backend/server.js`)**

```http
GET /api/sincronizacao/exata/funcionarios/cobertura
  ?empresasExataIds=1,2
  &situacao=NAO_CADASTRADO
  &busca=texto
  &pagina=1&porPagina=50
  &formato=json|csv
```

- `formato=csv` devolve `text/csv` com BOM (`\uFEFF`), igual à validação existente
  (`backend/server.js:2243`).
- Validação: `empresasExataIds` como CSV de inteiros, `situacao` na lista permitida,
  `porPagina` limitado (ex.: 1..200).

**Script CLI (`backend/scripts/exata-cobertura.js`)**

Útil para conferir sem abrir a tela:

```bash
node backend/scripts/exata-cobertura.js            # resumo + lista de pendências
node backend/scripts/exata-cobertura.js --csv      # exporta CSV
node backend/scripts/exata-cobertura.js --situacao OUTRA_EMPRESA
```

**Registrar no histórico de execução**

Em `sincronizarFuncionarios`, calcular a cobertura **antes** de chamar
`espelharFuncionariosLocais` e guardar no `resumo` da execução:

```js
resumo.cobertura = {
  cadastrados, naoCadastrados, outraEmpresa, semEmpresaLocal,
  inativoLocal, nomeDivergente, possivelEspelho,
}
```

Assim o histórico de `sincronizacao_execucao` mostra a evolução mesmo que a tela não seja
aberta.

### Fase 2 — Tornar o espelho automático explícito — **recomendada**

Sem isso, a Fase 1 mostra “cadastrado” para os 35 registros que a própria integração criou.

1. Adicionar coluna idempotente em `qrcod_2023`:
   ```sql
   ALTER TABLE qrcod_2023 ADD COLUMN origem_exata TINYINT(1) NOT NULL DEFAULT 0;
   ALTER TABLE qrcod_2023 ADD INDEX idx_qrcod_matricula (matricula);
   ALTER TABLE qrcod_2023 ADD INDEX idx_qrcod_empresa (empresa_id);
   ```
   Fazer no mesmo bloco de migrações idempotentes de `server.js` (perto das linhas
   183–200/277–288).
2. `espelharFuncionariosLocais` passa a gravar `origem_exata = 1`.
3. O relatório usa `origem_exata` em vez da heurística de campos vazios para o alerta
   `possivel_espelho`.
4. Script de regularização do histórico
   (`backend/scripts/exata-marcar-espelhos.js`): lista os candidatos antigos
   (`cargo`, `local` e `data_admissao` vazios + matrícula presente em `funcionario_exata`),
   mostra o que será alterado e só aplica com `--aplicar`.
5. **Decisão de produto:** manter a criação automática ou torná-la opt-in.
   - Recomendação: `EXATA_ESPELHAR_FUNCIONARIOS=0` como padrão e um checkbox explícito
     “Criar automaticamente funcionários ausentes” na tela.
   - Com isso, novos funcionários aparecem como `NAO_CADASTRADO` até alguém decidir
     cadastrá-los — que é exatamente a visibilidade pedida.
   - Se preferir manter o comportamento atual, basta manter o padrão `1`; o relatório
     continuará mostrando os espelhados com o alerta.

### Fase 3 — Tela na aba ExataWeb

Em `src/app/feature/configuracoes/empresas/empresas-config.html`, depois da tabela de
empresas da Exata, adicionar um `<details class="subcard">` “Cobertura de funcionários”,
seguindo o padrão do bloco “Marcações de ponto”.

Conteúdo:

1. **Resumo em chips** (reaproveitando `.resumo-strip`):
   - `{{ total }} na API`;
   - `{{ CADASTRADO }} cadastrados`;
   - `{{ NAO_CADASTRADO }} não cadastrados` (destaque de alerta);
   - `{{ OUTRA_EMPRESA }} em outra empresa`;
   - `{{ EMPRESA_NAO_MAPEADA }} empresa não mapeada`;
   - `{{ inativo_local }} inativos no cadastro local`.
2. **Filtros:** empresa Exata, situação e busca por matrícula/nome.
3. **Tabela paginada:**
   `Matrícula | Nome (Exata) | Empresa Exata | Empresa local | Situação | Alertas | Ações`.
4. **Ações por linha (Fase 3 opcional):**
   - `Cadastrar no banco local` → abre formulário pré-preenchido
     (matrícula, nome, empresa local, admissão) e insere em `qrcod_2023` com
     `origem_exata = 1`, registrando em `audit_log`;
   - `Mapear empresa` → atalho para o select de mapeamento já existente;
   - `Abrir cadastro local` → link/filtro na tela de funcionários.
5. **Botão “Exportar CSV”** usando o endpoint com `formato=csv`.

Em `empresas-config.ts`, adicionar signals/estado:
`coberturaExata`, `coberturaResumoExata`, `filtroSituacaoCobertura`, `buscaCobertura`,
`paginaCobertura`, `isCarregandoCobertura`.

Em `sincronizacao.service.ts`, adicionar as interfaces e o método
`listarCoberturaFuncionariosExata(filtros)`.

Na tabela de empresas, a coluna “Funcionários” pode ganhar um complemento:
`{{ empresa.total_funcionarios }} na API` + badge
`{{ porEmpresa[empresa.id].nao_cadastrado }} sem cadastro local`, quando houver.

### Fase 4 — Alertas, pré-voo e documentação

1. `backend/scripts/exata-preflight.js`: novo check “Cobertura de funcionários” com
   `FALHA`/`ATENCAO` quando houver `NAO_CADASTRADO` ou `EMPRESA_NAO_MAPEADA`.
2. `monitoramentoExata` (`backend/exata-sync.js:1890`): incluir
   `funcionarios: { total, cadastrados, nao_cadastrados, outra_empresa, sem_empresa_local }`
   e um alerta em `alertas`.
3. `docs/api-exata-web.md`: nova subseção 3.2.1 “Cobertura local” explicando que a API
   devolve só ativos e que a conferência é feita contra `qrcod_2023`.
4. `docs/resumo-integracao-exata.md`: descrever a tela e o CSV.
5. Testes:
   - unidade de `classificarCoberturaFuncionario` (sem banco) em `exata-fluxo.test.js`:
     cadastrado, outra empresa, sem empresa, ambíguo, inativo, nome divergente;
   - fluxo de `relatorioCoberturaFuncionarios` com pool simulado;
   - teste do endpoint (JSON e CSV) se houver suíte de rotas;
   - `npm test` no backend.

---

## 6. Critérios de aceite

- [ ] A tela/endpoint responde, para cada funcionário retornado pela Exata, se ele está
      cadastrado, em outra empresa, sem empresa, ambíguo ou não cadastrado.
- [ ] O resumo mostra os totais por situação e por empresa, incluindo inativos e nomes
      divergentes.
- [ ] O CSV reproduz exatamente o que a tela mostra.
- [ ] Nenhuma escrita em `qrcod_2023` na Fase 1.
- [ ] O histórico de sincronização registra a cobertura antes do espelho automático.
- [ ] Funcionários criados pela integração são identificáveis (`origem_exata = 1`) e
      aparecem com alerta próprio.
- [ ] A consulta usa índice em `qrcod_2023.matricula` e não faz `TRIM` no `WHERE`.
- [ ] `npm test` do backend continua passando.

## 7. Decisões que precisam de confirmação

1. **“Cadastrado” = mesma empresa ou qualquer empresa?**
   Recomendação: mesma empresa é `CADASTRADO`; outra empresa é `OUTRA_EMPRESA` com o nome
   da empresa local visível. Foi o caso de 175 dos 669 funcionários.
2. **O mapeamento `GRUPO DNP → empresa 1` está correto?**
   Hoje 175 funcionários estão na empresa local 2. Se o mapeamento estiver errado, a
   maior parte do “outra empresa” desaparece ao corrigi-lo.
3. **Manter a criação automática de funcionários?**
   Recomendação: desligar por padrão e oferecer a ação explícita “Cadastrar no banco
   local”. Se mantiver ligada, o relatório continuará funcionando, mas os criados
   automaticamente precisam do alerta `possivel_espelho`.
4. **Duplicidades de matrícula no `qrcod_2023`** (ex.: `10005247`, `10005940`) precisam de
   uma rotina de limpeza ou de uma decisão de qual linha é a válida; até lá, elas caem em
   `AMBIGUO`.
