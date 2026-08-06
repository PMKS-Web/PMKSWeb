// joint.ts must be imported before coord.ts/link.ts/force.ts: those modules
// form an import cycle that only initializes cleanly when entered here.
import { Joint, PrisJoint, RevJoint } from '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { Force } from '../../app/model/force';
import { Link, SliderBlock, RealLink } from '../../app/model/link';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { ColorService } from '../../app/services/color.service';
import { SettingsService } from '../../app/services/settings.service';

/**
 * Declarative description of a linkage that mirrors the MATLAB models in
 * PMKS-Web/PMKS_Verification, built directly out of model objects (bypassing
 * MechanismService, which rounds user-entered coordinates to 3 decimals).
 */
export interface MechanismFixture {
  /** Joint ids must be the single letters the dataset uses, in creation order. */
  joints: { id: string; x: number; y: number; ground?: boolean; input?: boolean }[];
  /**
   * `joints` is the concatenated joint letters (also the link id). List links
   * in the MATLAB free-body-chain order (input crank first): each shared
   * joint's first link then matches the MATLAB reaction-force sign convention.
   * `com` defaults to the mean of the link's joints, which is both PMKS+'s
   * geometric center and the MATLAB Utils.determineCoM default.
   */
  links: FixtureLink[];
  /** Grounds joint `at` into a slider along `angleRad` via a piston link. */
  slider?: SliderSpec;
  /** Several slots at once — an elliptical trammel needs two. */
  sliders?: SliderSpec[];
  /**
   * Joint ids to flag welded. On a slider's pin this makes a Slide (§2.1): the
   * rider becomes rigid with the block instead of free to turn in it.
   */
  welds?: string[];
  /**
   * Prismatic joint ids to leave dangling: a block with no carrier and no
   * ground (§4.1). Applied last, so the slot is built and then taken away —
   * which is how it actually arises, rather than a state assembled by hand.
   */
  detach?: string[];
  /** Constant global force applied to a point that rides on `onLink`. */
  load?: { onLink: string; at: [number, number]; vector: [number, number] };
  /** Input speed in rad/s, using the v1 manifest's exact rpm*pi/30 conversion. */
  inputAngVel: number;
  gravity?: boolean;
}

export interface SliderSpec {
  at: string;
  prisId: string;
  /** World angle of a grounded guide. Ignored when `on` is given. */
  angleRad?: number;
  pistonMass?: number;
  /**
   * Cuts the slot into a moving link instead of into the world: the line
   * through carrier joints `a` and `b` (§2.4).
   */
  on?: { carrier: string; a: string; b: string };
  /**
   * Marks the slider as the sealed heart of an atomic cylinder. Requires a
   * floating slot (`on`) and a weld at the pin, which is what the resolver
   * demands of a cylinder; the flag rides the URL, so a sealed fixture opens
   * skinned.
   */
  sealed?: boolean;
  /**
   * Drives the mechanism from this prismatic joint (§5.1). The flag has to go
   * on the slider rather than on a fixture joint: a driven cylinder's commanded
   * quantity is how far the block has travelled along its slot, and no RevJoint
   * in the fixture list owns that.
   */
  input?: boolean;
}

export interface FixtureLink {
  joints: string;
  mass?: number;
  moi?: number;
  com?: [number, number];
  name?: string;
  fill?: string;
  subset?: FixtureLink[];
}

export interface BuiltMechanism {
  mechanism: Mechanism;
  joints: Joint[];
  links: Link[];
  forces: Force[];
  fixture: MechanismFixture;
}

export function buildMechanism(fixture: MechanismFixture): BuiltMechanism {
  // ColorService registers itself as a static singleton that RealLink depends
  // on; SettingsService.objectScale is used when forces render their SVG.
  if (!ColorService.instance) {
    new ColorService();
  }
  new SettingsService();

  const jointById = new Map<string, RevJoint>();
  const joints: Joint[] = fixture.joints.map((spec) => {
    const joint = new RevJoint(spec.id, spec.x, spec.y, !!spec.input, !!spec.ground);
    jointById.set(spec.id, joint);
    return joint;
  });

  const restoreFixtureLinkState = (spec: FixtureLink, link: RealLink): void => {
    link.mass = spec.mass ?? 1;
    link.massMoI = spec.moi ?? 1;
    link.name = spec.name ?? link.id;
    link.fill = spec.fill ?? link.fill;
    if (spec.com) {
      link.CoM = new Coord(spec.com[0], spec.com[1]);
    }
    spec.subset?.forEach((memberSpec, index) => {
      restoreFixtureLinkState(memberSpec, link.subset[index] as RealLink);
    });
  };

  const buildFixtureLink = (spec: FixtureLink): RealLink => {
    const linkJoints = [...spec.joints].map((id) => jointById.get(id)!);
    const com = spec.com ? new Coord(spec.com[0], spec.com[1]) : undefined;
    const subset = spec.subset?.map(buildFixtureLink);
    const link = new RealLink(spec.joints, linkJoints, spec.mass ?? 1, spec.moi ?? 1, com, subset);
    link.fill = spec.fill ?? ColorService.instance.getNextLinkColor();
    restoreFixtureLinkState(spec, link);
    return link;
  };

  const links: Link[] = fixture.links.map((spec) => {
    const link = buildFixtureLink(spec);
    const linkJoints = link.joints as RevJoint[];
    linkJoints.forEach((j) => {
      j.links.push(link);
      linkJoints.forEach((other) => {
        if (other.id !== j.id && !j.connectedJoints.some((cj) => cj.id === other.id)) {
          j.connectedJoints.push(other);
        }
      });
    });
    return link;
  });

  const sliderSpecs = [...(fixture.slider ? [fixture.slider] : []), ...(fixture.sliders ?? [])];
  sliderSpecs.forEach((spec) => {
    const revJoint = jointById.get(spec.at)!;
    // A floating slot is not grounded; that pair of states is exclusive (§2.4a).
    const prisJoint = new PrisJoint(spec.prisId, revJoint.x, revJoint.y, !!spec.input, !spec.on);
    prisJoint.isSealed = spec.sealed ?? false;
    if (spec.on) {
      const carrier = links.find((link) => link.id === spec.on!.carrier)!;
      prisJoint.slideOn(carrier, jointById.get(spec.on.a)!, jointById.get(spec.on.b)!);
    } else {
      prisJoint.angle_rad = spec.angleRad ?? 0;
    }
    prisJoint.connectedJoints.push(revJoint);
    revJoint.connectedJoints.push(prisJoint);
    const piston = new SliderBlock(
      revJoint.id + prisJoint.id,
      [revJoint, prisJoint],
      spec.pistonMass
    );
    prisJoint.links.push(piston);
    revJoint.links.push(piston);
    joints.push(prisJoint);
    links.push(piston);
  });

  // After the sliders, so a welded pin already has its block: that pairing is
  // what makes the flag mean "Slide" rather than "compound".
  fixture.welds?.forEach((id) => {
    jointById.get(id)!.isWelded = true;
  });

  // Found in `joints` rather than `jointById`: a slider's PrisJoint is created
  // by the slider loop above, so it never enters the map the fixture's own
  // joint list built.
  fixture.detach?.forEach((id) => {
    (joints.find((joint) => joint.id === id) as PrisJoint).detach();
  });

  const forces: Force[] = [];
  if (fixture.load) {
    const link = links.find((l) => l.id === fixture.load!.onLink) as RealLink;
    const [fx, fy] = fixture.load.vector;
    const mag = Math.hypot(fx, fy);
    const start = new Coord(fixture.load.at[0], fixture.load.at[1]);
    const end = new Coord(start.x + fx / mag, start.y + fy / mag);
    // local=false keeps the direction fixed in the global frame while the
    // application point rides along with the link, like the MATLAB LoadForce.
    const force = new Force('F1', link, start, end, false, true, mag);
    link.forces.push(force);
    forces.push(force);
  }

  const mechanism = new Mechanism(
    joints,
    links,
    forces,
    [],
    fixture.gravity ?? false,
    'm',
    fixture.inputAngVel
  );
  return { mechanism, joints, links, forces, fixture };
}
