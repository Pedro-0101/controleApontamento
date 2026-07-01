import { TestBed } from '@angular/core/testing';
import { describe, it, beforeEach, expect } from 'vitest';

import { MarcacaoService } from './marcacao.service';

describe('MarcacaoService', () => {
  let service: MarcacaoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MarcacaoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
