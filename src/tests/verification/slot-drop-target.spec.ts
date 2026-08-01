import '../../app/model/joint';
import { RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { resolveSlotDropTarget } from '../../app/model/drop-target';

// The creation gesture of §4.3: drop a joint onto a link body and it becomes a
// slider riding a slot cut into that link, defined by two of its joints.
//
// On a binary link the pair is unambiguous. On a link with n joints there are
// up to n(n-1)/2 of them, so which pair wins has to be decided rather than
// discovered -- and shown before release, because the cursor alone does not
// say which one it picked.

function joint(id: string, x: number, y: number): RevJoint {
  return new RevJoint(id, x, y);
}

/** A link holding the given joints, wired the way the mechanism wires them. */
function link(id: string, joints: RevJoint[]): RealLink {
  const made = new RealLink(id, joints);
  joints.forEach((j) => j.links.push(made));
  return made;
}

describe('dropping a joint onto a link', () => {
  it('cuts a slot on the pair whose segment the drop is nearest', () => {
    // A ternary link: three joints, three candidate pairs. The drop sits beside
    // the B-C edge, so that is the pair -- not A-B, which is longer and closer
    // to the link's centre.
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const c = joint('C', 10, 10);
    const carrier = link('ABC', [a, b, c]);
    const dragged = joint('P', 10.4, 5);

    const found = resolveSlotDropTarget(dragged, 10.4, 5, [carrier], 2);

    expect(found).toBeDefined();
    expect([found!.a.id, found!.b.id].sort()).toEqual(['B', 'C']);
  });

  it('pulls the drop point onto the slot line', () => {
    // Capture, exactly as joint-snap does it: the joint is on the line while you
    // are still previewing, so where it lands on release is never a surprise.
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const carrier = link('AB', [a, b]);
    const dragged = joint('P', 4, 0.6);

    const found = resolveSlotDropTarget(dragged, 4, 0.6, [carrier], 2);

    expect(found!.x).toBeCloseTo(4, 9);
    expect(found!.y).toBeCloseTo(0, 9);
  });

  it('never offers a link the dragged joint is already on', () => {
    // A joint sliding in its own body. Offering it only to refuse it would put a
    // red preview on the one link a drag is most likely to sweep across.
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const dragged = joint('P', 5, 3);
    const own = link('ABP', [a, b, dragged]);

    expect(resolveSlotDropTarget(dragged, 5, 0, [own], 2)).toBeUndefined();
  });

  it('ignores a drop past the end of a bar', () => {
    // The segment, not the infinite line through the pair. A point out beyond B
    // is not between A and B, and claiming that pair would cut a slot where the
    // user is not pointing.
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const carrier = link('AB', [a, b]);
    const dragged = joint('P', 14, 0);

    expect(resolveSlotDropTarget(dragged, 14, 0, [carrier], 2)).toBeUndefined();
    expect(resolveSlotDropTarget(dragged, 9, 0, [carrier], 2)).toBeDefined();
  });

  it('takes the nearer of two links under the cursor', () => {
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const c = joint('C', 0, 3);
    const d = joint('D', 10, 3);
    const lower = link('AB', [a, b]);
    const upper = link('CD', [c, d]);
    const dragged = joint('P', 5, 2.2);

    const found = resolveSlotDropTarget(dragged, 5, 2.2, [lower, upper], 2);

    expect(found!.carrier.id).toBe('CD');
  });

  it('offers nothing when two candidate joints sit on top of each other', () => {
    // Coincident joints define no line, so they define no slot either --
    // reachable by a Phase 1 snap that stops just short of merging.
    const a = joint('A', 4, 4);
    const b = joint('B', 4, 4);
    const carrier = link('AB', [a, b]);
    const dragged = joint('P', 4, 4);

    expect(resolveSlotDropTarget(dragged, 4, 4, [carrier], 2)).toBeUndefined();
  });

  it('stays out of range until the cursor is actually over the bar', () => {
    const a = joint('A', 0, 0);
    const b = joint('B', 10, 0);
    const carrier = link('AB', [a, b]);
    const dragged = joint('P', 5, 5);

    expect(resolveSlotDropTarget(dragged, 5, 5, [carrier], 2)).toBeUndefined();
  });
});
