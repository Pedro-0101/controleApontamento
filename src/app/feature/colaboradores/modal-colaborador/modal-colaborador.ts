import { Component, EventEmitter, inject, input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Employee } from '../../../models/employee/employee';
import { EmployeeService } from '../../../core/services/employee/employee.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { EmpresaService } from '../../../core/services/empresa/empresa.service';
import { LocalService } from '../../../core/services/local/local.service';
import { Empresa } from '../../../models/empresa/empresa';
import { LocalModel } from '../../../models/local/local-model';

@Component({
  selector: 'app-modal-colaborador',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-colaborador.html',
  styleUrl: './modal-colaborador.css'
})
export class ModalColaborador implements OnInit {
  private employeeService = inject(EmployeeService);
  private empresaService  = inject(EmpresaService);
  private localService    = inject(LocalService);
  private toastService    = inject(ToastService);

  mode     = input.required<'create' | 'edit'>();
  employee = input<Employee | null>(null);

  @Output() close = new EventEmitter<void>();
  @Output() save  = new EventEmitter<void>();

  nome               = signal('');
  matricula          = signal('');
  empresaId          = signal<number | null>(null);
  localId            = signal<number | null>(null);
  cargo              = signal('');
  ativo              = signal(true);
  trabalhaSabado     = signal(true);
  dataAdmissao       = signal('');
  dataFimExperiencia = signal('');
  isSaving           = signal(false);

  empresas = signal<Empresa[]>([]);
  locais   = signal<LocalModel[]>([]);

  async ngOnInit() {
    const [empresas, locais] = await Promise.all([
      this.empresaService.listar(),
      this.localService.listar(),
    ]);
    this.empresas.set(empresas);
    this.locais.set(locais);

    if (this.mode() === 'edit' && this.employee()) {
      const emp = this.employee()!;
      this.nome.set(emp.nome);
      this.matricula.set(emp.matricula);
      this.empresaId.set(emp.empresa_id ?? null);
      this.localId.set(emp.local_id ?? null);
      this.cargo.set(emp.cargo ?? '');
      this.ativo.set(emp.ativo === 1);
      this.trabalhaSabado.set(emp.trabalha_sabado === 1);
      this.dataAdmissao.set(emp.data_admissao ?? '');
      this.dataFimExperiencia.set(emp.data_fim_experiencia ?? emp.data_admissao ?? '');
    }
  }

  onDataAdmissaoChange(value: string): void {
    this.dataAdmissao.set(value);
    if (!this.dataFimExperiencia()) {
      this.dataFimExperiencia.set(value);
    }
  }

  async handleSave() {
    if (!this.nome().trim() || !this.matricula().trim()) {
      this.toastService.warning('Nome e Matrícula são obrigatórios');
      return;
    }

    this.isSaving.set(true);
    try {
      const employeeData: Partial<Employee> = {
        nome:                this.nome(),
        matricula:           this.matricula(),
        empresa_id:          this.empresaId() ?? undefined,
        local_id:            this.localId() ?? undefined,
        cargo:               this.cargo(),
        ativo:               this.ativo() ? 1 : 0,
        trabalha_sabado:     this.trabalhaSabado() ? 1 : 0,
        data_admissao:       this.dataAdmissao() || undefined,
        data_fim_experiencia: this.dataFimExperiencia() || undefined,
      };

      if (this.mode() === 'create') {
        await this.employeeService.createEmployee(employeeData);
        this.toastService.success('Colaborador criado com sucesso!');
      } else {
        await this.employeeService.updateEmployee(this.employee()!.id, employeeData);
        this.toastService.success('Colaborador atualizado com sucesso!');
      }

      this.save.emit();
    } catch (error) {
      this.toastService.error('Erro ao salvar colaborador. Verifique se a matrícula já não está em uso.');
      console.error(error);
    } finally {
      this.isSaving.set(false);
    }
  }

  getTitle(): string {
    return this.mode() === 'create' ? 'Novo Colaborador' : 'Editar Colaborador';
  }
}
