import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../services/auth/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private authService = inject(AuthService);
  userName = this.authService._userName;

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
    },
    {
      label: 'Relatórios',
      route: '/relatorios',
      icon: 'file-text'
    }
  ];
}
