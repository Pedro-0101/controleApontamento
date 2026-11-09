import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../services/auth/auth.service';
import { MarcacaoApiService } from '../services/marcacao-api/marcacao-api.service';
import { EmpresaConfigService } from '../services/empresa-config/empresa-config.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  host: { '[class.collapsed]': 'isCollapsed()' }
})
export class Sidebar implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private marcacaoApiService = inject(MarcacaoApiService);
  private empresaConfigService = inject(EmpresaConfigService);

  userName = this.authService._userName;
  apiStatus = this.marcacaoApiService.apiStatus;
  responseTime = this.marcacaoApiService.averageResponseTime;
  isMenuOpen = signal(false);
  isCollapsed = signal(false);
  temPontoCertificado = signal(true);

  async ngOnInit() {
    try {
      const empresas = await this.empresaConfigService.listar();
      const ativas = empresas.filter((empresa) => Number(empresa.ativo) === 1);
      // Sem empresas cadastradas mantém o menu visível; com apenas a conta
      // Exata, esconde recursos exclusivos da Ponto Certificado.
      if (ativas.length > 0) {
        this.temPontoCertificado.set(
          ativas.some((empresa) => empresa.provedor !== 'exata')
        );
      }
    } catch {
      // Falha ao consultar não deve esconder a navegação.
    }
  }

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

  get menuItems() {
    const itens = [
      { label: 'Painel de Pontos',  route: '/painel-pontos',              icon: 'clipboard-list' },
      { label: 'Colaboradores',     route: '/colaboradores',              icon: 'users'          },
    ];

    if (this.temPontoCertificado()) {
      itens.push({ label: 'Relógios', route: '/relogios', icon: 'clock' });
    }

    itens.push(
      { label: 'Relatórios',        route: '/relatorios',                 icon: 'file-text'      },
      { label: 'Relatórios Consolidados', route: '/relatorios-consolidados', icon: 'bar-chart-3' },
      { label: 'Faltas',            route: '/faltas',                     icon: 'calendar-x'     },
      { label: 'Relatórios Agendados', route: '/relatorios-agendados',     icon: 'send'           },
      { label: 'Eventos',           route: '/eventos',                    icon: 'calendar'       },
      { label: 'Auditoria',         route: '/auditoria',                  icon: 'shield-check'   },
      { label: 'Empresas da API',   route: '/configuracoes/empresas',     icon: 'building-2'     },
      { label: 'Empresas',          route: '/configuracoes/empresas-lista', icon: 'building'     },
      { label: 'Locais',            route: '/configuracoes/locais',       icon: 'map-pin'        }
    );

    return itens;
  }
}
