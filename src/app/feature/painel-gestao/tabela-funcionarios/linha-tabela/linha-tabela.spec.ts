import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinhaTabela } from './linha-tabela';

describe('LinhaTabela', () => {
  let component: LinhaTabela;
  let fixture: ComponentFixture<LinhaTabela>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinhaTabela]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinhaTabela);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
