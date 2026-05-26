import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../services/auth/auth.service';
import { MarcacaoApiService } from '../services/marcacao-api/marcacao-api.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  host: { '[class.collapsed]': 'isCollapsed()' }
})
export class Sidebar {
  private authService = inject(AuthService);
  private router = inject(Router);
  private marcacaoApiService = inject(MarcacaoApiService);

  userName = this.authService._userName;
  apiStatus = this.marcacaoApiService.apiStatus;
  responseTime = this.marcacaoApiService.averageResponseTime;
  isMenuOpen = signal(false);
  isCollapsed = signal(false);

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  toggleCollapse() {
    this.isCollapsed.update(v => !v);
    if (this.isMenuOpen()) this.isMenuOpen.set(false);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  menuItems = [
    { label: 'Painel de Pontos',  route: '/painel-pontos',              icon: 'clipboard-list' },
    { label: 'Colaboradores',     route: '/colaboradores',              icon: 'users'          },
    { label: 'Relógios',          route: '/relogios',                   icon: 'clock'          },
    { label: 'Relatórios',        route: '/relatorios',                 icon: 'file-text'      },
    { label: 'Eventos',           route: '/eventos',                    icon: 'calendar'       },
    { label: 'Auditoria',         route: '/auditoria',                  icon: 'shield-check'   },
    { label: 'Empresas da API',   route: '/configuracoes/empresas',     icon: 'building-2'     },
    { label: 'Empresas',          route: '/configuracoes/empresas-lista', icon: 'building'     },
    { label: 'Locais',            route: '/configuracoes/locais',       icon: 'map-pin'        },
  ];
}
