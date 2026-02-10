import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Employee } from '../../models/employee/employee';

@Component({
  selector: 'app-multi-select-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './multi-select-employees.html',
  styleUrl: './multi-select-employees.css'
})
export class MultiSelectEmployees {
  employees = input.required<Employee[]>();
  selectedEmployees = signal<string[]>([]);
  selectionChange = output<string[]>();

  searchTerm = signal('');
  isDropdownOpen = signal(false);

  // Filter employees based on search term
  filteredEmployees = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.employees();

    return this.employees().filter(emp =>
      emp.nome.toLowerCase().includes(term) ||
      emp.matricula.toLowerCase().includes(term)
    );
  });

  constructor() {
    // Emit selection changes
    effect(() => {
      this.selectionChange.emit(this.selectedEmployees());
    });
  }

  toggleDropdown() {
    this.isDropdownOpen.update(v => !v);
  }

  toggleEmployee(matricula: string) {
    const current = this.selectedEmployees();
    if (current.includes(matricula)) {
      this.selectedEmployees.set(current.filter(m => m !== matricula));
    } else {
      this.selectedEmployees.set([...current, matricula]);
    }
  }

  isEmployeeSelected(matricula: string): boolean {
    return this.selectedEmployees().includes(matricula);
  }

  toggleSelectAll() {
    const filtered = this.filteredEmployees();
    const allSelected = filtered.every(emp =>
      this.selectedEmployees().includes(emp.matricula)
    );

    if (allSelected) {
      // Deselect all filtered
      const filteredMatriculas = filtered.map(e => e.matricula);
      this.selectedEmployees.update(current =>
        current.filter(m => !filteredMatriculas.includes(m))
      );
    } else {
      // Select all filtered (merge with existing)
      const allMatriculas = [...this.selectedEmployees(), ...filtered.map(e => e.matricula)];
      this.selectedEmployees.set([...new Set(allMatriculas)]);
    }
  }

  isAllSelected(): boolean {
    const filtered = this.filteredEmployees();
    if (filtered.length === 0) return false;

    return filtered.every(emp =>
      this.selectedEmployees().includes(emp.matricula)
    );
  }

  clearSelection() {
    this.selectedEmployees.set([]);
  }
}
