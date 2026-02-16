import { Component, EventEmitter, inject, OnInit, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { EmployeeService } from '../../../core/services/employee/employee.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { Employee } from '../../../models/employee/employee';

@Component({
  selector: 'app-modal-adicionar-ponto-global',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-adicionar-ponto-global.html',
  styleUrl: './modal-adicionar-ponto-global.css'
})
export class ModalAdicionarPontoGlobal implements OnInit {
  private employeeService = inject(EmployeeService);
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  protected employees = signal<Employee[]>([]);
  protected searchQuery = signal('');
  protected selectedMatricula = signal('');
  protected selectedDate = signal(new Date().toISOString().split('T')[0]);
  protected selectedTime = signal('');
  protected isSaving = signal(false);

  // Filtro de funcionários baseado na pesquisa
  protected filteredEmployees = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.employees();
    return this.employees().filter(e =>
      e.nome.toLowerCase().includes(query) ||
      e.matricula.toLowerCase().includes(query) ||
      (e.empresa || '').toLowerCase().includes(query)
    );
  });

  ngOnInit() {
    this.carregarFuncionarios();
  }

  async carregarFuncionarios() {
    try {
      const activeEmployees = await this.employeeService.getAllActiveEmployees();
      // Ordenar por nome
      activeEmployees.sort((a, b) => a.nome.localeCompare(b.nome));
      this.employees.set(activeEmployees);
    } catch (error: any) {
      console.error('Erro ao carregar funcionários:', error);
      this.toastService.error('Não foi possível carregar a lista de funcionários.');
    }
  }

  isFormValid(): boolean {
    return !!this.selectedMatricula() && !!this.selectedDate() && !!this.selectedTime();
  }

  async salvar() {
    if (!this.isFormValid()) return;

    this.isSaving.set(true);
    try {
      await this.marcacaoService.saveManualMarcacao(
        this.selectedMatricula(),
        this.selectedDate(),
        this.selectedTime()
      );

      this.toastService.success('Ponto manual adicionado com sucesso!');
      this.updated.emit();
      this.close.emit();
    } catch (error: any) {
      console.error('Erro ao salvar ponto global:', error);
      this.toastService.error('Erro ao salvar o ponto manual.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
