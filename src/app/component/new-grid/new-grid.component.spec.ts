import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app.module';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ActiveObjService } from '../../services/active-obj.service';
import { DragStateService } from '../../services/drag-state.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { NewGridComponent } from './new-grid.component';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * NewGridComponent renders through svg-pan-zoom, which needs real SVG layout;
 * jsdom has none. Every suite here stands the component up against a stub that
 * maps screen coordinates straight through, so screen and SVG units are equal.
 */
async function configureGridTestBed() {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof matchMedia;
  const svgGridStub = {
    horizontalLines: [],
    horizontalLinesMinor: [],
    verticalLines: [],
    verticalLinesMinor: [],
    viewBoxMinX: -10,
    viewBoxMaxX: 10,
    viewBoxMinY: -10,
    viewBoxMaxY: 10,
    panZoomObject: { resize: vi.fn(), fit: vi.fn(), center: vi.fn() },
    getZoom: () => 1,
    scaleWithZoom: (value: number) => value,
    screenToSVGfromXY: (x: number, y: number) => ({ x, y }),
    SVGtoScreen: (coord: { x: number; y: number }) => coord,
    setNewElement: (element: HTMLElement) => element.classList.add('svg-pan-zoom_viewport'),
  };
  await TestBed.configureTestingModule({ imports: [AppModule] })
    .overrideProvider(SvgGridService, { useValue: svgGridStub })
    .compileComponents();
}

describe('NewGridComponent welded SVG presentation', () => {
  beforeEach(configureGridTestBed);

  it('renders one filleted root path plus dotted constituent paths when selected', () => {
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    // Model units (user units x MODEL_SCALE), so the link geometry and the
    // objectScale-derived link width keep the proportions the app renders at.
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 0, 4 * MODEL_SCALE);
    const c = new RevJoint('C', 3 * MODEL_SCALE, 5 * MODEL_SCALE);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    const compound = new RealLink('ABC', [a, b, c], 2, 1, undefined, [ab, bc]);
    compound.fill = '#303e9f';
    b.isWelded = true;
    a.links = [compound];
    b.links = [compound];
    c.links = [compound];
    mechanism.joints = [a, b, c];
    mechanism.links = [compound];
    active.objType = 'Link';
    active.selectedLink = compound;

    const fixture = TestBed.createComponent(NewGridComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector('#ABC') as SVGPathElement;
    const components = fixture.nativeElement.querySelectorAll('#ABC__components path');
    expect(root.tagName.toLowerCase()).toBe('path');
    expect(root.getAttribute('d')).toContain('Q');
    expect(components.length).toBe(2);
    expect(components[0].getAttribute('stroke-dasharray')).not.toBeNull();
    expect(components[0].getAttribute('d')).toBe(ab.d);
    expect(components[1].getAttribute('d')).toBe(bc.d);
  });

  it('rebuilds the mechanism only once for each joint-drag event', () => {
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    const gridUtils = TestBed.inject(GridUtilsService);
    const joint = new RevJoint('A', 0, 0);
    mechanism.joints = [joint];
    mechanism.links = [];
    active.selectedJoint = joint;

    const fixture = TestBed.createComponent(NewGridComponent);
    const component = fixture.componentInstance;
    TestBed.inject(DragStateService).beginDraggingJoint();
    component['timeMouseDown'] = 0;
    component['startX'] = 0;
    component['startY'] = 0;
    const drag = vi.spyOn(gridUtils, 'dragJoint');
    const rebuild = vi.spyOn(mechanism, 'updateMechanism');

    component.mouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));

    expect(drag).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});

/**
 * Two separate bars, A-B and C-D, with C sitting exactly where a drag to
 * (20, 20) lands. The SvgGridService stub maps screen coordinates straight
 * through, so those numbers are also the SVG coordinates.
 */
function twoBars(mechanism: MechanismService) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 5, 5);
  const c = new RevJoint('C', 20, 20);
  const d = new RevJoint('D', 30, 20, false, true);
  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
    });
    return link;
  };
  const ab = wire('AB', [a, b]);
  const cd = wire('CD', [c, d]);
  mechanism.joints = [a, b, c, d];
  mechanism.links = [ab, cd];
  mechanism.updateMechanism();
  return { a, b, c, d, ab, cd };
}

function drag(component: NewGridComponent, steps: number) {
  component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
  for (let step = 1; step <= steps; step++) {
    const along = 5 + ((20 - 5) * step) / steps;
    component.mouseMove(new MouseEvent('mousemove', { clientX: along, clientY: along }));
  }
  component.mouseUp(new MouseEvent('mouseup'));
}

describe('NewGridComponent drag gestures', () => {
  beforeEach(configureGridTestBed);

  function setUp() {
    const mechanism = TestBed.inject(MechanismService);
    const scene = twoBars(mechanism);
    const fixture = TestBed.createComponent(NewGridComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { mechanism, component, fixture, ...scene };
  }

  // Undo is a stack of URL strings. A drag that saved per pointer-move would
  // make the user press undo once for every frame of a gesture.
  it('records exactly one undo entry for a multi-step joint drag', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('records no undo entry for a click that only selected a joint', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect(save).not.toHaveBeenCalled();
  });

  it('merges the dragged joint into the one it is released over', () => {
    const { mechanism, component, b, c } = setUp();
    vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(mechanism.joints.map((joint) => joint.id)).toEqual(['A', 'C', 'D']);
    expect(mechanism.links.map((link) => link.id).sort()).toEqual(['AC', 'CD']);
    expect(c.links.map((link) => link.id).sort()).toEqual(['AC', 'CD']);
  });

  it('still records one undo entry when the drag ends in a merge', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows the snap indicator while hovering a legal target, and clears it on release', () => {
    const { mechanism, component, b, c } = setUp();
    vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 12 }));
    expect(component.snapTargetJoint).toBeUndefined();

    component.mouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    expect(component.snapTargetJoint).toBe(c);

    component.mouseUp(new MouseEvent('mouseup'));
    expect(component.snapTargetJoint).toBeUndefined();
  });

  // A link drag translates by how far the pointer moved, not to where the
  // pointer is: the grab point stays under the cursor. The moves have to clear
  // the 10-unit hold that separates a drag from a click.
  it('drags a whole link, moving all of its joints and saving once', () => {
    const { mechanism, component, c, d, cd } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 14, clientY: 16 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect([c.x, c.y]).toEqual([34, 36]);
    expect([d.x, d.y]).toEqual([44, 36]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('holds a link still until the pointer clears the click threshold', () => {
    const { component, c, cd } = setUp();
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 3, clientY: 3 }));

    expect([c.x, c.y]).toEqual([20, 20]);
  });

  // A link drag accumulates pointer deltas, so the press has to record where
  // the gesture started. Without that, the first move would translate the link
  // by the distance from the last unrelated pointer event — a jump on grab.
  it('does not jump on the first move of a link drag', () => {
    const { component, c, cd } = setUp();
    component.mouseMove(new MouseEvent('mousemove', { clientX: 300, clientY: 300 }));
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));

    expect([c.x, c.y]).toEqual([32, 33]);
  });

  // Analyze presents itself as read-only, and refused the edit context menu, but
  // dragging went straight through. Whole-link drag would have made that worse.
  it('refuses to drag anything while Analysis mode is showing', () => {
    const { component, b, c, cd } = setUp();
    TestBed.inject(SelectedTabService).setTab(TabID.ANALYZE);

    component.setLastLeftClick(b);
    drag(component, 8);
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));
    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect([b.x, b.y]).toEqual([5, 5]);
    expect([c.x, c.y]).toEqual([20, 20]);
  });
});
