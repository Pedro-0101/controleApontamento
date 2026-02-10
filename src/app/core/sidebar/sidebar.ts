import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  menuItems = [
    {
      label: 'Painel de Pontos',
      route: '/painel-pontos',
      icon: 'clipboard-list'
    },
    {
      label: 'Colaboradores',
      route: '/colaboradores',
      icon: 'users'
    },
    {
      label: 'Relógios',
      route: '/relogios',
      icon: 'clock'
    }
  ];
}
