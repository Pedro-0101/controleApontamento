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
  options = input.required<any[]>();
  placeholder = input<string>('Selecione...');
  searchPlaceholder = input<string>('Buscar...');
  disabled = input<boolean>(false);
  initialValue = input<string[]>([]);

  // Custom property paths for objects
  labelProp = input<string>('nome');
  valueProp = input<string>('matricula');
  subLabelProp = input<string | null>('matricula');

  selectedValues = signal<string[]>([]);
  selectionChange = output<string[]>();

  searchTerm = signal('');
  isDropdownOpen = signal(false);

  // Filter options based on search term
  filteredOptions = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const list = this.options();
    if (!term) return list;

    return list.filter(opt => {
      const label = this.getLabel(opt).toLowerCase();
      const value = this.getValue(opt).toLowerCase();
      const subLabel = this.getSubLabel(opt)?.toLowerCase() || '';

      return label.includes(term) || value.includes(term) || subLabel.includes(term);
    });
  });

  getLabel(opt: any): string {
    if (typeof opt === 'string') return opt;
    return opt[this.labelProp()] || '';
  }

  getValue(opt: any): string {
    if (typeof opt === 'string') return opt;
    return opt[this.valueProp()] || '';
  }

  getSubLabel(opt: any): string | null {
    if (typeof opt === 'string') return null;
    const prop = this.subLabelProp();
    return prop ? opt[prop] : null;
  }

  constructor() {
    // Sync initial value
    effect(() => {
      this.selectedValues.set(this.initialValue());
    }, { allowSignalWrites: true });

    // Emit selection changes
    effect(() => {
      this.selectionChange.emit(this.selectedValues());
    });
  }

  toggleDropdown() {
    if (this.disabled()) return;
    this.isDropdownOpen.update(v => !v);
  }

  toggleOption(value: string) {
    if (this.disabled()) return;
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
    if (this.disabled()) return;
    const filtered = this.filteredOptions();
    const allSelected = filtered.every(opt =>
      this.selectedValues().includes(this.getValue(opt))
    );

    if (allSelected) {
      // Deselect all filtered
      const filteredValues = filtered.map(e => this.getValue(e));
      this.selectedValues.update(current =>
        current.filter(v => !filteredValues.includes(v))
      );
    } else {
      // Select all filtered (merge with existing)
      const allValues = [...this.selectedValues(), ...filtered.map(e => this.getValue(e))];
      this.selectedValues.set([...new Set(allValues)]);
    }
  }

  isAllSelected(): boolean {
    const filtered = this.filteredOptions();
    if (filtered.length === 0) return false;

    return filtered.every(opt =>
      this.selectedValues().includes(this.getValue(opt))
    );
  }

  clearSelection() {
    if (this.disabled()) return;
    this.selectedValues.set([]);
  }
}
