import { Component, effect, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
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

  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  protected empresasSelecionadas = signal<string[]>([]);
  readonly _empresasFiltroPainel = this.marcacaoService._empresasFiltroPainel;

  protected statusSelecionados = signal<string[]>([]);
  readonly _statusFiltroComContagem = this.marcacaoService._statusFiltroComContagem;

  protected locaisSelecionados = signal<string[]>([]);
  readonly _locaisFiltroPainel = this.marcacaoService._locaisFiltroPainel;

  protected relogiosSelecionados = signal<string[]>([]);
  readonly _relogiosFiltroPainel = this.marcacaoService._relogiosFiltroPainel;

  protected filtrosEspeciaisSelecionados = signal<string[]>([]);
  readonly _filtrosEspeciaisOpcoes = [
    { label: 'Almoço Irregular', value: 'almoco_irregular' },
    { label: 'Entrada após 07:00', value: 'atraso_entrada' },
    { label: 'Com ponto registrado', value: 'com_marcacoes' }
  ];

  private isInitialized = false;

  constructor() {
    // Pruning: remove seleções cujo count zerou — só executa quando dados estão carregados
    effect(() => {
      if (this._isLoadingMarcacoesFiltroPainel()) return;
      const disponiveisArr = this._statusFiltroComContagem();
      if (disponiveisArr.length === 0) return;
      const disponiveis = new Set(disponiveisArr.map(o => o.value));
      const atuais = this.statusSelecionados();
      const pruned = atuais.filter(v => disponiveis.has(v));
      if (pruned.length !== atuais.length) {
        this.statusSelecionados.set(pruned);
        this.marcacaoService.filtrarMarcacoesPorStatus(pruned);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      if (this._isLoadingMarcacoesFiltroPainel()) return;
      const disponiveisArr = this._empresasFiltroPainel();
      if (disponiveisArr.length === 0) return;
      const disponiveis = new Set(disponiveisArr.map(o => o.value));
      const atuais = this.empresasSelecionadas();
      const pruned = atuais.filter(v => disponiveis.has(v));
      if (pruned.length !== atuais.length) {
        this.empresasSelecionadas.set(pruned);
        this.marcacaoService.filtrarMarcacoesPorEmpresa(pruned);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      if (this._isLoadingMarcacoesFiltroPainel()) return;
      const disponiveisArr = this._locaisFiltroPainel();
      if (disponiveisArr.length === 0) return;
      const disponiveis = new Set(disponiveisArr.map(o => o.value));
      const atuais = this.locaisSelecionados();
      const pruned = atuais.filter(v => disponiveis.has(v));
      if (pruned.length !== atuais.length) {
        this.locaisSelecionados.set(pruned);
        this.marcacaoService.filtrarMarcacoesPorLocal(pruned);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      if (this._isLoadingMarcacoesFiltroPainel()) return;
      const disponiveisArr = this._relogiosFiltroPainel();
      if (disponiveisArr.length === 0) return;
      const disponiveis = new Set(disponiveisArr.map(o => o.value));
      const atuais = this.relogiosSelecionados();
      const pruned = atuais.filter(v => disponiveis.has(v));
      if (pruned.length !== atuais.length) {
        this.relogiosSelecionados.set(pruned);
        this.marcacaoService.filtrarMarcacoesPorRelogio(pruned);
      }
    }, { allowSignalWrites: true });

    // URL sync: serializa filtros ativos na query string
    effect(() => {
      if (!this.isInitialized) return;
      const empresa = this.empresasSelecionadas();
      const local = this.locaisSelecionados();
      const status = this.statusSelecionados();
      const relogio = this.relogiosSelecionados();
      const especial = this.filtrosEspeciaisSelecionados();

      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: {
          empresa: empresa.length ? empresa.join(',') : null,
          local:   local.length   ? local.join(',')   : null,
          status:  status.length  ? status.join(',')  : null,
          relogio: relogio.length ? relogio.join(',') : null,
          especial: especial.length ? especial.join(',') : null,
        },
        replaceUrl: true,
      });
    });
  }

  ngOnInit() {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Componente inicializado');

    // Restaurar filtros da URL ao abrir a página
    const params = this.activatedRoute.snapshot.queryParams;

    if (params['empresa']) {
      const v = params['empresa'].split(',');
      this.empresasSelecionadas.set(v);
      this.marcacaoService.filtrarMarcacoesPorEmpresa(v);
    }
    if (params['local']) {
      const v = params['local'].split(',');
      this.locaisSelecionados.set(v);
      this.marcacaoService.filtrarMarcacoesPorLocal(v);
    }
    if (params['status']) {
      const v = params['status'].split(',');
      this.statusSelecionados.set(v);
      this.marcacaoService.filtrarMarcacoesPorStatus(v);
    }
    if (params['relogio']) {
      const v = params['relogio'].split(',');
      this.relogiosSelecionados.set(v);
      this.marcacaoService.filtrarMarcacoesPorRelogio(v);
    }
    if (params['especial']) {
      const v = params['especial'].split(',');
      this.filtrosEspeciaisSelecionados.set(v);
      this.marcacaoService.filtrarMarcacoesPorFiltroEspecial(v);
    }

    this.isInitialized = true;
  }

  public filtrarPorCard(statuses: string[], especiais: string[] = []): void {
    this.statusSelecionados.set(statuses);
    this.filtrosEspeciaisSelecionados.set(especiais);
    this.marcacaoService.filtrarMarcacoesPorStatus(statuses);
    this.marcacaoService.filtrarMarcacoesPorFiltroEspecial(especiais);
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
}
