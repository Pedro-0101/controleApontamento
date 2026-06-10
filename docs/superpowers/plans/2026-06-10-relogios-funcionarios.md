# Relógios — Aba de Funcionários: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Funcionários" na página de Relógios com tabela de funcionários (merge de MySQL local + API Stefanini), filtros, paginação e colunas placeholder para contagem de relógios.

**Architecture:** Sub-componente `RelogiosFuncionarios` standalone injeta `FuncionarioRelogioService`, que faz merge de `EmployeeService.getAllEmployees()` (MySQL local) com `SelecionaFuncionarioCategoria` (API Stefanini, uma chamada por token). O componente pai `Relogios` adiciona `activeTab` signal e dispara ambas as cargas em paralelo no `ngOnInit`. Colunas de contagem de relógios ficam como `null` / `—` (placeholder).

**Tech Stack:** Angular 17+ (standalone, signals, `@for`/`@if`), TypeScript, Jasmine/Karma, Lucide Angular, fetch API, `ApiSessionService.getAllTokens()`.

---

## Mapa de arquivos

**Novos:**
- `src/app/models/funcionario-relogio/funcionario-relogio.ts`
- `src/app/models/funcionario-relogio/funcionario-relogio.spec.ts`
- `src/app/core/services/funcionario-relogio/funcionario-relogio.service.ts`
- `src/app/core/services/funcionario-relogio/funcionario-relogio.service.spec.ts`
- `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.ts`
- `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.html`
- `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.css`
- `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.spec.ts`

**Modificados:**
- `src/environments/environment.ts`
- `src/environments/environment.development.ts`
- `src/app/feature/relogios/relogios.ts`
- `src/app/feature/relogios/relogios.html`
- `src/app/feature/relogios/relogios.css`

---

## Referência rápida da API Stefanini — SelecionaFuncionarioCategoria

Endpoint `4.9`. Resposta por objeto `FuncionarioCategoriaInfo`:
- `Matricula` (string) → `matricula`
- `StatusFuncionario` (int) → `ativo` (1 = ativo, qualquer outro = 0)
- `Categoria` (string), `CodCategoria` (int), `StatusCategoria` (int) — ignorados no MVP
- **Não há campo de nome** — funcionários vindos só da API ficarão com `nome: ''`

Body da requisição:
```json
{ "dataAtualizacao": "", "tokenAcesso": "<token>" }
```

---

## Task 1: Modelo FuncionarioRelogio

**Files:**
- Create: `src/app/models/funcionario-relogio/funcionario-relogio.ts`
- Create: `src/app/models/funcionario-relogio/funcionario-relogio.spec.ts`

- [ ] **Step 1: Escrever o spec**

```typescript
// src/app/models/funcionario-relogio/funcionario-relogio.spec.ts
import { FuncionarioRelogio } from './funcionario-relogio';
import { Employee } from '../employee/employee';

describe('FuncionarioRelogio', () => {
  it('should create an instance with null counters', () => {
    const f = new FuncionarioRelogio();
    expect(f.relogiosCadastrado).toBeNull();
    expect(f.relogiosAtivo).toBeNull();
  });

  describe('fromEmployee', () => {
    it('should map all employee fields and set fonte=local', () => {
      const emp = Employee.fromJson({
        id: 1, matricula: '001', nome: 'João Silva', empresa: 'Mix Caieiras',
        local: 'Administração', cargo: 'Operador', ativo: 1, trabalha_sabado: 1
      });
      const f = FuncionarioRelogio.fromEmployee(emp);
      expect(f.matricula).toBe('001');
      expect(f.nome).toBe('João Silva');
      expect(f.empresa).toBe('Mix Caieiras');
      expect(f.local).toBe('Administração');
      expect(f.cargo).toBe('Operador');
      expect(f.ativo).toBe(1);
      expect(f.fonte).toBe('local');
      expect(f.relogiosCadastrado).toBeNull();
      expect(f.relogiosAtivo).toBeNull();
    });
  });

  describe('fromApiJson', () => {
    it('should map Matricula and StatusFuncionario=1 as ativo', () => {
      const f = FuncionarioRelogio.fromApiJson({
        Matricula: '002', StatusFuncionario: 1,
        Categoria: 'COMERCIAL', CodCategoria: 157, StatusCategoria: 1
      });
      expect(f.matricula).toBe('002');
      expect(f.ativo).toBe(1);
      expect(f.nome).toBe('');
      expect(f.empresa).toBe('');
      expect(f.fonte).toBe('api');
      expect(f.relogiosCadastrado).toBeNull();
    });

    it('should map StatusFuncionario != 1 as ativo=0', () => {
      const f = FuncionarioRelogio.fromApiJson({
        Matricula: '003', StatusFuncionario: 3,
        Categoria: 'MOTORISTA', CodCategoria: 148, StatusCategoria: 1
      });
      expect(f.ativo).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Rodar spec para confirmar falha**

```
npx ng test --include="src/app/models/funcionario-relogio/**" --watch=false
```

Expected: error "Cannot find module './funcionario-relogio'"

- [ ] **Step 3: Criar o modelo**

```typescript
// src/app/models/funcionario-relogio/funcionario-relogio.ts
import { Employee } from '../employee/employee';

export interface IFuncionarioRelogio {
  matricula: string;
  nome: string;
  empresa: string;
  local: string;
  cargo: string;
  ativo: number;
  relogiosCadastrado: number | null;
  relogiosAtivo: number | null;
  fonte: 'local' | 'api' | 'ambos';
}

export class FuncionarioRelogio implements IFuncionarioRelogio {
  matricula = '';
  nome = '';
  empresa = '';
  local = '';
  cargo = '';
  ativo = 1;
  relogiosCadastrado: number | null = null;
  relogiosAtivo: number | null = null;
  fonte: 'local' | 'api' | 'ambos' = 'local';

  static fromEmployee(emp: Employee): FuncionarioRelogio {
    const f = new FuncionarioRelogio();
    f.matricula = emp.matricula;
    f.nome = emp.nome;
    f.empresa = emp.empresa ?? '';
    f.local = emp.local ?? '';
    f.cargo = emp.cargo ?? '';
    f.ativo = emp.ativo;
    f.fonte = 'local';
    return f;
  }

  static fromApiJson(json: any): FuncionarioRelogio {
    const f = new FuncionarioRelogio();
    f.matricula = String(json.Matricula ?? '');
    f.nome = '';
    f.empresa = '';
    f.local = '';
    f.cargo = '';
    f.ativo = json.StatusFuncionario === 1 ? 1 : 0;
    f.fonte = 'api';
    return f;
  }
}
```

- [ ] **Step 4: Rodar spec novamente**

```
npx ng test --include="src/app/models/funcionario-relogio/**" --watch=false
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/models/funcionario-relogio/
git commit -m "feat(models): adicionar modelo FuncionarioRelogio"
```

---

## Task 2: Adicionar URL do endpoint nos environments

**Files:**
- Modify: `src/environments/environment.ts`
- Modify: `src/environments/environment.development.ts`

- [ ] **Step 1: Atualizar environment.ts**

Conteúdo completo do arquivo:

```typescript
export const environment = {
    production: true,
    ipDatabase: '192.168.200.136',
    database: 'dnpmix',
    userDatabase: 'root',
    passDatabase: 'pass',
    cryptoKey: '4373e3243ca5a687445c0cc9a492d3e79ce7af1b63740f4680ea7ea57619ac44',
    apiUrlBackend: '/api',
    apiUrlStartSession: '/api/StartSession',
    apiUrlListarUnidadesAdm: '/api/ListarUnidadeAdministrativa',
    apiUrlListarMarcacoes: '/api/SelecionaMarcacoes',
    apiUrlListaRelogios: '/api/RetornaRelogiosInfo',
    apiUrlSelecionaFuncionarioCategoria: '/api/SelecionaFuncionarioCategoria',
};
```

- [ ] **Step 2: Atualizar environment.development.ts**

Conteúdo completo do arquivo (idêntico, só `production: false`):

```typescript
export const environment = {
    production: false,
    ipDatabase: '192.168.200.136',
    database: 'dnpmix',
    userDatabase: 'root',
    passDatabase: 'pass',
    cryptoKey: '4373e3243ca5a687445c0cc9a492d3e79ce7af1b63740f4680ea7ea57619ac44',
    apiUrlBackend: '/api',
    apiUrlStartSession: '/api/StartSession',
    apiUrlListarUnidadesAdm: '/api/ListarUnidadeAdministrativa',
    apiUrlListarMarcacoes: '/api/SelecionaMarcacoes',
    apiUrlListaRelogios: '/api/RetornaRelogiosInfo',
    apiUrlSelecionaFuncionarioCategoria: '/api/SelecionaFuncionarioCategoria',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/environments/
git commit -m "feat(env): adicionar URL SelecionaFuncionarioCategoria"
```

---

## Task 3: FuncionarioRelogioService

**Files:**
- Create: `src/app/core/services/funcionario-relogio/funcionario-relogio.service.ts`
- Create: `src/app/core/services/funcionario-relogio/funcionario-relogio.service.spec.ts`

- [ ] **Step 1: Escrever o spec (testa `merge` que é puro e público)**

```typescript
// src/app/core/services/funcionario-relogio/funcionario-relogio.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { FuncionarioRelogioService } from './funcionario-relogio.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';

function makeFuncionario(matricula: string, fonte: 'local' | 'api' | 'ambos', nome = ''): FuncionarioRelogio {
  const f = new FuncionarioRelogio();
  f.matricula = matricula;
  f.nome = nome;
  f.fonte = fonte;
  return f;
}

describe('FuncionarioRelogioService', () => {
  let service: FuncionarioRelogioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FuncionarioRelogioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('merge', () => {
    it('should return local-only employees with fonte=local', () => {
      const result = service.merge([makeFuncionario('001', 'local', 'João')], []);
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('local');
      expect(result[0].nome).toBe('João');
    });

    it('should return api-only employees with fonte=api', () => {
      const result = service.merge([], [makeFuncionario('001', 'api')]);
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('api');
    });

    it('should mark employees in both sources as fonte=ambos preserving local data', () => {
      const result = service.merge(
        [makeFuncionario('001', 'local', 'João Local')],
        [makeFuncionario('001', 'api', '')]
      );
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('ambos');
      expect(result[0].nome).toBe('João Local');
    });

    it('should combine distinct employees from both sources without duplicates', () => {
      const result = service.merge(
        [makeFuncionario('001', 'local'), makeFuncionario('002', 'local')],
        [makeFuncionario('001', 'api'), makeFuncionario('003', 'api')]
      );
      expect(result.length).toBe(3);
      expect(result.map(f => f.matricula).sort()).toEqual(['001', '002', '003']);
    });

    it('should return empty array when both sources are empty', () => {
      expect(service.merge([], [])).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Rodar spec para confirmar falha**

```
npx ng test --include="src/app/core/services/funcionario-relogio/**" --watch=false
```

Expected: error "Cannot find module './funcionario-relogio.service'"

- [ ] **Step 3: Criar o serviço**

```typescript
// src/app/core/services/funcionario-relogio/funcionario-relogio.service.ts
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { EmployeeService } from '../employee/employee.service';
import { LoggerService } from '../logger/logger.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';

@Injectable({ providedIn: 'root' })
export class FuncionarioRelogioService {
  private apiSessionService = inject(ApiSessionService);
  private employeeService = inject(EmployeeService);
  private loggerService = inject(LoggerService);

  private readonly apiUrl = environment.apiUrlSelecionaFuncionarioCategoria;

  private _funcionarios = signal<FuncionarioRelogio[]>([]);
  private _loading = signal(false);

  readonly funcionarios = computed(() => this._funcionarios());
  readonly isLoading = computed(() => this._loading());

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const [localList, apiList] = await Promise.all([
        this.loadFromLocal(),
        this.loadFromApi()
      ]);
      this._funcionarios.set(this.merge(localList, apiList));
      this.loggerService.info('FuncionarioRelogioService', `${this._funcionarios().length} funcionários carregados`);
    } catch (error) {
      this.loggerService.error('FuncionarioRelogioService', 'Erro ao carregar funcionários: ' + error);
      this._funcionarios.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  private async loadFromLocal(): Promise<FuncionarioRelogio[]> {
    const employees = await this.employeeService.getAllEmployees();
    return employees.map(e => FuncionarioRelogio.fromEmployee(e));
  }

  private async loadFromApi(): Promise<FuncionarioRelogio[]> {
    const tokens = this.apiSessionService.getAllTokens();
    if (tokens.length === 0) return [];

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataAtualizacao: '', tokenAcesso: token })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.d || []).map((r: any) => FuncionarioRelogio.fromApiJson(r));
      } catch {
        return [];
      }
    }));

    const seen = new Set<string>();
    return results.flat().filter(f => {
      if (!f.matricula || seen.has(f.matricula)) return false;
      seen.add(f.matricula);
      return true;
    });
  }

  merge(local: FuncionarioRelogio[], api: FuncionarioRelogio[]): FuncionarioRelogio[] {
    const map = new Map<string, FuncionarioRelogio>();
    for (const f of local) {
      map.set(f.matricula, f);
    }
    for (const f of api) {
      if (map.has(f.matricula)) {
        map.get(f.matricula)!.fonte = 'ambos';
      } else {
        map.set(f.matricula, f);
      }
    }
    return Array.from(map.values());
  }
}
```

- [ ] **Step 4: Rodar spec novamente**

```
npx ng test --include="src/app/core/services/funcionario-relogio/**" --watch=false
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/funcionario-relogio/
git commit -m "feat(services): adicionar FuncionarioRelogioService com merge local+API"
```

---

## Task 4: RelogiosFuncionarios component

**Files:**
- Create: `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.ts`
- Create: `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.html`
- Create: `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.css`
- Create: `src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.spec.ts`

- [ ] **Step 1: Escrever o spec**

```typescript
// src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RelogiosFuncionarios } from './relogios-funcionarios';

describe('RelogiosFuncionarios', () => {
  let component: RelogiosFuncionarios;
  let fixture: ComponentFixture<RelogiosFuncionarios>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelogiosFuncionarios]
    }).compileComponents();

    fixture = TestBed.createComponent(RelogiosFuncionarios);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar spec para confirmar falha**

```
npx ng test --include="src/app/feature/relogios/relogios-funcionarios/**" --watch=false
```

Expected: error "Cannot find module './relogios-funcionarios'"

- [ ] **Step 3: Criar o componente**

```typescript
// src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.ts
import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FuncionarioRelogioService } from '../../../core/services/funcionario-relogio/funcionario-relogio.service';
import { Pagination } from '../../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../../shared/search-filter/search-filter';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { TitleCaseCustomPipe } from '../../../shared/pipes/title-case-custom.pipe';

@Component({
  selector: 'app-relogios-funcionarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, MultiSelectDropdown, TitleCaseCustomPipe],
  templateUrl: './relogios-funcionarios.html',
  styleUrl: './relogios-funcionarios.css'
})
export class RelogiosFuncionarios {
  private funcionarioRelogioService = inject(FuncionarioRelogioService);

  @ViewChild(MultiSelectDropdown) multiSelect!: MultiSelectDropdown;

  searchText = signal('');
  statusFilter = signal('all');
  selectedCompanies = signal<string[]>([]);
  currentPage = signal(1);
  itemsPerPage = signal(25);

  readonly isLoading = this.funcionarioRelogioService.isLoading;

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Ativos', value: '1' },
    { label: 'Inativos', value: '0' }
  ]);

  companyOptions = computed(() => {
    const companies = [...new Set(
      this.funcionarioRelogioService.funcionarios()
        .map(f => f.empresa)
        .filter(e => !!e)
    )].sort();
    return companies.map(c => ({ nome: c, matricula: c }));
  });

  filteredFuncionarios = computed(() => {
    let result = this.funcionarioRelogioService.funcionarios();

    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(f =>
        f.nome.toLowerCase().includes(search) ||
        f.matricula.toLowerCase().includes(search) ||
        f.empresa.toLowerCase().includes(search) ||
        f.local.toLowerCase().includes(search) ||
        f.cargo.toLowerCase().includes(search)
      );
    }

    const status = this.statusFilter();
    if (status !== 'all') {
      result = result.filter(f => f.ativo === parseInt(status));
    }

    const companies = this.selectedCompanies();
    if (companies.length > 0) {
      result = result.filter(f => companies.includes(f.empresa));
    }

    return result;
  });

  paginatedFuncionarios = computed(() => {
    const filtered = this.filteredFuncionarios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
    this.selectedCompanies.set([]);
    this.multiSelect?.clearSelection();
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  getStatusClass(ativo: number): string {
    return ativo === 1 ? 'status-ativo' : 'status-inativo';
  }

  getStatusLabel(ativo: number): string {
    return ativo === 1 ? 'Ativo' : 'Inativo';
  }
}
```

- [ ] **Step 4: Criar o template**

```html
<!-- src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.html -->
@if (isLoading()) {
  <div class="loading-container">
    <div class="spinner"></div>
    <p>Carregando funcionários...</p>
  </div>
} @else {
  <div class="table-container">
    <div class="filters-layout">
      <app-search-filter
        class="flex-1"
        searchPlaceholder="Pesquisar por nome, matrícula, empresa ou local..."
        filterLabel="Status:"
        [filterOptions]="filterOptions()"
        (searchChange)="onSearchChange($event)"
        (filterChange)="onFilterChange($event)"
      ></app-search-filter>

      <div class="company-filter-box">
        <app-multi-select-dropdown
          [options]="companyOptions()"
          [placeholder]="'Selecione as empresas...'"
          [searchPlaceholder]="'Buscar empresas...'"
          (selectionChange)="onCompanySelectionChange($event)"
        ></app-multi-select-dropdown>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Matrícula</th>
          <th>Nome</th>
          <th>Empresa</th>
          <th>Local</th>
          <th>Cargo</th>
          <th>Status</th>
          <th class="counter-column">Cadastrado</th>
          <th class="counter-column">Ativo</th>
        </tr>
      </thead>
      <tbody>
        @for (func of paginatedFuncionarios(); track func.matricula) {
          <tr>
            <td>{{ func.matricula }}</td>
            <td class="employee-name">
              <lucide-icon name="user" [size]="16"></lucide-icon>
              {{ func.nome | titleCaseCustom }}
            </td>
            <td>{{ func.empresa | titleCaseCustom }}</td>
            <td>{{ func.local | titleCaseCustom }}</td>
            <td>{{ func.cargo | titleCaseCustom }}</td>
            <td>
              <span class="badge" [class]="getStatusClass(func.ativo)">
                {{ getStatusLabel(func.ativo) }}
              </span>
            </td>
            <td class="counter-cell">
              @if (func.relogiosCadastrado !== null) {
                {{ func.relogiosCadastrado }}
              } @else {
                <span class="counter-placeholder">—</span>
              }
            </td>
            <td class="counter-cell">
              @if (func.relogiosAtivo !== null) {
                {{ func.relogiosAtivo }}
              } @else {
                <span class="counter-placeholder">—</span>
              }
            </td>
          </tr>
        } @empty {
          <tr>
            <td colspan="8" class="empty-state">
              <lucide-icon name="users" [size]="48"></lucide-icon>
              <p>Nenhum funcionário encontrado</p>
            </td>
          </tr>
        }
      </tbody>
    </table>

    <app-pagination
      [totalItems]="filteredFuncionarios().length"
      [itemsPerPage]="itemsPerPage()"
      [currentPage]="currentPage()"
      (pageChange)="onPageChange($event)"
      (itemsPerPageChange)="onItemsPerPageChange($event)"
    ></app-pagination>
  </div>
}
```

- [ ] **Step 5: Criar os estilos**

```css
/* src/app/feature/relogios/relogios-funcionarios/relogios-funcionarios.css */
.employee-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: var(--color-gray-800);
}

.employee-name lucide-icon {
  color: var(--color-gray-400);
}

.counter-column {
  width: 90px;
  text-align: center;
}

.counter-cell {
  text-align: center;
}

.counter-placeholder {
  color: var(--color-gray-400);
}

.filters-layout {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  margin-bottom: var(--spacing-xl);
  padding: 0 var(--spacing-md);
}

.filters-layout app-search-filter {
  flex: 1;
}

.company-filter-box {
  min-width: 280px;
}

.flex-1 {
  flex: 1;
}
```

- [ ] **Step 6: Rodar spec**

```
npx ng test --include="src/app/feature/relogios/relogios-funcionarios/**" --watch=false
```

Expected: "should create" PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/feature/relogios/relogios-funcionarios/
git commit -m "feat(relogios): adicionar componente RelogiosFuncionarios"
```

---

## Task 5: Atualizar Relogios com tab bar

**Files:**
- Modify: `src/app/feature/relogios/relogios.ts`
- Modify: `src/app/feature/relogios/relogios.html`
- Modify: `src/app/feature/relogios/relogios.css`

- [ ] **Step 1: Substituir relogios.ts**

```typescript
// src/app/feature/relogios/relogios.ts
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { FuncionarioRelogioService } from '../../core/services/funcionario-relogio/funcionario-relogio.service';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../shared/search-filter/search-filter';
import { RelogiosFuncionarios } from './relogios-funcionarios/relogios-funcionarios';

@Component({
  selector: 'app-relogios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, RelogiosFuncionarios],
  templateUrl: './relogios.html',
  styleUrl: './relogios.css'
})
export class Relogios implements OnInit {
  private relogioService = inject(RelogioService);
  private funcionarioRelogioService = inject(FuncionarioRelogioService);

  activeTab = signal<'relogios' | 'funcionarios'>('relogios');
  allRelogios = signal<Relogio[]>([]);
  searchText = signal('');
  statusFilter = signal('all');
  currentPage = signal(1);
  itemsPerPage = signal(25);
  isLoading = signal(true);

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Online', value: '4' },
    { label: 'Offline', value: 'offline' }
  ]);

  filteredRelogios = computed(() => {
    let result = this.allRelogios();

    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(r =>
        r.numSerie.toLowerCase().includes(search) ||
        r.descricao.toLowerCase().includes(search) ||
        r.type.toLowerCase().includes(search)
      );
    }

    const status = this.statusFilter();
    if (status === '4') {
      result = result.filter(r => r.status === 4);
    } else if (status === 'offline') {
      result = result.filter(r => r.status !== 4);
    }

    return result;
  });

  paginatedRelogios = computed(() => {
    const filtered = this.filteredRelogios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  async ngOnInit() {
    await Promise.all([
      this.loadRelogios(),
      this.funcionarioRelogioService.load()
    ]);
  }

  async loadRelogios() {
    this.isLoading.set(true);
    try {
      const relogios = await this.relogioService.updateRelogios();
      this.allRelogios.set(relogios);
    } catch (error) {
      console.error('Erro ao carregar relógios:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  getStatusClass(status: number): string {
    return status === 4 ? 'status-online' : 'status-offline';
  }

  getStatusLabel(status: number): string {
    return status === 4 ? 'Online' : 'Offline';
  }
}
```

- [ ] **Step 2: Substituir relogios.html**

```html
<!-- src/app/feature/relogios/relogios.html -->
<div class="page-container">
  <div class="page-header">
    <div class="header-content">
      <h1>
        <lucide-icon name="clock" [size]="28"></lucide-icon>
        Relógios
      </h1>
      <p class="subtitle">Lista de relógios de ponto da empresa</p>
    </div>
  </div>

  <div class="tab-bar">
    <button
      class="tab"
      [class.active]="activeTab() === 'relogios'"
      (click)="activeTab.set('relogios')"
    >
      <lucide-icon name="clock" [size]="16"></lucide-icon>
      Relógios
    </button>
    <button
      class="tab"
      [class.active]="activeTab() === 'funcionarios'"
      (click)="activeTab.set('funcionarios')"
    >
      <lucide-icon name="users" [size]="16"></lucide-icon>
      Funcionários
    </button>
  </div>

  @if (activeTab() === 'relogios') {
    @if (isLoading()) {
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Carregando relógios...</p>
      </div>
    } @else {
      <div class="table-container">
        <app-search-filter
          searchPlaceholder="Pesquisar por número de série, descrição ou tipo..."
          filterLabel="Status:"
          [filterOptions]="filterOptions()"
          (searchChange)="onSearchChange($event)"
          (filterChange)="onFilterChange($event)"
        ></app-search-filter>

        <table class="data-table">
          <thead>
            <tr>
              <th>Número de Série</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Data Criação</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (relogio of paginatedRelogios(); track relogio.numSerie) {
              <tr>
                <td class="num-serie">
                  <lucide-icon name="clock" [size]="16"></lucide-icon>
                  {{ relogio.numSerie }}
                </td>
                <td>{{ relogio.descricao }}</td>
                <td>{{ relogio.type }}</td>
                <td>{{ relogio.dataCriacao }}</td>
                <td>
                  <span class="badge" [class]="getStatusClass(relogio.status)">
                    {{ getStatusLabel(relogio.status) }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty-state">
                  <lucide-icon name="clock" [size]="48"></lucide-icon>
                  <p>Nenhum relógio encontrado</p>
                </td>
              </tr>
            }
          </tbody>
        </table>

        <app-pagination
          [totalItems]="filteredRelogios().length"
          [itemsPerPage]="itemsPerPage()"
          [currentPage]="currentPage()"
          (pageChange)="onPageChange($event)"
          (itemsPerPageChange)="onItemsPerPageChange($event)"
        ></app-pagination>
      </div>
    }
  }

  @if (activeTab() === 'funcionarios') {
    <app-relogios-funcionarios />
  }
</div>
```

- [ ] **Step 3: Adicionar estilos da tab bar em relogios.css**

Adicione ao final de `src/app/feature/relogios/relogios.css`:

```css
.tab-bar {
  display: flex;
  border-bottom: 2px solid var(--color-gray-200);
  background: var(--color-gray-50);
  padding: 0 var(--spacing-md);
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--spacing-sm) var(--spacing-lg);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-gray-500);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover {
  color: var(--color-gray-700);
}

.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
```

- [ ] **Step 4: Verificar build sem erros TypeScript**

```
npx ng build --configuration=development 2>&1 | tail -20
```

Expected: saída terminando com `✔ Building...` e 0 erros

- [ ] **Step 5: Commit**

```bash
git add src/app/feature/relogios/
git commit -m "feat(relogios): adicionar aba de funcionários com tab bar"
```
