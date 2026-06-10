# Relógios — Aba de Funcionários

**Data:** 2026-06-10  
**Status:** Aprovado

## Resumo

Adicionar uma segunda aba horizontal na página de Relógios que lista todos os funcionários com seus dados cadastrais. As colunas de contagem de relógios (cadastrado/ativo) ficam como placeholder (`—`) até haver uma fonte de dados confiável para esse vínculo.

## Escopo do MVP

**Incluído:**
- Aba "Funcionários" dentro da página de Relógios
- Tabela com: Matrícula, Nome, Empresa, Local, Cargo, Status, Relógios Cadastrado (—), Relógios Ativo (—)
- Filtros: busca por nome/matrícula, filtro de status, multi-select de empresa
- Paginação
- Dados de funcionários merged de duas fontes: MySQL local + API Stefanini

**Excluído (futuro):**
- Adicionar/remover funcionário de relógio
- Ativar/desativar funcionário em relógio
- Cadastrar novos relógios
- Preenchimento das colunas Cadastrado/Ativo

## Decisões de design

| Decisão | Escolha | Motivo |
|---|---|---|
| Layout de abas | Horizontal no topo | Padrão familiar, não quebra layout |
| Fonte de dados | Local + API (merge) | Garante cobertura total de funcionários |
| Carregamento | Eager (paralelo no ngOnInit) | Aba pronta ao clicar |
| Contadores de relógio | Placeholder `null` / `—` | API não tem endpoint de leitura desse vínculo |
| Coluna `fonte` | No modelo, fora da tabela | Útil para debug/futuro, não polui a UI |

## Arquitetura

### Novos arquivos

```
src/app/models/funcionario-relogio/
  funcionario-relogio.ts                     ← interface + classe com fromJson

src/app/core/services/funcionario-relogio/
  funcionario-relogio.service.ts             ← merge local + API, expõe signals

src/app/feature/relogios/relogios-funcionarios/
  relogios-funcionarios.ts                   ← componente standalone da aba
  relogios-funcionarios.html                 ← tabela + filtros + paginação
  relogios-funcionarios.css                  ← estilos (reusa padrão existente)
```

### Arquivos modificados

```
src/app/feature/relogios/relogios.ts         ← activeTab signal, load paralelo
src/app/feature/relogios/relogios.html       ← tab bar + @if por aba
src/app/feature/relogios/relogios.css        ← estilos da tab bar
```

Nenhuma alteração no backend ou banco de dados.

## Modelo de dados

```typescript
interface IFuncionarioRelogio {
  matricula: string;
  nome: string;
  empresa: string;
  local: string;
  cargo: string;
  ativo: number;               // 0 | 1
  relogiosCadastrado: number | null;  // null até ter fonte definida
  relogiosAtivo: number | null;
  fonte: 'local' | 'api' | 'ambos';
}
```

## Estratégia de merge

Chave de deduplicação: `matricula`.

| Situação | Comportamento |
|---|---|
| Existe em local + API | Usa dados locais (mais completos). `fonte: 'ambos'` |
| Só em local | Usa dados locais. `fonte: 'local'` |
| Só na API | Mapeia `CodigoFuncionario → matricula`, `NomeFuncionario → nome`. Empresa/local/cargo ficam `''`. `fonte: 'api'` |

A prioridade da fonte local garante que empresa, local e cargo (enriquecidos no banco) não sejam sobrescritos pela API.

## FuncionarioRelogioService

```typescript
@Injectable({ providedIn: 'root' })
export class FuncionarioRelogioService {
  private funcionarios = signal<FuncionarioRelogio[]>([]);
  private loading = signal(false);

  readonly funcionarios$ = computed(() => this.funcionarios());
  readonly isLoading$ = computed(() => this.loading());

  async load(): Promise<void>
  // Chama em paralelo:
  //   EmployeeService.getAllEmployees()          → MySQL local
  //   SelecionaFuncionarioCategoria (por token) → API Stefanini
  // Faz merge e emite via signal
}
```

A chamada à API Stefanini usa todos os tokens disponíveis via `ApiSessionService.getAllTokens()`, mesmo padrão do `RelogioService`.

## RelogiosFuncionarios (componente)

Standalone component, injeta `FuncionarioRelogioService` diretamente.

Signals locais:
- `searchText`, `statusFilter`, `selectedCompanies`, `currentPage`, `itemsPerPage`

Computed:
- `filteredFuncionarios()` — aplica busca + status + empresa
- `paginatedFuncionarios()` — fatia para página atual

Comportamento de loading: exibe spinner enquanto `isLoading$()` for `true`.

Filtros: `app-search-filter` (busca + status) + `app-multi-select-dropdown` (empresa) — mesmo padrão de `colaboradores.html`.

## Relogios (modificações)

```typescript
// relogios.ts
activeTab = signal<'relogios' | 'funcionarios'>('relogios');

async ngOnInit() {
  await Promise.all([
    this.relogioService.updateRelogios(),
    this.funcionarioRelogioService.load()
  ]);
}
```

```html
<!-- relogios.html — tab bar -->
<div class="tab-bar">
  <button class="tab" [class.active]="activeTab() === 'relogios'"
          (click)="activeTab.set('relogios')">Relógios</button>
  <button class="tab" [class.active]="activeTab() === 'funcionarios'"
          (click)="activeTab.set('funcionarios')">Funcionários</button>
</div>

@if (activeTab() === 'relogios') { <!-- tabela existente --> }
@if (activeTab() === 'funcionarios') { <app-relogios-funcionarios /> }
```

## Mapeamento da API Stefanini — SelecionaFuncionarioCategoria

Endpoint `4.9`. Chamado com `dataAtualizacao` vazia para retornar todos os funcionários. Campos esperados na resposta (a confirmar contra resposta real na implementação):

- `CodigoFuncionario` → `matricula`
- `NomeFuncionario` → `nome`
- `Ativo` ou campo de status → `ativo` (mapear conforme documentação)

Os nomes exatos dos campos devem ser verificados ao implementar, pois a documentação PDF não detalha o schema de resposta deste endpoint.
