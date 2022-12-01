import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShapeSelectorComponent } from './shape-selector.component';

describe('ShapeSelectorComponent', () => {
  let component: ShapeSelectorComponent;
  let fixture: ComponentFixture<ShapeSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ShapeSelectorComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ShapeSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
