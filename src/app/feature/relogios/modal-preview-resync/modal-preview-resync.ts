import { Component, computed, EventEmitter, inject, input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../../core/services/relogio/relogio.service';

export interface PreviewRelogio {
  numSerie: string;
  aAdicionar: { matricula: string; nome: string }[];
  aRemover: { matricula: string; nome: string }[];
}

@Component({
  selector: 'app-modal-preview-resync',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './modal-preview-resync.html',
  styleUrl: './modal-preview-resync.css'
})
export class ModalPreviewResync {
  private relogioService = inject(RelogioService);

  numSeries = input.required<string[]>();
  descricoes = input.required<Map<string, string>>();

  @Output() close = new EventEmitter<void>();
  @Output() confirmarResync = new EventEmitter<void>();

  isLoading = signal(true);
  error = signal('');
  previewData = signal<PreviewRelogio[]>([]);
  totalAdicionados = signal(0);
  totalRemovidos = signal(0);
  erroList = signal<string[]>([]);

  showAdicionados = signal(true);
  showRemovidos = signal(true);

  totalAdicionadosCount = computed(() => {
    return this.previewData().reduce((sum, r) => sum + r.aAdicionar.length, 0);
  });

  totalRemovidosCount = computed(() => {
    return this.previewData().reduce((sum, r) => sum + r.aRemover.length, 0);
  });

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const result = await this.relogioService.previewResyncRelogios([...this.numSeries()]);
      if (result.success) {
        this.previewData.set((result.porRelogio || []).map(r => ({
          numSerie: r.num_serie,
          aAdicionar: r.aAdicionar,
          aRemover: r.aRemover
        })));
        this.totalAdicionados.set(result.totalAdicionados);
        this.totalRemovidos.set(result.totalRemovidos);
        this.erroList.set(result.erros || []);
      } else {
        this.error.set(result.message || 'Erro ao gerar prévia');
      }
    } catch (e) {
      this.error.set('Erro de comunicação com o servidor');
    } finally {
      this.isLoading.set(false);
    }
  }

  getDescricao(numSerie: string): string {
    return this.descricoes().get(numSerie) || numSerie;
  }

  temAlteracoes(): boolean {
    return this.previewData().length > 0;
  }

  toggleShowAdicionados() {
    this.showAdicionados.update(v => !v);
  }

  toggleShowRemovidos() {
    this.showRemovidos.update(v => !v);
  }
}
