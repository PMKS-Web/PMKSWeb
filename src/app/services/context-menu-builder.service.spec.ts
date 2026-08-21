import { Injector } from '@angular/core';
import { ContextMenuBuilderService, MenuHandlers } from './context-menu-builder.service';
import { ContextMenuModel, MenuRow } from '../component/context-menu/menu-model';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { DragStateService } from './drag-state.service';
import { GridUtilsService } from './grid-utils.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SaveHistoryService } from './save-history.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { silentNotifications } from '../../test-utils/notification-stub';
import { wireGraph } from '../../test-utils/mechanism-harness';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';

/**
 * What the right-click menu offers, and what it says when it cannot.
 *
 * The claim being tested is not "these rows exist" but "the menu says what the
 * model says". Every refusal below is written somewhere else — in
 * `describeActuator`, in `canToggleWeld`, in `deleteLink`'s orphan rule — and
 * the menu is only allowed to quote them. So the assertions check the reason
 * as well as the greying: a row greyed for the wrong reason is a row that will
 * send a student to fix the wrong thing.
 */

const S = MODEL_SCALE;

/** The shortcut registry, minus the window listener a spec has no use for. */
const keysStub = {
  keysFor: (id: string) => (id === 'edit.lock' ? 'K' : id === 'edit.delete' ? 'Delete' : ''),
  tip: (name: string) => name,
};

const noHandlers: MenuHandlers = {
  attachLink: () => {},
  attachCylinder: () => {},
  attachTracerPoint: () => {},
  attachForce: () => {},
  backgroundImage: () => {},
  deletePosition: () => {},
  deleteAllPositions: () => {},
};

function createBuilderHarness() {
  if (!ColorService.instance) new ColorService();
  const injector = Injector.create({
    providers: [
      { provide: SettingsService, deps: [] },
      { provide: NumberUnitParserService, deps: [] },
      { provide: ActiveObjService, deps: [] },
      { provide: DragStateService, deps: [] },
      { provide: SelectedTabService, deps: [] },
      { provide: NotificationService, useFactory: silentNotifications, deps: [] },
      { provide: SaveHistoryService, useValue: { save: () => {} } },
      { provide: SynthesisBuilderService, deps: [] },
      { provide: SvgGridService, deps: [] },
      { provide: GridUtilsService, deps: [] },
      { provide: MechanismService, deps: [] },
      { provide: KeyboardShortcutsService, useValue: keysStub },
      { provide: ContextMenuBuilderService, deps: [] },
    ],
  });
  return {
    builder: injector.get(ContextMenuBuilderService),
    mechanism: injector.get(MechanismService),
    tabs: injector.get(SelectedTabService),
    synthesis: injector.get(SynthesisBuilderService),
  };
}

/** A crank-rocker: ground O, crank OA, coupler ACT with a tracer, rocker CD. */
function fourBar(mechanism: MechanismService) {
  const o = new RevJoint('O', 0, 0, false, true);
  const a = new RevJoint('A', 0, 2 * S);
  const c = new RevJoint('C', 3 * S, 2 * S);
  const d = new RevJoint('D', 3 * S, 0, false, true);
  const t = new RevJoint('T', 2 * S, 3 * S);
  const crank = new RealLink('OA', [o, a], 1, 1);
  const coupler = new RealLink('ACT', [a, c, t], 1, 1);
  const rocker = new RealLink('CD', [c, d], 1, 1);
  mechanism.joints = [o, a, c, d, t];
  mechanism.links = [crank, coupler, rocker];
  mechanism.forces = [];
  wireGraph(mechanism);
  return { o, a, c, d, t, crank, coupler, rocker };
}

function rows(model: ContextMenuModel): MenuRow[] {
  return model.groups.flatMap((group) => group.rows);
}

function row(model: ContextMenuModel, label: string): MenuRow | undefined {
  return rows(model).find((one) => one.label === label);
}

function labels(model: ContextMenuModel): string[] {
  return rows(model).map((one) => one.label);
}

describe('the right-click menu', () => {
  let harness: ReturnType<typeof createBuilderHarness>;

  beforeEach(() => {
    harness = createBuilderHarness();
    harness.tabs.setTab(TabID.EDIT);
  });

  describe('the ladder', () => {
    it('runs Attach, then State, then the destructive footer', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.a, noHandlers);
      expect(model.groups.map((group) => group.label)).toEqual(['Attach', 'State', undefined]);
    });

    it('puts Delete last, whatever else the menu holds', () => {
      const parts = fourBar(harness.mechanism);
      for (const target of [parts.a, parts.t, parts.crank, parts.coupler]) {
        const all = rows(harness.builder.build(target, noHandlers));
        expect(all[all.length - 1].destructive).toBe(true);
        expect(all.filter((one) => one.destructive).length).toBe(1);
      }
    });

    it('names the target rather than leaving the reader to guess', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.a, noHandlers);
      expect(model.header?.title).toBe('Joint A');
      expect(model.header?.subtitle).toBe('Pin · Links OA, ACT');
    });

    it('writes states as states, not as verbs that rewrite themselves', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.o, noHandlers);
      expect(labels(model)).toContain('Grounded');
      expect(labels(model)).not.toContain('Remove Ground');
      expect(row(model, 'Grounded')!.checked).toBe(true);
      expect(row(model, 'Grounded')!.kind).toBe('toggle');
    });
  });

  describe('refusals come from the model', () => {
    it('greys the input on a joint where three bodies meet, and says so', () => {
      const parts = fourBar(harness.mechanism);
      // A fourth body at A: three links now meet there.
      const extra = new RevJoint('X', -2 * S, 2 * S);
      const spur = new RealLink('AX', [parts.a, extra], 1, 1);
      harness.mechanism.joints.push(extra);
      harness.mechanism.links.push(spur);
      wireGraph(harness.mechanism);

      const driven = row(harness.builder.build(parts.a, noHandlers), 'Driven Input')!;
      expect(driven.disabled).toBe(true);
      expect(driven.refusal!.short).toBe('3 bodies meet');
      expect(driven.refusal!.long).toContain('would not say which pair moves');
    });

    it('greys the weld on a joint with nothing to fuse', () => {
      const parts = fourBar(harness.mechanism);
      const weld = row(harness.builder.build(parts.t, noHandlers), 'Welded')!;
      expect(weld.disabled).toBe(true);
      expect(weld.refusal!.short).toBe('needs 2 links');
    });

    it('leaves both directions of a mutually exclusive pair usable', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.input = true;
      const model = harness.builder.build(parts.a, noHandlers);
      // Weld greys on a driven joint...
      expect(row(model, 'Welded')!.refusal!.short).toBe('it is driven');
      // ...and the switch that resolves it stays live.
      expect(row(model, 'Driven Input')!.disabled).toBe(false);
      expect(row(model, 'Driven Input')!.checked).toBe(true);
    });

    it('will not anchor a load where two links share the pin', () => {
      const parts = fourBar(harness.mechanism);
      expect(row(harness.builder.build(parts.a, noHandlers), 'Force')!.refusal!.short).toBe(
        '2 links share it'
      );
      // And offers it where the answer is unambiguous.
      expect(row(harness.builder.build(parts.t, noHandlers), 'Force')!.disabled).toBe(false);
    });

    it('greys a disc on a link with no fixed pin to sweep about', () => {
      const parts = fourBar(harness.mechanism);
      const disc = row(harness.builder.build(parts.coupler, noHandlers), 'Drawn as a Disc')!;
      expect(disc.refusal!.short).toBe('needs a fixed pin');
      // The crank turns about a grounded pin, so it may be drawn as one.
      expect(row(harness.builder.build(parts.crank, noHandlers), 'Drawn as a Disc')!.disabled).toBe(
        false
      );
    });
  });

  describe('locks', () => {
    it('stops a locked part being deleted, and says which way out', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build(parts.a, noHandlers);
      expect(row(model, 'Locked')!.checked).toBe(true);
      const remove = rows(model).find((one) => one.destructive)!;
      expect(remove.refusal!.short).toBe('unlock first');
      // Its own switch stays live: one click here frees it.
      expect(row(model, 'Locked')!.disabled).toBe(false);
    });

    it('refuses to attach to a locked joint for the same reason', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build(parts.a, noHandlers);
      expect(row(model, 'Link')!.refusal!.short).toBe('unlock first');
    });

    it('counts what Lock All and Unlock All would touch', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build('grid', noHandlers);
      expect(row(model, 'Lock All')!.hint).toBe('4 open');
      expect(row(model, 'Unlock All')!.hint).toBe('1 locked');
      // The pair never both grey at once, so there is always a way out.
      expect(row(model, 'Lock All')!.disabled).toBe(false);
      expect(row(model, 'Unlock All')!.disabled).toBe(false);
    });
  });

  describe('duplicating a link', () => {
    it('copies a link of any shape, set down beside the original', () => {
      const parts = fourBar(harness.mechanism);
      const before = harness.mechanism.links.length;
      // Three joints, not two: the first cut of this quietly did nothing here,
      // which is exactly what "Duplicate does nothing" looked like.
      harness.mechanism.duplicateLink(parts.coupler);
      expect(harness.mechanism.links.length).toBe(before + 1);
      const copy = harness.mechanism.links[harness.mechanism.links.length - 1];
      expect(copy.joints.length).toBe(3);
      // Beside it, not on it: a copy that lands under the original reads as
      // nothing having happened.
      const moved = copy.joints[0];
      const from = parts.coupler.joints[0];
      expect(Math.hypot(moved.x - from.x, moved.y - from.y)).toBeGreaterThan(0.5 * S);
      // And free-standing: it shares no joint with what it was copied from.
      const shared = copy.joints.filter((one) =>
        parts.coupler.joints.some((other) => other.id === one.id)
      );
      expect(shared.length).toBe(0);
    });

    it('greys the row on a welded compound rather than doing nothing', () => {
      const parts = fourBar(harness.mechanism);
      // A compound: several links and the welds between them.
      (parts.coupler as RealLink).subset = [parts.crank, parts.rocker];
      const duplicate = row(harness.builder.build(parts.coupler, noHandlers), 'Duplicate Link')!;
      expect(duplicate.disabled).toBe(true);
      expect(duplicate.refusal!.short).toBe('welded compound');
    });
  });

  describe('cascades are named, not confirmed', () => {
    it('counts the joints deleting a link would sweep up', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.crank, noHandlers)).find(
        (one) => one.destructive
      )!;
      // O is on the crank alone and goes with it; A is on two links and stays.
      expect(remove.label).toBe('Delete Link and Joint O');
    });

    it('names the links deleting a joint would take with it', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.a, noHandlers)).find(
        (one) => one.destructive
      )!;
      // The crank is left with one end; the three-joint coupler survives.
      expect(remove.label).toBe('Delete Joint and Link OA');
    });

    it('says plain Delete Joint when nothing else goes with it', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.c, noHandlers)).find(
        (one) => one.destructive
      )!;
      expect(remove.label).toBe('Delete Joint and Link CD');
      expect(
        rows(harness.builder.build(parts.t, noHandlers)).find((one) => one.destructive)!.label
      ).toBe('Delete Joint');
    });
  });

  describe('words the reader has to live with', () => {
    it('never writes a state as a verb that flips', () => {
      const parts = fourBar(harness.mechanism);
      for (const target of [parts.a, parts.o, parts.crank]) {
        for (const one of rows(harness.builder.build(target, noHandlers))) {
          expect(one.label).not.toMatch(/^(Add|Remove|Make|Un)[A-Z ]/);
        }
      }
    });
  });

  describe('modes', () => {
    it('offers only the view of a joint in an analysis mode', () => {
      const parts = fourBar(harness.mechanism);
      harness.tabs.setTab(TabID.ANALYZE);
      const model = harness.builder.build(parts.a, noHandlers);
      expect(labels(model)).toEqual(['Trace Path']);
      // Geometry is frozen there, so Attach and the footer are absent rather
      // than greyed — and the way back into Edit rides the header.
      expect(model.header?.crossing?.icon).toBe('edit_outline');
    });

    it('crosses into analysis from Edit, greyed when there is nothing to analyse', () => {
      fourBar(harness.mechanism);
      const empty = harness.builder.build('grid', noHandlers);
      expect(empty.header?.crossing).toBeUndefined();
      const joint = harness.builder.build(harness.mechanism.joints[0], noHandlers);
      // No input has been set, so the mechanism cannot run yet.
      expect(joint.header?.crossing?.refusal?.short).toBe('not ready');
    });

    it('offers nothing but the positions in Synthesis', () => {
      fourBar(harness.mechanism);
      harness.tabs.setTab(TabID.SYNTHESIZE);
      expect(rows(harness.builder.build('grid', noHandlers)).length).toBe(0);
    });
  });

  describe('away from the start pose', () => {
    it('greys what edits the mechanism and leaves the view alone', () => {
      const parts = fourBar(harness.mechanism);
      harness.mechanism.mechanismTimeStep = 12;
      const model = harness.builder.build(parts.t, noHandlers);
      expect(row(model, 'Grounded')!.refusal!.short).toBe('not at the start');
      // A trace is a view of the mechanism, not a change to it.
      expect(row(model, 'Trace Path')!.disabled).toBe(false);
    });
  });
});
