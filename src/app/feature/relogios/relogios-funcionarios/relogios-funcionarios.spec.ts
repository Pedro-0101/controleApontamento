import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import {
  LucideAngularModule,
  User,
  Users,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-angular';
import { RelogiosFuncionarios } from './relogios-funcionarios';

describe('RelogiosFuncionarios', () => {
  let component: RelogiosFuncionarios;
  let fixture: ComponentFixture<RelogiosFuncionarios>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelogiosFuncionarios],
      providers: [
        importProvidersFrom(LucideAngularModule.pick({
          User,
          Users,
          Search,
          X,
          ChevronUp,
          ChevronDown,
          ChevronLeft,
          ChevronRight
        }))
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RelogiosFuncionarios);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
