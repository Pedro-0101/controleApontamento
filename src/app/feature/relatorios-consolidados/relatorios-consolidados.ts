import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  RelatorioConsolidadoFiltros,
  RelatorioConsolidadoFormato,
  RelatorioConsolidadoOpcoes,
  RelatorioConsolidadoResultado,
  RelatorioConsolidadoService,
} from '../../core/services/relatorio-consolidado/relatorio-consolidado.service';
import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';
import { ToastService } from '../../core/services/toast/toast.service';

@Component({
  selector: 'app-relatorios-consolidados',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MultiSelectDropdown],
  templateUrl: './relatorios-consolidados.html',
  styleUrl: './relatorios-consolidados.css',
})
export class RelatoriosConsolidados implements OnInit {
  private service = inject(RelatorioConsolidadoService);
  private toastService = inject(ToastService);

  dataInicio = signal(this.isoDate(this.daysAgo(30)));
  dataFim = signal(this.isoDate(new Date()));
  busca = signal('');
  tipoRegistro = signal<number | null>(null);

  empresasSelecionadas = signal<string[]>([]);
  relogiosSelecionados = signal<string[]>([]);
  locaisSelecionados = signal<string[]>([]);

  opcoes = signal<RelatorioConsolidadoOpcoes>({
    empresas: [],
    empresasConfig: [],
    relogios: [],
    locais: [],
    provedores: [],
    empresasSistema: [],
  });

  resultado = signal<RelatorioConsolidadoResultado | null>(null);
  isLoading = signal(false);
  isExportando = signal<RelatorioConsolidadoFormato | null>(null);

  pagina = signal(1);
  pageSize = 50;

  empresaOptions = computed(() =>
    this.opcoes().empresas.map((empresa) => ({
      nome: empresa.nome,
      id: String(empresa.id),
    }))
  );

  relogioOptions = computed(() =>
    this.opcoes().relogios.map((relogio) => ({
      label: relogio.descricao || relogio.num_serie,
      value: relogio.num_serie,
      serie: relogio.num_serie,
    }))
  );

  localOptions = computed(() => this.opcoes().locais);

  registros = computed(() => this.resultado()?.registros || []);

  totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.registros().length / this.pageSize))
  );

  paginaAtual = computed(() => Math.min(this.pagina(), this.totalPaginas()));

  registrosPagina = computed(() => {
    const inicio = (this.paginaAtual() - 1) * this.pageSize;
    return this.registros().slice(inicio, inicio + this.pageSize);
  });

  async ngOnInit() {
    try {
      this.opcoes.set(await this.service.opcoes());
    } catch {
      this.toastService.error('Não foi possível carregar as opções do relatório');
    }
  }

  onEmpresasChange(values: string[]) {
    this.empresasSelecionadas.set(values);
  }

  onRelogiosChange(values: string[]) {
    this.relogiosSelecionados.set(values);
  }

  onLocaisChange(values: string[]) {
    this.locaisSelecionados.set(values);
  }

  onTipoRegistroChange(value: string) {
    this.tipoRegistro.set(value === '' ? null : Number(value));
  }

  private filtros(): RelatorioConsolidadoFiltros {
    return {
      dataInicio: this.dataInicio(),
      dataFim: this.dataFim(),
      empresaIds: this.empresasSelecionadas().map(Number).filter(Number.isFinite),
      numSeries: this.relogiosSelecionados(),
      locais: this.locaisSelecionados(),
      busca: this.busca().trim(),
      tipoRegistro: this.tipoRegistro(),
    };
  }

  private validar(): boolean {
    if (!this.dataInicio() || !this.dataFim()) {
      this.toastService.warning('Informe a data inicial e a data final');
      return false;
    }
    if (this.dataInicio() > this.dataFim()) {
      this.toastService.warning('A data inicial deve ser anterior à data final');
      return false;
    }
    return true;
  }

  async gerar() {
    if (!this.validar()) return;

    this.isLoading.set(true);
    this.pagina.set(1);
    try {
      const resultado = await this.service.consultar(this.filtros());
      this.resultado.set(resultado);

      if (resultado.truncado) {
        this.toastService.warning(
          `O resultado foi limitado aos primeiros ${resultado.limite} registros. Refine os filtros.`
        );
      } else if (resultado.totalGeral.registros === 0) {
        this.toastService.info('Nenhuma marcação encontrada para os filtros selecionados');
      } else {
        this.toastService.success(`${resultado.totalGeral.registros} marcação(ões) encontrada(s)`);
      }
    } catch (error: any) {
      this.resultado.set(null);
      this.toastService.error(error?.error?.error || 'Erro ao gerar o relatório consolidado');
    } finally {
      this.isLoading.set(false);
    }
  }

  async exportar(formato: RelatorioConsolidadoFormato) {
    if (!this.validar()) return;

    this.isExportando.set(formato);
    try {
      await this.service.exportar(this.filtros(), formato);
      this.toastService.success(`Exportação ${formato.toUpperCase()} gerada`);
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao exportar o relatório');
    } finally {
      this.isExportando.set(null);
    }
  }

  paginaAnterior() {
    this.pagina.set(Math.max(1, this.paginaAtual() - 1));
  }

  proximaPagina() {
    this.pagina.set(Math.min(this.totalPaginas(), this.paginaAtual() + 1));
  }

  limparFiltros() {
    this.dataInicio.set(this.isoDate(this.daysAgo(30)));
    this.dataFim.set(this.isoDate(new Date()));
    this.busca.set('');
    this.tipoRegistro.set(null);
    this.empresasSelecionadas.set([]);
    this.relogiosSelecionados.set([]);
    this.locaisSelecionados.set([]);
    this.resultado.set(null);
    this.pagina.set(1);
  }

  private daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private isoDate(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }
}
