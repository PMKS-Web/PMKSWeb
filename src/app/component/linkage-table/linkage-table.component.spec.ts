import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkageTableComponent } from './linkage-table.component';

describe('LinkageTableComponent', () => {
  let component: LinkageTableComponent;
  let fixture: ComponentFixture<LinkageTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LinkageTableComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LinkageTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
