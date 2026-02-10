import { Component, EventEmitter, inject, input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Employee } from '../../../models/employee/employee';
import { EmployeeService } from '../../../core/services/employee/employee.service';

@Component({
  selector: 'app-modal-colaborador',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-colaborador.html',
  styleUrl: './modal-colaborador.css'
})
export class ModalColaborador implements OnInit {
  private employeeService = inject(EmployeeService);

  mode = input.required<'create' | 'edit'>();
  employee = input<Employee | null>(null);

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  nome = signal('');
  matricula = signal('');
  empresa = signal('');
  qrcod = signal('');
  ativo = signal(true);
  isSaving = signal(false);

  ngOnInit() {
    if (this.mode() === 'edit' && this.employee()) {
      const emp = this.employee()!;
      this.nome.set(emp.nome);
      this.matricula.set(emp.matricula);
      this.empresa.set(emp.empresa);
      this.qrcod.set(emp.qrcod || '');
      this.ativo.set(emp.ativo === 1);
    }
  }

  async handleSave() {
    if (!this.nome().trim() || !this.matricula().trim()) {
      alert('Nome e Matrícula são obrigatórios');
      return;
    }

    this.isSaving.set(true);
    try {
      const employeeData: Partial<Employee> = {
        nome: this.nome(),
        matricula: this.matricula(),
        empresa: this.empresa(),
        qrcod: this.qrcod(),
        ativo: this.ativo() ? 1 : 0
      };

      if (this.mode() === 'create') {
        await this.employeeService.createEmployee(employeeData);
        alert('Colaborador criado com sucesso!');
      } else {
        const id = this.employee()!.id;
        await this.employeeService.updateEmployee(id, employeeData);
        alert('Colaborador atualizado com sucesso!');
      }

      this.save.emit();
    } catch (error) {
      alert('Erro ao salvar colaborador. Verifique se a matrícula já não está em uso.');
      console.error(error);
    } finally {
      this.isSaving.set(false);
    }
  }

  getTitle(): string {
    return this.mode() === 'create' ? 'Novo Colaborador' : 'Editar Colaborador';
  }
}
