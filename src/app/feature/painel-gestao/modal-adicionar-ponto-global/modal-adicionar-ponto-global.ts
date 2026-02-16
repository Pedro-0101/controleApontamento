import { Component, EventEmitter, inject, OnInit, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { ButtonComponent } from '../../../shared/button/button';
import { EmployeeService } from '../../../core/services/employee/employee.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { Employee } from '../../../models/employee/employee';

@Component({
  selector: 'app-modal-adicionar-ponto-global',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MultiSelectDropdown, ButtonComponent],
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
  protected selectedMatriculas = signal<string[]>([]);
  protected selectedDate = signal(new Date().toISOString().split('T')[0]);
  protected selectedTime = signal('');
  protected comentario = signal('');
  protected isSaving = signal(false);

  protected isLogicalDayShift = computed(() => {
    const time = this.selectedTime();
    if (!time) return false;
    const [hours] = time.split(':').map(Number);
    return hours < 5;
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
    return this.selectedMatriculas().length > 0 && !!this.selectedDate() && !!this.selectedTime() && !!this.comentario().trim();
  }

  async salvar() {
    if (!this.isFormValid()) return;

    this.isSaving.set(true);
    try {
      let commentDate = this.selectedDate();

      // Se for antes das 05:00, o comentário pertence ao dia anterior (Dia Lógico)
      if (this.isLogicalDayShift()) {
        const d = new Date(this.selectedDate() + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        commentDate = d.toISOString().split('T')[0];
      }

      await this.marcacaoService.saveManualMarcacaoBatch(
        this.selectedMatriculas(),
        this.selectedDate(),
        this.selectedTime(),
        this.comentario(),
        commentDate
      );

      this.toastService.success(`${this.selectedMatriculas().length} ponto(s) manual(is) adicionado(s) com sucesso!`);
      this.updated.emit();
      this.close.emit();
    } catch (error: any) {
      console.error('Erro ao salvar ponto global:', error);
      this.toastService.error('Erro ao salvar os pontos manuais.');
    } finally {
      this.isSaving.set(false);
    }
  }

  onSelectionChange(selected: string[]) {
    this.selectedMatriculas.set(selected);
  }
}
