import { Component, EventEmitter, input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

export interface FilterOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-search-filter',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './search-filter.html',
  styleUrl: './search-filter.css'
})
export class SearchFilter {
  searchPlaceholder = input<string>('Pesquisar...');
  filterLabel = input<string>('Filtrar por:');
  filterOptions = input<FilterOption[]>([]);
  showFilter = input<boolean>(true);

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<string>();

  searchText = signal('');
  selectedFilter = signal('all');
  searchTimeout: any;

  onSearchInput(value: string) {
    this.searchText.set(value);

    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.searchChange.emit(value);
    }, 300);
  }

  onFilterChange(value: string) {
    this.selectedFilter.set(value);
    this.filterChange.emit(value);
  }

  clearSearch() {
    this.searchText.set('');
    this.searchChange.emit('');
  }
}
