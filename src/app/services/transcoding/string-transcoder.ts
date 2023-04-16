import { Base64Converter } from "./base64-converter";
import { FlagPacker } from "./flag-packer";
import { StringDisassembler } from "./string-disassembler";
import { ForceData, JOINT_TYPE, JointData, LINK_TYPE, LinkData } from "./transcoder-data";
import { GenericTranscoder } from "./transcoder-interface";

/*
 StringEncoder class is responsible for encoding various types of data,
 * including joints, links, forces, and global settings, into a compact
 * URL-safe string format. It utilizes the Base62Converter for number encoding
 * and follows a specific format for each type of data.
 */
export class StringTranscoder extends GenericTranscoder {

    // We encode a number to base64.
    // To represent sign, "0", is inserted in the beginning for positive numbers and "1" for negative numbers.
    private encodeDecimalNumber(number: number): string {

        // Number is now in string form, and is always an integer with resolution of 3 decimal places.
        let normalizedNumber = Math.round(number * 1000)

        return Base64Converter.toUrlSafeBase64(normalizedNumber);
    }

    private encodeInteger(integer: number): string {
        return Base64Converter.toUrlSafeBase64(integer);
    }

    /*
    Joint encoding is defined as:
    [FLAGS][JointID],[x],[y],[angleRadians]
    [FLAGS] = (JointType == PRISMATIC), (isInput), (isGrounded)
    [JointID] = string
    [x] = number
    [y] = number
    [angleRadians] = number
    This should on average be 18 characters per joint
    */
    private encodeJoint(joint: JointData): string {

        let flags = FlagPacker.pack([
            joint.type == JOINT_TYPE.PRISMATIC,
            joint.isInput,
            joint.isGrounded
        ])

        let xString = this.encodeDecimalNumber(joint.x)
        let yString = this.encodeDecimalNumber(joint.y)
       let  angleString = this.encodeDecimalNumber(joint.angleRadians)

        return "" + flags + joint.id + "," + xString + "," + yString + "," + angleString;
    }
    
    private decodeJoint(jointString: string): JointData {

        const sd = new StringDisassembler(jointString);

        // [FLAGS] = (JointType == PRISMATIC), (isInput), (isGrounded)
        let flags = sd.nextFlags(3);
        let jointType = flags[0] ? JOINT_TYPE.PRISMATIC : JOINT_TYPE.REVOLUTE;
        let isInput = flags[1];
        let isGrounded = flags[2];
        let id = sd.nextToken();
        let x = sd.nextDecimalNumber();
        let y = sd.nextDecimalNumber();
        let angle = sd.nextDecimalNumber();
        return new JointData(jointType, id, x, y, isGrounded, isInput, angle);
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

    private decodeLink(linkString: string): LinkData {

        const sd = new StringDisassembler(linkString);

        let type = (sd.nextCharacter() === "R") ? LINK_TYPE.REAL : LINK_TYPE.PISTON;
        let id = sd.nextToken();
        let mass = sd.nextDecimalNumber();
        let massMoI = sd.nextDecimalNumber();
        let xCoM = sd.nextDecimalNumber();
        let yCoM = sd.nextDecimalNumber();

        let jointIDs: string[] = [];
        while (!sd.isEmpty()) jointIDs.push(sd.nextToken());
        
        return new LinkData(type, id, mass, massMoI, xCoM, yCoM, jointIDs);
    }

    /*
    Force encoding is defined as 
    [FLAGS][id],[linkID],[startX],[startY],[endX],[endY],[magnitude]
    [FLAGS] = (isLocal), (isFacingOut)
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
        let flags = FlagPacker.pack([force.isLocal, force.isFacingOut])

        let startXString = this.encodeDecimalNumber(force.startX)
        let startYString = this.encodeDecimalNumber(force.startY)
        let endXString = this.encodeDecimalNumber(force.endX)
        let endYString = this.encodeDecimalNumber(force.endY)
        let magnitudeString = this.encodeDecimalNumber(force.magnitude)

        return "" + flags + force.id + "," + force.linkID + "," + startXString + "," + startYString + "," + endXString + "," + endYString + "," + magnitudeString;
    }

    private decodeForce(forceString: string): ForceData {

        const sd = new StringDisassembler(forceString);
        let flags = sd.nextFlags(2);
        let isLocal = flags[0];
        let isFacingOut = flags[1];

        let id = sd.nextToken();
        let linkID = sd.nextToken();
        let startX = sd.nextDecimalNumber();
        let startY = sd.nextDecimalNumber();
        let endX = sd.nextDecimalNumber();
        let endY = sd.nextDecimalNumber();
        let magnitude = sd.nextDecimalNumber();

        return new ForceData(id, linkID, startX, startY, endX, endY, isLocal, isFacingOut, magnitude);
    }

    /* 
    URL encoding is defined as 
    [FLAGS][global units],[angle units],[speed],[scale],[timestep],[joints,...].[links..,].[forces,..]
    [FLAGS] = (direction), (isGravityOn), (isGridOn), (isMinorGridLinesOn)
    [global units] = string
    [angle units] = string
    [speed] = number
    [direction] = number
    [scale] = number
    [timestep] = integer
    This should on average be 27 characters plus joints/links/forces
    */
    override encodeURL(): string {

        let flags = FlagPacker.pack([
            this.direction,
            this.isGravityOn,
            this.isMinorGridLinesOn,
            this.isMinorGridLinesOn
        ])

        let speedString = this.encodeDecimalNumber(this.speed)
        let scaleString = this.encodeDecimalNumber(this.scale)
        let timestepString = this.encodeInteger(this.timestep)

        let url = "" + flags + this.globalUnits + "," + this.angleUnits + "," + speedString + "," + scaleString + "," + timestepString + ",";
        
        // We delimit between data with '.'
        for (let i = 0; i < this.joints.length; i++) {
            url += this.encodeJoint(this.joints[i]) + ".";
        }
        url += ".";
        for (let i = 0; i < this.links.length; i++) {
            url += this.encodeLink(this.links[i]) + ".";
        }
        url += ".";
        for (let i = 0; i < this.forces.length; i++) {
            url += this.encodeForce(this.forces[i]) + ".";
        }
        return url;
    }

    override decodeURL(url: string): void {
        const sd = new StringDisassembler(url);

        const flags = sd.nextFlags(3);
        let direction = flags[0];
        this.setGravityOn(flags[1]);
        this.setGrid(flags[2], flags[3]);

        // Decode global settings
        this.setUnits(sd.nextToken(), sd.nextToken());
        this.setInputVector(sd.nextDecimalNumber(), direction);
        this.setScale(sd.nextDecimalNumber());
        this.setCurrentTimestep(sd.nextInteger());

        // Decode joints
        while (sd.pollNextCharacter() !== ".") {
            let joint = sd.nextToken(".");
            this.addJoint(this.decodeJoint(joint));
        }
        sd.nextCharacter(); // delete the . and move on to links

        // Decode links
        while (sd.pollNextCharacter() !== ".") {
            let link = sd.nextToken(".");
            this.addLink(this.decodeLink(link));
        }
        sd.nextCharacter(); // delete the . and move on to forces

        // Decode forces
        while (!sd.isEmpty()) {
            let force = sd.nextToken(".");
            this.addForce(this.decodeForce(force));
        }
    }

}