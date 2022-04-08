import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalysisPopupComponent } from './analysis-popup.component';

describe('AnalysisPopupComponent', () => {
  let component: AnalysisPopupComponent;
  let fixture: ComponentFixture<AnalysisPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AnalysisPopupComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AnalysisPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
