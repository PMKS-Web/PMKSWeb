import { Mechanism } from './mechanism/mechanism';
import { RealLink } from './link';
import { SettingsService } from '../services/settings.service';
import {
  buildMechanismFixture,
  COMPLEX_WELDED_MECHANISM,
  LOOPLESS_WELDED_MECHANISM,
} from '../../tests/fixtures/mechanism-fixtures';

function expectFiniteCoord(value: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(Math.abs(value)).toBeLessThan(100_000);
}

function expectStableCompoundPath(link: RealLink): void {
  const leaves = link.subset.filter(
    (candidate): candidate is RealLink => candidate instanceof RealLink
  );
  const centerBefore = link.CoM.clone();

  link.reComputeDPath();
  const firstPath = link.d;

  expect(leaves.length).toBeGreaterThan(1);
  expect(firstPath).not.toBe(leaves.map((leaf) => leaf.d).join(' '));
  expect(firstPath).toMatch(/^M /);
  expect(firstPath).toContain(' Q ');
  expect(firstPath).not.toMatch(/NaN|Infinity/);
  expect(link.externalLines.length).toBeGreaterThan(0);
  expect(link.initialExternalLines.length).toBe(link.externalLines.length);
  expect(link.CoM).toEqual(centerBefore);

  const compoundMinX =
    Math.min(...link.joints.map((joint) => joint.x)) - SettingsService.objectScale / 2;
  const compoundMaxX =
    Math.max(...link.joints.map((joint) => joint.x)) + SettingsService.objectScale / 2;
  const compoundMinY =
    Math.min(...link.joints.map((joint) => joint.y)) - SettingsService.objectScale / 2;
  const compoundMaxY =
    Math.max(...link.joints.map((joint) => joint.y)) + SettingsService.objectScale / 2;
  for (const line of link.externalLines) {
    expectFiniteCoord(line.startPosition.x);
    expectFiniteCoord(line.startPosition.y);
    expectFiniteCoord(line.endPosition.x);
    expectFiniteCoord(line.endPosition.y);
    expect(line.startPosition.x).toBeGreaterThanOrEqual(compoundMinX);
    expect(line.startPosition.x).toBeLessThanOrEqual(compoundMaxX);
    expect(line.endPosition.x).toBeGreaterThanOrEqual(compoundMinX);
    expect(line.endPosition.x).toBeLessThanOrEqual(compoundMaxX);
    expect(line.startPosition.y).toBeGreaterThanOrEqual(compoundMinY);
    expect(line.startPosition.y).toBeLessThanOrEqual(compoundMaxY);
    expect(line.endPosition.y).toBeGreaterThanOrEqual(compoundMinY);
    expect(line.endPosition.y).toBeLessThanOrEqual(compoundMaxY);
  }

  for (const leaf of leaves) {
    expect(leaf.d).toMatch(/^M /);
    expect(leaf.d).toMatch(/Z\s*$/);
    expect(leaf.d).not.toMatch(/NaN|Infinity/);
    const minX = Math.min(...leaf.joints.map((joint) => joint.x)) - SettingsService.objectScale / 2;
    const maxX = Math.max(...leaf.joints.map((joint) => joint.x)) + SettingsService.objectScale / 2;
    const minY = Math.min(...leaf.joints.map((joint) => joint.y)) - SettingsService.objectScale / 2;
    const maxY = Math.max(...leaf.joints.map((joint) => joint.y)) + SettingsService.objectScale / 2;
    for (const line of [...leaf.externalLines, ...leaf.initialExternalLines]) {
      expectFiniteCoord(line.startPosition.x);
      expectFiniteCoord(line.startPosition.y);
      expectFiniteCoord(line.endPosition.x);
      expectFiniteCoord(line.endPosition.y);
      expect(line.startPosition.x).toBeGreaterThanOrEqual(minX);
      expect(line.startPosition.x).toBeLessThanOrEqual(maxX);
      expect(line.endPosition.x).toBeGreaterThanOrEqual(minX);
      expect(line.endPosition.x).toBeLessThanOrEqual(maxX);
      expect(line.startPosition.y).toBeGreaterThanOrEqual(minY);
      expect(line.startPosition.y).toBeLessThanOrEqual(maxY);
      expect(line.endPosition.y).toBeGreaterThanOrEqual(minY);
      expect(line.endPosition.y).toBeLessThanOrEqual(maxY);
    }
  }

  const rootLineSnapshot = link.externalLines.map((line) => [
    line.startPosition.x,
    line.startPosition.y,
    line.endPosition.x,
    line.endPosition.y,
  ]);
  link.reComputeDPath();
  expect(link.d).toBe(firstPath);
  expect(
    link.externalLines.map((line) => [
      line.startPosition.x,
      line.startPosition.y,
      line.endPosition.x,
      line.endPosition.y,
    ])
  ).toEqual(rootLineSnapshot);
  expect(link.CoM).toEqual(centerBefore);
}

function expectEverySimulatedCompoundPathStable(mechanism: Mechanism): void {
  expect(mechanism.isMechanismValid()).toBe(true);
  expect(mechanism.links.length).toBeGreaterThan(2);
  const topologyByLink = new Map<string, string>();

  const recomputeSamples = new Set([
    0,
    Math.floor(mechanism.links.length / 4),
    Math.floor(mechanism.links.length / 2),
    mechanism.links.length - 1,
  ]);

  mechanism.links.forEach((links, frameIndex) => {
    const compounds = links.filter(
      (link): link is RealLink => link instanceof RealLink && link.isCompound
    );
    expect(compounds.length).toBeGreaterThan(0);
    compounds.forEach((compound) => {
      // Solved frames arrive with their already-unioned contour rigidly
      // transformed from timestep zero, before any explicit recomputation.
      expect(compound.d).toMatch(/^M /);
      expect(compound.d).toContain(' Q ');
      expect(compound.d).not.toMatch(/NaN|Infinity/);
      if (recomputeSamples.has(frameIndex)) expectStableCompoundPath(compound);
      const topology = ['M', 'L', 'Q', 'Z']
        .map((command) => compound.d.match(new RegExp(`\\b${command}\\b`, 'g'))?.length ?? 0)
        .join(':');
      const initialTopology = topologyByLink.get(compound.id);
      if (initialTopology === undefined) topologyByLink.set(compound.id, topology);
      else expect(topology).toBe(initialTopology);
    });
  });
}

describe('welded link SVG geometry', () => {
  beforeEach(() => {
    SettingsService._objectScale.next(1);
  });

  it('keeps every frame of the Safari regression mechanism deterministic and finite', () => {
    const { mechanism } = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM);
    expectEverySimulatedCompoundPathStable(mechanism);
  });

  it('keeps every welded link in every complex-mechanism frame deterministic and finite', () => {
    const { mechanism } = buildMechanismFixture(COMPLEX_WELDED_MECHANISM);
    expectEverySimulatedCompoundPathStable(mechanism);
  });

  it('calculates a welded Boolean contour once instead of once per solved frame', () => {
    const compoundBuild = vi.spyOn(RealLink.prototype, 'getCompoundPathString');

    const { mechanism } = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM);

    expect(mechanism.links.length).toBeGreaterThan(100);
    expect(compoundBuild).toHaveBeenCalledTimes(1);
    compoundBuild.mockRestore();
  });
});
