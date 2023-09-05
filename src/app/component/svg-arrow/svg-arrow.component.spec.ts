import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SvgArrowComponent } from './svg-arrow.component';

describe('SvgArrowComponent', () => {
  let component: SvgArrowComponent;
  let fixture: ComponentFixture<SvgArrowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SvgArrowComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SvgArrowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
