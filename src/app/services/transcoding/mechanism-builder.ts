import { Joint, PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { Link, Piston, RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { Coord } from 'src/app/model/coord';
import { GenericTranscoder } from './transcoder-interface';
import { ForceData, JOINT_TYPE, JointData, LINK_TYPE, LinkData } from './transcoder-data';
import { SettingsService } from '../settings.service';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from 'src/app/model/utils';
import { BoolSetting, DecimalSetting, EnumSetting, IntSetting } from './stored-settings';

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
        public settings: SettingsService)
    {
        this.mechanism = mechanism;
        this.transcoder = transcoder
    }
    // Find joint by id from decoder
    private getJointByID(joints: Joint[], id: string): Joint | undefined {
        return joints.find(joint => joint.id === id);
    }

    // Find link by id from decoder
    private getLinkByID(links: Link[], id: string): Link | undefined {
        return links.find(link => link.id === id);
    }

    // Create Joints from JointData. Joint starts off with no links, to be added later
    private buildJoint(jointData: JointData): Joint {
        let joint;

        if (jointData.type === JOINT_TYPE.PRISMATIC) {
            joint = new PrisJoint(jointData.id, jointData.x, jointData.y, jointData.isInput, jointData.isGrounded);
        } else {
            joint = new RevJoint(jointData.id, jointData.x, jointData.y, jointData.isInput, jointData.isGrounded);
        }

        return joint;
    }

    // Create Links from LinkData. Joints are passed in to be linked to the link
    // The link starts off with no forces, to be added as forces are created
    private buildLink(linkData: LinkData, joints: Joint[]): Link {

        // For each joint id of the link, find the associated joint object
        let jointsOnLink: Joint[] = linkData.jointIDs.map(jointID => this.getJointByID(joints, jointID)!);

        // For each revolute joint on the link, link it to every other joint
        const revoluteJoints = jointsOnLink.filter(joint => joint instanceof RevJoint) as RevJoint[];
        for (let joint of revoluteJoints) {
            for (let otherJoint of revoluteJoints) {
                if (joint !== otherJoint) joint.connectedJoints.push(otherJoint);
            }
        }

        if (linkData.type === LINK_TYPE.REAL) {
            let CoM: Coord = new Coord(linkData.xCoM, linkData.yCoM);
            return new RealLink(linkData.id, jointsOnLink, linkData.mass, linkData.massMoI, CoM);
        } else {
            return new Piston(linkData.id, jointsOnLink, linkData.mass);
        }
    }

    // Create Force from ForceData. Links are passed in to be linked to the force
    // For each force, the link is added to the force, and the force is added to the link
    private buildForce(forceData: ForceData, links: Link[]): Force {
        let link = this.getLinkByID(links, forceData.linkID)!;

        let startCoord = new Coord(forceData.startX, forceData.startY);
        let endCoord = new Coord(forceData.endX, forceData.endY);

        if (!(link instanceof RealLink)) {
            throw new Error("Force can only be applied to RealLink");
        }

        let force = new Force(forceData.id, (link as RealLink), startCoord, endCoord, forceData.isLocal, forceData.isFacingOut, forceData.magnitude);

        // Add force to link
        link.forces.push(force);

        return force;

    }

    // For each joint with welded flag set, weld joint
    public weldMechanismJoints(): void {
        this.mechanism.joints.forEach(joint => {
            if (joint instanceof RealJoint) {
                let realJoint = joint as RealJoint;
                if (realJoint.isWelded) {
                    this.mechanism.weldJoint(realJoint);
                }
            }
        });
    }

    // For each joint, add links that are adjacent to the joint
    public addAdjacentLinksForJoints(): void {
        this.mechanism.joints.forEach((joint) => {
            if (joint instanceof RealJoint) {
                let realJoint = joint as RealJoint;
                realJoint.links = this.mechanism.links.filter((link) => link.joints.includes(realJoint));

    // For each link, build subsets of links
    public buildLinkSubsets(links: Link[], linkDatas: LinkData[]): void {
        linkDatas.forEach(linkData => {

            let currentLink = this.getLinkByID(links, linkData.id)!;

            if (currentLink instanceof RealLink) {

                linkData.subsetIDs.forEach(subsetID => {
                    let subsetLink = this.getLinkByID(links, subsetID)!;
                    (currentLink as RealLink).subset.push(subsetLink);
                });
            }
        });
    }

    public build(): void {

        // Build Joints from JointData
        let joints: Joint[] = this.transcoder.getJoints().map(jointData => this.buildJoint(jointData));

        // Build Links from LinkData, and linking them to their joints
        let links: Link[] = this.transcoder.getLinks().map(linkData => this.buildLink(linkData, joints));
        this.buildLinkSubsets(links, this.transcoder.getLinks());

        // Build Forces from ForceData, and link them to their links
        let forces: Force[] = this.transcoder.getForces().map(forceData => this.buildForce(forceData, links));

        // Build mechanism
        this.mechanism.joints = joints
        this.mechanism.links = links
        this.mechanism.forces = forces

        this.weldMechanismJoints();
        this.addAdjacentLinksForJoints();

        // Configure mechanism global flags
        this.settings.lengthUnit.next(this.transcoder.getEnumSetting(EnumSetting.LENGTH_UNIT, LengthUnit));
        this.settings.angleUnit.next(this.transcoder.getEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit));
        this.settings.forceUnit.next(this.transcoder.getEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit));
        this.settings.globalUnit.next(this.transcoder.getEnumSetting(EnumSetting.GLOBAL_UNIT, GlobalUnit));
        this.settings.isInputCW.next(this.transcoder.getBoolSetting(BoolSetting.IS_INPUT_CW));
        this.settings.isGravity.next(this.transcoder.getBoolSetting(BoolSetting.IS_GRAVITY));
        this.settings.inputSpeed.next(this.transcoder.getIntSetting(IntSetting.INPUT_SPEED));
        this.settings.animating.next(this.transcoder.getBoolSetting(BoolSetting.ANIMATING));
        this.settings.isShowMajorGrid.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MAJOR_GRID));
        this.settings.isShowMinorGrid.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MINOR_GRID));
        this.settings.isShowID.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_ID));
        this.settings.isShowCOM.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_COM));
        SettingsService._objectScale.next(this.transcoder.getDecimalSetting(DecimalSetting.SCALE));

        this.mechanism.mechanismTimeStep = this.transcoder.getIntSetting(IntSetting.TIMESTEP);

    }

}