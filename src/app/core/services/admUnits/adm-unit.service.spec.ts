import { TestBed } from '@angular/core/testing';

import { AdmUnitService } from './adm-unit.service';

describe('AdmUnitService', () => {
  let service: AdmUnitService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdmUnitService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
