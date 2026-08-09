import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import {
  buildMechanismFixture,
  LOOPLESS_WELDED_MECHANISM,
} from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../MODALS/templates/template-linkages';
import { AnalysisPanelComponent } from './analysis-panel.component';

async function createPanel(payload: string, selectedId: string) {
  const fixtureData = buildMechanismFixture(payload);
  const selected =
    fixtureData.service.joints.find((joint) => joint.id === selectedId) ??
    fixtureData.service.links.find((link) => link.id === selectedId)!;
  fixtureData.active.updateSelectedObj(selected);

  await TestBed.configureTestingModule({
    declarations: [AnalysisPanelComponent],
    imports: [ReactiveFormsModule, MatFormFieldModule, NoopAnimationsModule],
    providers: [
      { provide: ActiveObjService, useValue: fixtureData.active },
      { provide: MechanismService, useValue: fixtureData.service },
      { provide: SettingsService, useValue: fixtureData.settings },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AnalysisPanelComponent> =
    TestBed.createComponent(AnalysisPanelComponent);
  return { fixture, fixtureData };
}

describe('AnalysisPanelComponent welded mechanism regression', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders analysis controls for a valid loopless welded link instead of blanking', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'A');
    expect(() => fixture.detectChanges()).not.toThrow();

    const rows = fixture.componentInstance.jointForceRows();
    expect(rows.length).toBeGreaterThan(0);
    Object.assign(fixture.componentInstance.graphExpanded, {
      JPos: true,
      JInputForce: true,
    });
    for (const row of rows) {
      fixture.componentInstance.graphExpanded['JForce_' + row.linkId] = true;
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Analysis for Joint A');
    expect(fixture.nativeElement.textContent).toContain('Force Analysis');
    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph').length).toBe(
      rows.length + 2
    );

    fixture.destroy();
  });

  it('maps the 0/1 radio values onto the mechanism-wide force analysis mode', async () => {
    const { fixture, fixtureData } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'A');
    fixture.detectChanges();

    expect(fixture.componentInstance.forceAnalysisMode()).toBe('static');
    fixture.componentInstance.forceAnalysisFormGroup.patchValue({ mode: '1' });
    expect(fixtureData.settings.forceAnalysisMode.value).toBe('dynamic');
    expect(fixture.componentInstance.forceAnalysisMode()).toBe('dynamic');

    // The setting is the source of truth, so an external change flows back in.
    fixtureData.settings.forceAnalysisMode.next('static');
    expect(fixture.componentInstance.forceAnalysisFormGroup.value.mode).toBe('0');
    fixture.destroy();
  });

  it('explains that an internal welded joint has no independent pin reaction', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'B');
    fixture.detectChanges();

    expect(fixture.componentInstance.jointForceRows()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('internal to one welded body');
    expect(fixture.nativeElement.textContent).toContain('no independent pin reaction');
    fixture.destroy();
  });

  it('lists one force row per link reacting at an external multi-link pin', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'B');
    fixture.detectChanges();

    const rows = fixture.componentInstance.jointForceRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.jointId === 'B')).toBe(true);
    expect(fixture.nativeElement.querySelector('.reaction-link-selector')).toBeNull();

    const titles = [...fixture.nativeElement.querySelectorAll('mat-panel-title')].map(
      (title: Element) => title.textContent!.trim()
    );
    for (const row of rows) {
      expect(titles).toContain(`Force on Link ${row.linkName}`);
    }
    fixture.destroy();
  });

  it('lists one force row per external joint on a link, sharing the joint-side dataset', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'BC');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Analysis for Link BC');
    expect(fixture.nativeElement.textContent).not.toContain('Kinematic Analysis for Link');

    const rows = fixture.componentInstance.linkForceRows();
    expect(rows.map((row) => row.jointId)).toEqual(['B', 'C']);
    expect(rows.every((row) => row.linkId === 'BC')).toBe(true);

    const titles = [...fixture.nativeElement.querySelectorAll('mat-panel-title')].map(
      (title: Element) => title.textContent!.trim()
    );
    expect(titles).toContain('Force at Joint B');
    expect(titles).toContain('Force at Joint C');
    fixture.destroy();
  });

  it('draws both panels from the one reaction dataset keyed by link and joint', async () => {
    const { fixture, fixtureData } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'BC');
    fixture.detectChanges();

    const analysis = fixtureData.mechanism.getForceAnalysis('static');
    const frame = analysis.frames.find((candidate) => candidate.status === 'ok')!;
    for (const row of fixture.componentInstance.linkForceRows()) {
      // The link-side row and the joint-side row address the same map entry.
      expect(analysis.reactionIndex.linksByJoint.get(row.jointId)).toContain(row.linkId);
      expect(frame.jointReactionsByLink.get(row.jointId)?.has(row.linkId)).toBe(true);
    }
    fixture.destroy();
  });

  it('renders every joint kinematics graph without losing expansion state', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'B');
    Object.assign(fixture.componentInstance.graphExpanded, {
      JPos: true,
      JVel: true,
      JAcc: true,
    });
    fixture.detectChanges();

    const graphs = [...fixture.nativeElement.querySelectorAll('app-analysis-graph')];
    const properties = graphs.map((graph: Element) => graph.getAttribute('mechprop'));
    expect(properties).toEqual(
      expect.arrayContaining(['Linear Joint Pos', 'Linear Joint Vel', 'Linear Joint Acc'])
    );
    fixture.componentInstance.graphExpanded['JPos'] = false;
    fixture.detectChanges();
    expect(fixture.componentInstance.graphExpanded['JPos']).toBe(false);
    fixture.destroy();
  });

  it('renders all six link kinematics graphs with valid expansion headers', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'AB');
    Object.assign(fixture.componentInstance.graphExpanded, {
      LAng: true,
      LAngVel: true,
      LAngAcc: true,
      LPos: true,
      LVel: true,
      LAcc: true,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph')).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('mat-panel-title mat-panel-title')).toBeNull();
    fixture.destroy();
  });

  it('does not render unfinished axial-force or stress graph placeholders', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'AB');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Axial Force');
    expect(fixture.nativeElement.textContent).not.toContain('Axial Stress');
    fixture.destroy();
  });

  it('shows a cylinder that cannot use its whole stroke, without calling it invalid', async () => {
    // A mechanism can be perfectly valid and still be driven by a ram bigger
    // than it needs. That is worth saying and is not a reason to refuse
    // analysis, so it gets its own line rather than the invalid block's.
    const { fixture, fixtureData } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'AB');
    fixtureData.service.cylinderReachWarning = () => 'Cylinder GC can only use 62% of its stroke.';
    fixture.detectChanges();

    // NO_ERRORS_SCHEMA stubs the block components, so their inputs do not
    // render -- the section being there at all is what this can honestly check.
    expect(fixture.nativeElement.querySelector('#cylinderReachContainer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#placeholderContainer')).toBeNull();
    fixture.destroy();
  });
});

describe('AnalysisPanelComponent with a cylinder selected', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('names the cylinder rather than its barrel link', async () => {
    // The canvas outlines the whole ram as selected while this panel headed
    // itself "Analysis for Link GN" -- the two disagreeing about what is
    // selected, for a part the rest of the app treats as one body.
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['Cylinder_Boom'], 'GN');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Analysis for Cylinder');
    expect(fixture.nativeElement.textContent).not.toContain('Analysis for Link GN');
    fixture.destroy();
  });

  it('offers no force row at a joint buried inside the part', async () => {
    // The buried barrel end and the slider in the bore have no hitbox on the
    // canvas and no row in the Edit panel; a pin reaction there is internal to
    // a body the user is being shown as one piece.
    const { fixture, fixtureData } = await createPanel(TEMPLATE_LINKAGES['Cylinder_Boom'], 'GN');
    fixture.detectChanges();

    const cylinder = fixtureData.service.cylinderAt(
      fixtureData.service.links.find((link) => link.id === 'GN')
    );
    expect(cylinder, 'the fixture really is a cylinder').toBeDefined();
    const interior = [cylinder!.barrelNear.id, cylinder!.pin.id, cylinder!.slider.id];
    for (const row of fixture.componentInstance.linkForceRows()) {
      expect(interior).not.toContain(row.jointId);
    }
    fixture.destroy();
  });
});
