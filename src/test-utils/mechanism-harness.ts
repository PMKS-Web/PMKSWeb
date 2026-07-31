import { Injector } from '@angular/core';
import { PrisJoint, RealJoint, RevJoint } from '../app/model/joint';
import { ActiveObjService } from '../app/services/active-obj.service';
import { ColorService } from '../app/services/color.service';
import { DragStateService } from '../app/services/drag-state.service';
import { GridUtilsService } from '../app/services/grid-utils.service';
import { MechanismService } from '../app/services/mechanism.service';
import { NumberUnitParserService } from '../app/services/number-unit-parser.service';
import { SettingsService } from '../app/services/settings.service';
import { SvgGridService } from '../app/services/svg-grid.service';
import { SynthesisBuilderService } from '../app/services/synthesis/synthesis-builder.service';

/**
 * A real `MechanismService` with its dependencies stubbed just enough to run
 * structural edits — welds, merges, deletions — without a DOM.
 *
 * Shared rather than copied per spec: the wiring below is what decides whether
 * a weld can happen at all, so two specs with two copies of it can disagree
 * about what they are testing while both stay green.
 */
export interface MechanismHarness {
  service: MechanismService;
  active: ActiveObjService;
  /**
   * How many undo entries the service has asked for.
   *
   * "One gesture, one entry" is an invariant Phase 1 established, and it is
   * also the only way to see the difference between an edit that was refused
   * and one that happened and was then undone by a reconcile.
   */
  saveCount: () => number;
}

export function createMechanismHarness(): MechanismHarness {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  const svg = new SvgGridService(settings, new DragStateService());
  const synthesis = new SynthesisBuilderService(parser, settings);
  let service!: MechanismService;
  const grid = new GridUtilsService(synthesis, svg, {
    get: () => service,
  } as unknown as Injector);
  const active = new ActiveObjService();
  let saves = 0;
  const injector = {
    get: () => ({
      save: () => {
        saves += 1;
      },
    }),
  } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);
  return { service, active, saveCount: () => saves };
}

/**
 * Fill in `links` and `connectedJoints` from link membership.
 *
 * Not optional bookkeeping: `canBeWelded` reads `links.length`, so a joint left
 * unwired declines every weld — and a test that welds nothing passes for
 * reasons that have nothing to do with what it claims to check.
 */
export function wireGraph(service: MechanismService): void {
  const real = service.joints.filter(
    (joint) => joint instanceof RevJoint || joint instanceof PrisJoint
  ) as RealJoint[];
  real.forEach((joint) => {
    joint.links = [];
    joint.connectedJoints = [];
  });
  service.links.forEach((link) => {
    link.joints.forEach((joint) => {
      (joint as RealJoint).links.push(link);
      link.joints.forEach((other) => {
        if (other.id !== joint.id) (joint as RealJoint).connectedJoints.push(other);
      });
    });
  });
}
