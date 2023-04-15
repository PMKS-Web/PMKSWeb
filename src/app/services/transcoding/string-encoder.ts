import { Base62Converter } from "./base62-converter";
import { ForceData, JOINT_TYPE, JointData, LINK_TYPE, LinkData } from "./transcoder-data";
import { GenericEncoder } from "./transcoder-interface";

/*
 StringEncoder class is responsible for encoding various types of data,
 * including joints, links, forces, and global settings, into a compact
 * URL-safe string format. It utilizes the Base62Converter for number encoding
 * and follows a specific format for each type of data.
 */
export class StringEncoder extends GenericEncoder {

    // We encode a number to base64.
    // To represent sign, "0", is inserted in the beginning for positive numbers and "1" for negative numbers.
    private encodeDecimalNumber(number: number): string {

        // Number is now in string form, and is always an integer with resolution of 3 decimal places.
        let normalizedNumber = Math.round(number * 1000)

        return Base62Converter.toUrlSafeBase62(normalizedNumber);
    }

    private encodeInteger(integer: number): string {
        return Base62Converter.toUrlSafeBase62(integer);
    }

    /*
    Joint encoding is defined as:
    [MASK][JointID],[x],[y],[angleRadians]
    [MASK] = (JointType == PRISMATIC) ? 4 : 0 + (isInput) ? 2 : 0 + (isGrounded) ? 1 : 0
    [JointID] = string
    [x] = number
    [y] = number
    [angleRadians] = number
    This should on average be 18 characters per joint
    */
    private encodeJoint(joint: JointData): string {
        let mask: number = 0;
        if (joint.type == JOINT_TYPE.PRISMATIC) mask += 4;
        if (joint.isInput) mask += 2;
        if (joint.isGrounded) mask += 1;

        let xString = this.encodeDecimalNumber(joint.x)
        let yString = this.encodeDecimalNumber(joint.y)
       let  angleString = this.encodeDecimalNumber(joint.angleRadians)

        return "" + mask + joint.id + "," + xString + "," + yString + "," + angleString;
    }
    /*
    Link encoding is defined as 
    [type][id],[mass],[massMoI],[xCoM],[yCoM],[jointID1],[jointID2],...
    This should on average be 26 + [number of joints] characters per link
    */
    private encodeLink(link: LinkData): string {
        let type: string = (link.type == LINK_TYPE.REAL) ? "R" : "P";
        let massString = this.encodeDecimalNumber(link.mass)
        let massMoIString = this.encodeDecimalNumber(link.massMoI)
        let xCoMString = this.encodeDecimalNumber(link.xCoM)
        let yCoMString = this.encodeDecimalNumber(link.yCoM)
        let jointIDs: string = "";
        for (let i = 0; i < link.jointIDs.length; i++) {
            jointIDs += link.jointIDs[i] + ",";
        }
        jointIDs = jointIDs.substring(0, jointIDs.length - 1); // remove trailing comma
        return type + link.id + "," + massString + "," + massMoIString + "," + xCoMString + "," + yCoMString + "," + jointIDs;
    }

    /*
    Force encoding is defined as 
    [MASK][id],[linkID],[startX],[startY],[endX],[endY],[magnitude]
    [MASK] = (isLocal) ? 2 : 0 + (isFacingOut) ? 1 : 0
    [id] = string
    [linkID] = string
    [startX] = number
    [startY] = number
    [endX] = number
    [endY] = number
    [magnitude] = number
    This should on average be 39 characters per force
    */
    private encodeForce(force: ForceData): string {
        let mask: number = 0;
        if (force.isLocal) mask += 2;
        if (force.isFacingOut) mask += 1;

        let startXString = this.encodeDecimalNumber(force.startX)
        let startYString = this.encodeDecimalNumber(force.startY)
        let endXString = this.encodeDecimalNumber(force.endX)
        let endYString = this.encodeDecimalNumber(force.endY)
        let magnitudeString = this.encodeDecimalNumber(force.magnitude)

        return "" + mask + force.id + "," + force.linkID + "," + startXString + "," + startYString + "," + endXString + "," + endYString + "," + magnitudeString;
    }

    /* 
    URL encoding is defined as 
    [MASK][global units],[angle units],[speed],[direction],[scale],[timestep].[joints...]..[links]..[forces]
    [MASK] = (isGravityOn) ? 4 : 0 + (isGridOn) ? 2 : 0 + (isMinorGridLinesOn) ? 1 : 0
    [global units] = string
    [angle units] = string
    [speed] = number
    [direction] = number
    [scale] = number
    [timestep] = number
    This should on average be 27 characters plus joints/links/forces
    */
    override encodeURL(): string {
        let mask: number = 0;
        if (this.direction) mask += 8;
        if (this.isGravityOn) mask += 4;
        if (this.isGridOn) mask += 2;
        if (this.isMinorGridLinesOn) mask += 1;
        let maskStr = this.encodeInteger(mask);

        let speedString = this.encodeDecimalNumber(this.speed)
        let scaleString = this.encodeDecimalNumber(this.scale)
        let timestepString = this.encodeDecimalNumber(this.timestep)

        let url = "" + maskStr + this.globalUnits + "," + this.angleUnits + "," + speedString + "," + scaleString + "," + timestepString;
        
        // We delimit between same type with '.' and two different types with '..'
        for (let i = 0; i < this.joints.length; i++) {
            url += "." + this.encodeJoint(this.joints[i]);
        }
        url += ".";
        for (let i = 0; i < this.links.length; i++) {
            url += "." + this.encodeLink(this.links[i]);
        }
        url += ".";
        for (let i = 0; i < this.forces.length; i++) {
            url += "." + this.encodeForce(this.forces[i]);
        }
        return url;
    }

}