import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
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
  private router = inject(Router);

  userName = this.authService._userName;
  isMenuOpen = signal(false);

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

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
