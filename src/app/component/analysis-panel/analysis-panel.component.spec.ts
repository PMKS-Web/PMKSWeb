import { SelectedTabService, TabID } from '../../selected-tab.service';
import { AnalysisGraphSectionComponent } from '../analysis-graph-section/analysis-graph-section.component';
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

async function createPanel(payload: string, selectedId: string, mode: TabID = TabID.ANALYZE) {
  const fixtureData = buildMechanismFixture(payload);
  const selected =
    fixtureData.service.joints.find((joint) => joint.id === selectedId) ??
    fixtureData.service.links.find((link) => link.id === selectedId)!;
  fixtureData.active.updateSelectedObj(selected);

  // Which mode the panel is being asked about. Kinematic and force analysis are
  // separate modes now and the panel shows one at a time, so a spec about force
  // rows has to be asking the force question.
  const tabs = { getCurrentTab: () => mode } as unknown as SelectedTabService;

  await TestBed.configureTestingModule({
    imports: [
      ReactiveFormsModule,
      MatFormFieldModule,
      NoopAnimationsModule,
      AnalysisPanelComponent,
    ],
    providers: [
      { provide: ActiveObjService, useValue: fixtureData.active },
      { provide: MechanismService, useValue: fixtureData.service },
      { provide: SettingsService, useValue: fixtureData.settings },
      { provide: SelectedTabService, useValue: tabs },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  })
    // The panel renders its graph sections as inert unknown elements — these
    // tests read the section labels, not the graphs inside them. As a
    // standalone component the panel brings the real section along, so it is
    // removed here to keep the label an attribute the specs can read.
    .overrideComponent(AnalysisPanelComponent, {
      remove: { imports: [AnalysisGraphSectionComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    })
    .compileComponents();

  const fixture: ComponentFixture<AnalysisPanelComponent> =
    TestBed.createComponent(AnalysisPanelComponent);
  return { fixture, fixtureData };
}

/**
 * What the panel calls each of its graphs, read off the section it renders.
 *
 * From the property rather than the attribute: an interpolated binding sets the
 * property, and this spec stubs the section component, so the attribute holds
 * only the static half of the string.
 */
function sectionLabels(fixture: ComponentFixture<AnalysisPanelComponent>): string[] {
  return [...fixture.nativeElement.querySelectorAll('app-analysis-graph-section')].map(
    (section: Element) =>
      (
        (section as unknown as { label?: string }).label ??
        section.getAttribute('label') ??
        ''
      ).trim()
  );
}

describe('AnalysisPanelComponent welded mechanism regression', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders force controls for a valid loopless welded link instead of blanking', async () => {
    // Force analysis is its own mode now, so this asks the force question and
    // counts only what that question answers: a graph per reacting link, plus
    // the input effort. The kinematic graphs are the other mode's, and the
    // test below is where they are counted.
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'A', TabID.FORCE);
    expect(() => fixture.detectChanges()).not.toThrow();

    const rows = fixture.componentInstance.jointForceRows();
    expect(rows.length).toBeGreaterThan(0);
    fixture.componentInstance.graphExpanded['JInputForce'] = true;
    for (const row of rows) {
      fixture.componentInstance.graphExpanded['JForce_' + row.linkId] = true;
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Force Analysis for Joint A');
    expect(fixture.nativeElement.textContent).not.toContain('Kinematic Analysis');
    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph-section').length).toBe(
      rows.length + 1
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

  it('explains a welded-in joint plainly, and shows nothing else to configure', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'B', TabID.FORCE);
    fixture.detectChanges();

    expect(fixture.componentInstance.jointForceRows()).toHaveLength(0);
    const text = fixture.nativeElement.textContent;
    // "Only one part" covers the tracer on a plain ternary link as well as a
    // welded-in pin — a joint can have no reaction without a weld anywhere.
    expect(text).toContain('Only one part meets Joint');
    expect(text).toContain('Click a joint where separate parts meet');
    // With no graph to configure, the mode selector and the input-speed
    // summary would describe things that are not on the panel.
    expect(text).not.toContain('Force Analysis Type');
    expect(text).not.toContain('input speed is set');
    // And it is the help-card hint pattern, not a boxed banner.
    expect(fixture.nativeElement.querySelector('.helpHint')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.analysis-message')).toBeNull();
    fixture.destroy();
  });

  it('lists one force row per link reacting at an external multi-link pin', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'B', TabID.FORCE);
    fixture.detectChanges();

    const rows = fixture.componentInstance.jointForceRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.jointId === 'B')).toBe(true);
    expect(fixture.nativeElement.querySelector('.reaction-link-selector')).toBeNull();

    const titles = sectionLabels(fixture);
    for (const row of rows) {
      // The row already carries the body's noun -- "Link AB", "Rod GC",
      // "Block at C" -- because what a body is called depends on what kind it
      // is, and the label is the one place that decides.
      expect(titles).toContain(`Force on ${row.linkName}`);
    }
    fixture.destroy();
  });

  it('lists one force row per external joint on a link, sharing the joint-side dataset', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'BC', TabID.FORCE);
    fixture.detectChanges();

    // The panel names the analysis it is showing, which is the heading the
    // accordion inside it used to carry.
    expect(fixture.nativeElement.textContent).toContain('Force Analysis for Link BC');

    const rows = fixture.componentInstance.linkForceRows();
    expect(rows.map((row) => row.jointId)).toEqual(['B', 'C']);
    expect(rows.every((row) => row.linkId === 'BC')).toBe(true);

    const titles = sectionLabels(fixture);
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

    const properties = [
      ...fixture.nativeElement.querySelectorAll('app-analysis-graph-section'),
    ].map((section: Element) => section.getAttribute('mechprop'));
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

    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph-section')).toHaveLength(6);
    // One heading each, and no accordion wrapping the six of them.
    expect(sectionLabels(fixture)).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('collapsible-subseciton')).toBeNull();
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
    // And so does every graph under the heading. A panel that calls the body a
    // cylinder at the top and a link in every row below has only moved the
    // disagreement down the page.
    const labels = sectionLabels(fixture);
    expect(labels.some((label) => label.includes('Link GN'))).toBe(false);
    expect(labels).toContain('Angle of Cylinder GC');
    fixture.destroy();
  });

  it("sends the reader to the cylinder's own panel to change its speed", async () => {
    // The joint driving a cylinder is buried inside it: no hitbox on the
    // canvas, no row in the Edit panel. "The input joint's Edit panel" names
    // somewhere the reader cannot get to.
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['Cylinder_Boom'], 'GN');
    fixture.detectChanges();

    // The hint is passed to a block component the schema here stubs out, so
    // it is read off the panel rather than off the rendered text.
    const hint = fixture.componentInstance.inputEditHint;
    expect(hint).toContain('Expansion Speed');
    expect(hint).toContain('Cylinder GC');
    expect(hint).not.toContain("input joint's Edit panel");
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

describe('AnalysisPanelComponent with a slider selected', () => {
  it('gives a pin the force in its bar and the force in its slot', async () => {
    const { fixture, fixtureData } = await createPanel(
      TEMPLATE_LINKAGES['Slider_Crank'],
      pinOfSlider(TEMPLATE_LINKAGES['Slider_Crank']),
      TabID.FORCE
    );
    fixture.detectChanges();
    const labels = fixture.componentInstance.jointForceRows().map((row) => row.label);

    // A slider is one thing to a reader and three bodies to the solver. The
    // block's force at the pin is the bar's force negated -- the same number
    // this panel already shows under the bar's own name -- and what the block
    // has of its own is the force in its slot, which carries the block's own
    // weight. Measured: with the block at 1g the slot reads 0.0147N, and with
    // it at 500g it reads 4.9N, while the force at the pin does not move.
    expect(labels).toEqual(['Force on Link BC', 'Force on the ground']);
    expect(labels.some((label) => /Block/.test(label))).toBe(false);
    expect(fixtureData.service.links.length).toBeGreaterThan(0);
  });

  it('names a slot after the slider a reader can point at', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['Scotch_Yoke'], 'CD', TabID.FORCE);
    fixture.detectChanges();
    const labels = fixture.componentInstance.linkForceRows().map((row) => row.label);

    // The slot cut into this link is a joint with no marker, no hitbox and no
    // name anyone has been shown.
    expect(labels.some((label) => label.includes('the slider at'))).toBe(true);
    expect(labels.some((label) => /Joint [EF]/.test(label))).toBe(false);
  });
});

/** The pin of the first slider in a payload, which is what a reader clicks. */
function pinOfSlider(payload: string): string {
  const built = buildMechanismFixture(payload);
  return built.service.joints.find((joint) => !!built.service.sliderFor(joint))!.id;
}
