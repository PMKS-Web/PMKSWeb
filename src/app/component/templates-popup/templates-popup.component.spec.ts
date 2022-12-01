import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplatesPopupComponent } from './templates-popup.component';

describe('TemplatesPopupComponent', () => {
  let component: TemplatesPopupComponent;
  let fixture: ComponentFixture<TemplatesPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TemplatesPopupComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TemplatesPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
