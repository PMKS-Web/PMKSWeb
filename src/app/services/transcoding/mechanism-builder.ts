import { Joint, PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { Link, SliderBlock, RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { Coord } from 'src/app/model/coord';
import { GenericTranscoder } from './transcoder-interface';
import {
  ACTIVE_TYPE,
  ForceData,
  JOINT_TYPE,
  JointData,
  LINK_TYPE,
  LinkData,
} from './transcoder-data';
import { SettingsService } from '../settings.service';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from 'src/app/model/utils';
import { BoolSetting, DecimalSetting, EnumSetting, IntSetting } from './stored-settings';
import { ActiveObjService } from '../active-obj.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';

/*
 * MechanismBuilder is a class that takes in a decoder and mechanism service and
 * builds a mechanism from the decoder
 */
export class MechanismBuilder {
  mechanism: MechanismService;
  transcoder: GenericTranscoder;

  constructor(
    mechanism: MechanismService,
    transcoder: GenericTranscoder,
    private settings: SettingsService,
    private activeObj: ActiveObjService
  ) {
    this.mechanism = mechanism;
    this.transcoder = transcoder;
  }

  // Find joint by id from decoder
  private getJointByID(joints: Joint[], id: string): Joint | undefined {
    return joints.find((joint) => joint.id === id);
  }

  // Find link by id from decoder
  private getLinkByID(links: Link[], id: string): Link | undefined {
    return links.find((link) => link.id === id);
  }

  // Create Joints from JointData. Joint starts off with no links, to be added later
  // URLs carry user-unit coordinates; the internal world is MODEL_SCALE times
  // larger (see render-scale.ts), so every decoded coordinate scales up here.
  private buildJoint(jointData: JointData): Joint {
    let joint;

    if (jointData.type === JOINT_TYPE.PRISMATIC) {
      joint = new PrisJoint(
        jointData.id,
        jointData.x * MODEL_SCALE,
        jointData.y * MODEL_SCALE,
        jointData.isInput,
        jointData.isGrounded
      );
      joint.angle_rad = jointData.angleRadians;
      // The sealed-cylinder bit rides the prismatic pin; undo/redo replays
      // URLs, so this is the line that makes sealing survive an undo.
      joint.isSealed = jointData.isSealed;
    } else {
      joint = new RevJoint(
        jointData.id,
        jointData.x * MODEL_SCALE,
        jointData.y * MODEL_SCALE,
        jointData.isInput,
        jointData.isGrounded
      );
    }

    joint.name = jointData.name;
    joint.isWelded = jointData.isWelded;
    joint.showCurve = jointData.showCurve;
    console.log('build joint', jointData.type);

    return joint;
  }

  // Create Links from LinkData. Joints are passed in to be linked to the link
  // The link starts off with no forces, to be added as forces are created
  private buildLink(linkData: LinkData, joints: Joint[]): Link {
    // For each joint id of the link, find the associated joint object
    let jointsOnLink: Joint[] = linkData.jointIDs.map((jointID) =>
      this.getJointByID(joints, jointID)!
    );

    // For each revolute joint on the link, link it to every other joint
    const realJoints = jointsOnLink.filter((joint) => joint instanceof RealJoint) as RealJoint[];
    for (let joint of realJoints) {
      for (let otherJoint of realJoints) {
        if (joint !== otherJoint) joint.connectedJoints.push(otherJoint);
      }
    }

    let link;
    if (linkData.type === LINK_TYPE.REAL) {
      let CoM: Coord = new Coord(linkData.xCoM * MODEL_SCALE, linkData.yCoM * MODEL_SCALE);
      link = new RealLink(linkData.id, jointsOnLink, linkData.mass, linkData.massMoI, CoM);
      link.fill = linkData.color;
    } else {
      link = new SliderBlock(linkData.id, jointsOnLink, linkData.mass);
    }

    // for all joints in link, connect to link
    //for (let joint of revoluteJoints) joint.links.push(link);

    link.name = linkData.name;

    return link;
  }

  // Create Force from ForceData. Links are passed in to be linked to the force
  // For each force, the link is added to the force, and the force is added to the link
  private buildForce(forceData: ForceData, links: Link[]): Force {
    const link = links.find(
      (candidate) =>
        candidate.id === forceData.linkID ||
        (candidate instanceof RealLink &&
          candidate.subset.some((subset) => subset.id === forceData.linkID))
    );

    let startCoord = new Coord(forceData.startX * MODEL_SCALE, forceData.startY * MODEL_SCALE);
    let endCoord = new Coord(forceData.endX * MODEL_SCALE, forceData.endY * MODEL_SCALE);

    if (!(link instanceof RealLink)) {
      throw new Error('Force can only be applied to RealLink');
    }

    let force = new Force(
      forceData.id,
      link as RealLink,
      startCoord,
      endCoord,
      forceData.isLocal,
      forceData.isFacingOut,
      forceData.magnitude
    );
    force.name = forceData.name;
    // Add force to link
    link.forces.push(force);

    return force;
  }

  /**
   * Point each floating slot at the objects this build just made.
   *
   * The transcoder has already refused any URL whose slot tokens do not resolve
   * (§2.4a), so a lookup that fails here means the two are out of step rather
   * than that the URL was bad — worth failing loudly instead of quietly
   * producing a slider that has forgotten what it slides on.
   */
  private resolveSlots(joints: Joint[], links: Link[]): void {
    this.transcoder.getJoints().forEach((jointData) => {
      if (jointData.carrierID === '') return;
      const joint = this.getJointByID(joints, jointData.id);
      const carrier = this.getLinkByID(links, jointData.carrierID);
      const slotJointA = this.getJointByID(joints, jointData.slotJointAID);
      const slotJointB = this.getJointByID(joints, jointData.slotJointBID);
      if (!(joint instanceof PrisJoint) || !carrier || !slotJointA || !slotJointB) {
        throw new Error('Slot references could not be resolved while building the mechanism');
      }
      joint.slideOn(carrier, slotJointA, slotJointB);
    });
  }

  // For each joint, add links that are adjacent to the joint
  public addSubsetLinks(linkDatas: LinkData[], links: Link[]): void {
    linkDatas.forEach((linkData, index) => {
      let link = links[index];

      // only RealLinks can have subset links
      if (!(link instanceof RealLink)) return;

      // For each subset link id, find and add the associated subset link to root link
      (link as RealLink).subset = [];
      linkData.subsetLinkIDs.forEach((subsetLinkID) => {
        let subsetLink = this.getLinkByID(links, subsetLinkID)!;
        (link as RealLink).subset.push(subsetLink);
      });
    });
  }

  // Remove subset links from links
  public filterSubsetLinks(linkDatas: LinkData[], links: Link[]): Link[] {
    let filteredLinks: Link[] = [];

    // root links have isRoot for corresponding LinkData set to true
    linkDatas.forEach((linkData, index) => {
      let link = links[index];
      if (linkData.isRoot) filteredLinks.push(link);
    });

    return filteredLinks;
  }

  // For each joint, add links that are adjacent to the joint
  public addAdjacentLinksForJoints(): void {
    this.mechanism.joints.forEach((joint) => {
      if (joint instanceof RealJoint) {
        let realJoint = joint as RealJoint;
        realJoint.links = this.mechanism.links.filter((link) => link.joints.includes(realJoint));
        realJoint.connectedJoints = [];
        realJoint.links.forEach((link) => {
          link.joints.forEach((otherJoint) => {
            if (
              otherJoint instanceof RealJoint &&
              otherJoint !== realJoint &&
              !realJoint.connectedJoints.some((candidate) => candidate.id === otherJoint.id)
            ) {
              realJoint.connectedJoints.push(otherJoint);
            }
          });
        });
      }
    });
  }

  public build(updateSettings: boolean = true): void {
    // Build Joints from JointData
    let joints: Joint[] = this.transcoder
      .getJoints()
      .map((jointData) => this.buildJoint(jointData));

    // Build Links from LinkData, and linking them to their joints
    let linkDatas: LinkData[] = this.transcoder.getLinks();
    let links: Link[] = linkDatas.map((linkData) => this.buildLink(linkData, joints));

    // Bind floating slots before subset links are filtered away: a carrier
    // that has been welded into a compound is still a link here.
    this.resolveSlots(joints, links);

    // Add subset links to each link
    this.addSubsetLinks(linkDatas, links);

    // Once subsets are added, filter away non-root (subset) links
    links = this.filterSubsetLinks(linkDatas, links);

    // Build Forces from ForceData, and link them to their links
    let forces: Force[] = this.transcoder
      .getForces()
      .map((forceData) => this.buildForce(forceData, links));

    // Build mechanism
    this.mechanism.joints = joints;
    this.mechanism.links = links;
    this.mechanism.forces = forces;

    this.addAdjacentLinksForJoints();

    // set active object
    let activeObjData = this.transcoder.getActiveObj();
    let activeObj: any;
    if (activeObjData.type === ACTIVE_TYPE.JOINT)
      activeObj = this.getJointByID(joints, activeObjData.id)!;
    else if (activeObjData.type === ACTIVE_TYPE.LINK)
      activeObj = links.find(
        (link) =>
          link.id === activeObjData.id ||
          (link instanceof RealLink && link.subset.some((subset) => subset.id === activeObjData.id))
      );
    else if (activeObjData.type === ACTIVE_TYPE.FORCE)
      activeObj = forces.find((force) => force.id === activeObjData.id);
    else activeObj = null;

    this.activeObj.updateSelectedObj(activeObj);

    if (updateSettings) {
      // Configure mechanism global flags
      const decodedLength = this.transcoder.getEnumSetting(
        EnumSetting.LENGTH_UNIT,
        LengthUnit
      ) as LengthUnit;
      // Length is the authoritative legacy field. Older URLs omitted the
      // global enum, and some four-enum URLs encoded a contradictory global
      // value; normalize the trio before any mechanism is constructed.
      const normalizedGlobal =
        decodedLength === LengthUnit.INCH
          ? GlobalUnit.ENGLISH
          : decodedLength === LengthUnit.METER
            ? GlobalUnit.SI
            : GlobalUnit.METRIC;
      const normalizedForce =
        normalizedGlobal === GlobalUnit.ENGLISH ? ForceUnit.LBF : ForceUnit.NEWTON;
      this.settings.lengthUnit.next(decodedLength);
      this.settings.angleUnit.next(
        this.transcoder.getEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit)
      );
      this.settings.forceUnit.next(normalizedForce);
      this.settings.globalUnit.next(normalizedGlobal);
      this.settings.isInputCW.next(this.transcoder.getBoolSetting(BoolSetting.IS_INPUT_CW));
      this.settings.inputSpeed.next(this.transcoder.getIntSetting(IntSetting.INPUT_SPEED));
      this.settings.animating.next(this.transcoder.getBoolSetting(BoolSetting.ANIMATING));
      this.settings.isShowMajorGrid.next(
        this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MAJOR_GRID)
      );
      this.settings.isShowMinorGrid.next(
        this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MINOR_GRID)
      );
      this.settings.isShowID.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_ID));
      this.settings.isShowCOM.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_COM));
      // The URL stores the user-unit object scale; the internal one is
      // MODEL_SCALE times larger, like every other length.
      SettingsService._objectScale.next(
        this.transcoder.getDecimalSetting(DecimalSetting.SCALE) * MODEL_SCALE
      );
    }

    this.mechanism.mechanismTimeStep = this.transcoder.getIntSetting(IntSetting.TIMESTEP);

    // Fix visual bug for forces
    this.mechanism.forces.forEach((force) => force.updateInternalValues());
  }
}
