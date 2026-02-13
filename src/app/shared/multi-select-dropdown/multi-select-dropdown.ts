import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Employee } from '../../models/employee/employee';

@Component({
  selector: 'app-multi-select-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './multi-select-dropdown.html',
  styleUrl: './multi-select-dropdown.css'
})
export class MultiSelectDropdown {
  options = input.required<Employee[]>();
  placeholder = input<string>('Selecione...');
  searchPlaceholder = input<string>('Buscar...');

  selectedValues = signal<string[]>([]);
  selectionChange = output<string[]>();

  searchTerm = signal('');
  isDropdownOpen = signal(false);

  // Filter options based on search term
  filteredOptions = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.options();

    return this.options().filter(opt =>
      opt.nome.toLowerCase().includes(term) ||
      opt.matricula.toLowerCase().includes(term)
    );
  });

  constructor() {
    // Emit selection changes
    effect(() => {
      this.selectionChange.emit(this.selectedValues());
    });
  }

  toggleDropdown() {
    this.isDropdownOpen.update(v => !v);
  }

  toggleOption(value: string) {
    const current = this.selectedValues();
    if (current.includes(value)) {
      this.selectedValues.set(current.filter(v => v !== value));
    } else {
      this.selectedValues.set([...current, value]);
    }
  }

  isOptionSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }

  toggleSelectAll() {
    const filtered = this.filteredOptions();
    const allSelected = filtered.every(opt =>
      this.selectedValues().includes(opt.matricula)
    );

    if (allSelected) {
      // Deselect all filtered
      const filteredValues = filtered.map(e => e.matricula);
      this.selectedValues.update(current =>
        current.filter(v => !filteredValues.includes(v))
      );
    } else {
      // Select all filtered (merge with existing)
      const allValues = [...this.selectedValues(), ...filtered.map(e => e.matricula)];
      this.selectedValues.set([...new Set(allValues)]);
    }
  }

  isAllSelected(): boolean {
    const filtered = this.filteredOptions();
    if (filtered.length === 0) return false;

    return filtered.every(opt =>
      this.selectedValues().includes(opt.matricula)
    );
  }

  clearSelection() {
    this.selectedValues.set([]);
  }
}
