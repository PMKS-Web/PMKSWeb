import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnimationBarComponent } from './animation-bar.component';

describe('AnimationBarComponent', () => {
  let component: AnimationBarComponent;
  let fixture: ComponentFixture<AnimationBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AnimationBarComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AnimationBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
