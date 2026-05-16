import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { LoggerService } from '../../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';

import { MultiSelectDropdown } from '../../../../shared/multi-select-dropdown/multi-select-dropdown';

@Component({
  selector: 'app-filtros-tabela-marcacoes',
  imports: [LucideAngularModule, MultiSelectDropdown],
  templateUrl: './filtros-tabela-marcacoes.html',
  styleUrl: './filtros-tabela-marcacoes.css',
})
export class FiltrosTabelaMarcacoes {

  // Services
  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);

  // Signal loading marcacoes
  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  // Signals empresas
  protected empresasSelecionadas = signal<string[]>([]);
  readonly _empresasFiltroPainel = this.marcacaoService._empresasFiltroPainel;

  // Signals status
  protected statusSelecionados = signal<string[]>([]);
  readonly _statusFiltroComContagem = this.marcacaoService._statusFiltroComContagem;

  // Signals locais
  protected locaisSelecionados = signal<string[]>([]);
  readonly _locaisFiltroPainel = this.marcacaoService._locaisFiltroPainel;

  // Signals relógios
  protected relogiosSelecionados = signal<string[]>([]);
  readonly _relogiosFiltroPainel = this.marcacaoService._relogiosFiltroPainel;

  // Signal filtros especiais
  protected filtrosEspeciaisSelecionados = signal<string[]>([]);
  readonly _filtrosEspeciaisOpcoes = [
    { label: 'Almoço Irregular', value: 'almoco_irregular' }
  ];

  ngOnInit() {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Componente inicializado');
    this.empresasSelecionadas.set([]);
    this.statusSelecionados.set([]);
    this.locaisSelecionados.set([]);
    this.relogiosSelecionados.set([]);
    this.filtrosEspeciaisSelecionados.set([]);
  }

  public aoSelecionarEmpresa(empresas: string[]): void {
    this.empresasSelecionadas.set(empresas);
    this.marcacaoService.filtrarMarcacoesPorEmpresa(empresas);
  }

  public aoSelecionarStatus(status: string[]): void {
    this.statusSelecionados.set(status);
    this.marcacaoService.filtrarMarcacoesPorStatus(status);
  }

  public aoSelecionarLocal(locais: string[]): void {
    this.locaisSelecionados.set(locais);
    this.marcacaoService.filtrarMarcacoesPorLocal(locais);
  }

  public aoSelecionarRelogio(relogios: string[]): void {
    this.relogiosSelecionados.set(relogios);
    this.marcacaoService.filtrarMarcacoesPorRelogio(relogios);
  }

  public aoSelecionarFiltroEspecial(values: string[]): void {
    this.filtrosEspeciaisSelecionados.set(values);
    this.marcacaoService.filtrarMarcacoesPorFiltroEspecial(values);
  }

  public limparFiltros(): void {
    this.empresasSelecionadas.set([]);
    this.statusSelecionados.set([]);
    this.locaisSelecionados.set([]);
    this.relogiosSelecionados.set([]);
    this.filtrosEspeciaisSelecionados.set([]);
    this.marcacaoService.filtrarMarcacoesPorEmpresa([]);
    this.marcacaoService.filtrarMarcacoesPorStatus([]);
    this.marcacaoService.filtrarMarcacoesPorLocal([]);
    this.marcacaoService.filtrarMarcacoesPorRelogio([]);
    this.marcacaoService.filtrarMarcacoesPorFiltroEspecial([]);
  }
}
