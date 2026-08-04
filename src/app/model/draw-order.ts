import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';

/**
 * How deep in the stack each body sits, so nothing is drawn over something it
 * is supposed to be inside.
 *
 * Two rules, and they are not layers:
 *
 *   a block is above the carrier it slides in
 *   a link is above the block it is pinned to
 *
 * Fixed layers can only satisfy both when no link is ever both a carrier and a
 * rider — and the Scotch yoke's yoke is exactly that. Its own block is drawn
 * over it, its guide's block is drawn under it, and no assignment of the two to
 * "layer 2" and "layer 4" can express that. So the depth is derived from the
 * chain instead: a grounded guide's block starts at 1, its rider at 2, the
 * block riding *that* at 3, and so on for as far as the mechanism stacks.
 *
 * A link that is nothing's rider stays at 0 and is drawn with the ordinary
 * links, which is every link in a mechanism with no sliders in it.
 */
export interface DrawDepths {
  /** By link id. */
  link: Map<string, number>;
  /** By the id of the sliding joint the block belongs to. */
  block: Map<string, number>;
}

export function drawDepths(joints: Joint[]): DrawDepths {
  const sliders = joints.filter((joint): joint is PrisJoint => joint instanceof PrisJoint);
  const assemblies = sliders
    .map((slider) => ({ slider, riders: ridersOf(slider) }))
    .filter((assembly) => assembly.riders !== undefined) as {
    slider: PrisJoint;
    riders: Link[];
  }[];

  const link = new Map<string, number>();
  const block = new Map<string, number>();
  const depthOf = (id: string, from: Map<string, number>) => from.get(id) ?? 0;

  // Relaxed rather than sorted: a mechanism can in principle wire two
  // assemblies to ride each other, which is a cycle with no correct answer, and
  // a fixed number of passes settles every acyclic case while refusing to spin
  // on a cyclic one.
  for (let pass = 0; pass <= assemblies.length; pass++) {
    let moved = false;
    for (const { slider, riders } of assemblies) {
      const carrier = slider.isFloating ? slider.carrier : undefined;
      const wanted = (carrier ? depthOf(carrier.id, link) : 0) + 1;
      if (wanted > depthOf(slider.id, block)) {
        block.set(slider.id, wanted);
        moved = true;
      }
      const above = depthOf(slider.id, block) + 1;
      for (const rider of riders) {
        if (above > depthOf(rider.id, link)) {
          link.set(rider.id, above);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return { link, block };
}

/** The links pinned to a slider's block, or nothing if it has no pin. */
function ridersOf(slider: PrisJoint): Link[] | undefined {
  const body = slider.links.find((member): member is SliderBlock => member instanceof SliderBlock);
  const pin = body?.joints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && !(joint instanceof PrisJoint)
  );
  if (!pin) return undefined;
  return pin.links.filter(
    (member): member is RealLink => member instanceof RealLink && !(member instanceof SliderBlock)
  );
}
