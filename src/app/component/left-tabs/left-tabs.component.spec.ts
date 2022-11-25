import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeftTabsComponent } from './left-tabs.component';

describe('LeftTabsComponent', () => {
  let component: LeftTabsComponent;
  let fixture: ComponentFixture<LeftTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LeftTabsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeftTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
