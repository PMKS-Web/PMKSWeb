import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppModule } from '../app.module';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { ActiveObjService } from '../services/active-obj.service';
import { EditPanelComponent } from './edit-panel/edit-panel.component';
import { SettingsPanelComponent } from './settings-panel/settings-panel.component';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { TemplatesComponent } from './MODALS/templates/templates.component';
import { TEMPLATE_IDS } from './MODALS/templates/template-linkages';

describe('always-on force and weld UI', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  });

  it('does not expose experimental enablement or loop equations actions', () => {
    const settings = TestBed.createComponent(SettingsPanelComponent);
    settings.detectChanges();
    const settingsText = settings.nativeElement.textContent;
    expect(settingsText).not.toContain('Experimental Features');
    expect(settingsText).not.toContain('Enable Forces');
    expect(settingsText).not.toContain('Enable Welded');
    expect(settingsText).not.toContain('Equations');

    const toolbar = TestBed.createComponent(ToolbarComponent);
    toolbar.detectChanges();
    expect(toolbar.nativeElement.textContent).not.toContain('Equations');
  });

  it('renders weld and force editing controls without enablement flags', () => {
    const active = TestBed.inject(ActiveObjService);
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    a.links = [ab];
    b.links = [ab, bc];
    c.links = [bc];
    a.connectedJoints = [b];
    b.connectedJoints = [a, c];
    c.connectedJoints = [b];

    active.objType = 'Joint';
    active.selectedJoint = b;
    const fixture: ComponentFixture<EditPanelComponent> =
      TestBed.createComponent(EditPanelComponent);
    fixture.detectChanges();
    // One Weld toggle, not a Weld/Unweld button pair: welding is one axis of
    // the 2x2 (§2.1), and two buttons cannot show which side of it the joint is
    // currently on. Unwelding is the same control turned off.
    expect(fixture.nativeElement.textContent).toContain('Weld');
    expect(fixture.nativeElement.textContent).not.toContain('Unweld');
    expect(fixture.nativeElement.querySelectorAll('mat-slide-toggle').length).toBeGreaterThan(2);

    active.objType = 'Link';
    active.selectedLink = bc;
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Add Force');

    active.objType = 'Force';
    active.selectedForce = new Force(
      'F1',
      bc,
      new Coord(1.5, 0),
      new Coord(1.5, 1),
      false,
      true,
      10
    );
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Edit Force');
    expect(fixture.nativeElement.textContent).toContain('Force Components');
    expect(fixture.nativeElement.textContent).toContain('Force Base Frame');
  });

  it('renders every analyzed built-in template as an immediately available action', () => {
    const templates = TestBed.createComponent(TemplatesComponent);
    templates.detectChanges();
    expect(templates.nativeElement.querySelectorAll('panel-section').length).toBe(
      TEMPLATE_IDS.length
    );
    const text = templates.nativeElement.textContent;
    expect(text).toContain('Four Bar Linkage');
    expect(text).toContain("Watt's Linkage");
    expect(text).toContain("Watt's Linkage II");
    expect(text).toContain('Stephenson III');
    expect(text).toContain('Slider Crank');
    expect(text).toContain('Whitworth Quick-Return');
    expect(text).toContain('Jansen Leg');

    // Every card has to reach a payload: a title with no linkage behind it is
    // a dead tile, and the click handler is the only thing that would say so.
    const images: string[] = Array.from(
      templates.nativeElement.querySelectorAll('panel-section img')
    ).map((img) => (img as HTMLImageElement).getAttribute('src') ?? '');
    expect(images.every((src) => src.startsWith('assets/gifs/'))).toBe(true);
  });
});
