import { BaseNConverter } from "./base64-converter";
import { Checksum } from "./checksum";
import { FlagPacker } from "./flag-packer";
import { StringDisassembler } from "./string-disassembler";
import { ACTIVE_TYPE, ActiveObjData, ForceData, JOINT_TYPE, JointData, LINK_TYPE, LinkData } from "./transcoder-data";
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

        return BaseNConverter.toUrlSafeBaseN(normalizedNumber);
    }

    private encodeInteger(integer: number): string {
        return BaseNConverter.toUrlSafeBaseN(integer);
    }

    private decodeDecimalNumber(numberString: string): number {
        let normalizedNumber = BaseNConverter.fromUrlSafeBaseN(numberString);
        return normalizedNumber / 1000;
    }

    private decodeInteger(integerString: string): number {
        return BaseNConverter.fromUrlSafeBaseN(integerString);
    }

    /*
    Joint encoding is defined as:
    [FLAGS][JointID],[x],[y],[angleRadians],[linkID1],[linkID2]...
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
            joint.isGrounded,
            joint.isWelded,
            joint.showCurve,
        ])

        let xString = this.encodeDecimalNumber(joint.x)
        let yString = this.encodeDecimalNumber(joint.y)
        let angleString = this.encodeDecimalNumber(joint.angleRadians)

        return "" + flags + joint.id + "," + joint.name + "," + xString + "," + yString + "," + angleString;
    }
    
    private decodeJoint(jointString: string): JointData {

        const sd = new StringDisassembler(jointString);

        let flags = sd.nextFlags(5);
        let jointType = flags[0] ? JOINT_TYPE.PRISMATIC : JOINT_TYPE.REVOLUTE;
        let isInput = flags[1];
        let isGrounded = flags[2];
        let isWelded = flags[3];
        let showCurve = flags[4];

        let id = sd.nextToken();
        let name = sd.nextToken();
        let x = sd.nextDecimalNumber();
        let y = sd.nextDecimalNumber();
        let angle = sd.nextDecimalNumber();

        return new JointData(jointType, id, name, x, y, isGrounded, isInput, isWelded, angle, showCurve);
    }

    /*
    Link encoding is defined as 
    [type][id],[mass],[massMoI],[xCoM],[yCoM],[color],[jointID1,jointID2...],,[subsetLinkID1,subsetLinkID2...]
    This should on average be 26 + [number of joints] characters per link
    */
    private encodeLink(link: LinkData): string {
        let isRoot: string = (link.isRoot) ? "Y" : "N";
        let type: string = (link.type == LINK_TYPE.REAL) ? "R" : "P";
        let id = link.id;
        let massString = this.encodeDecimalNumber(link.mass)
        let massMoIString = this.encodeDecimalNumber(link.massMoI)
        let xCoMString = this.encodeDecimalNumber(link.xCoM)
        let yCoMString = this.encodeDecimalNumber(link.yCoM)
        let color = link.color.substring(1); // remove leading #

        let jointIDs: string = "";
        for (let i = 0; i < link.jointIDs.length; i++) {
            jointIDs += link.jointIDs[i] + ",";
        }
        // don't remove trailing comma. between joint and subset will have 2 consecutive commas

        let subsetLinkIDs: string = "";
        for (let i = 0; i < link.subsetLinkIDs.length; i++) {
            subsetLinkIDs += link.subsetLinkIDs[i] + ",";
        }
        subsetLinkIDs = subsetLinkIDs.substring(0, subsetLinkIDs.length - 1); // remove trailing comma

        return isRoot + type + id + "," + link.name + "," + massString + "," + massMoIString + "," + xCoMString + "," + yCoMString + "," + color + "," + jointIDs + "," + subsetLinkIDs;
    }

    private decodeLink(linkString: string): LinkData {

        const sd = new StringDisassembler(linkString);

        let isRoot = (sd.nextCharacter() === "Y");
        let type = (sd.nextCharacter() === "R") ? LINK_TYPE.REAL : LINK_TYPE.PISTON;
        let id = sd.nextToken();
        let name = sd.nextToken();
        let mass = sd.nextDecimalNumber();
        let massMoI = sd.nextDecimalNumber();
        let xCoM = sd.nextDecimalNumber();
        let yCoM = sd.nextDecimalNumber();
        let color = "#" + sd.nextToken(); // add leading #

        // parse joints until we hit a double comma
        let jointIDs: string[] = [];
        while (true) {
            let jointID = sd.nextToken();
            if (jointID === "") break;
            jointIDs.push(jointID);
        }

        // parse subset links until we hit the end of the string
        let subsetLinkIDs: string[] = [];
        while (!sd.isEmpty()) subsetLinkIDs.push(sd.nextToken());
        
        return new LinkData(isRoot, type, id, name, mass, massMoI, xCoM, yCoM, color, jointIDs, subsetLinkIDs);
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

        return "" + flags + force.id + "," + force.linkID + "," + force.name + "," + startXString + "," + startYString + "," + endXString + "," + endYString + "," + magnitudeString;
    }

    private decodeForce(forceString: string): ForceData {

        const sd = new StringDisassembler(forceString);
        let flags = sd.nextFlags(2);
        let isLocal = flags[0];
        let isFacingOut = flags[1];

        let id = sd.nextToken();
        let linkID = sd.nextToken();
        let name = sd.nextToken();
        let startX = sd.nextDecimalNumber();
        let startY = sd.nextDecimalNumber();
        let endX = sd.nextDecimalNumber();
        let endY = sd.nextDecimalNumber();
        let magnitude = sd.nextDecimalNumber();

        return new ForceData(id, linkID, name, startX, startY, endX, endY, isLocal, isFacingOut, magnitude);
    }

    private decodeLinkIDs(encodedString: string): Map<string, string> {
        const sd = new StringDisassembler(encodedString);
        let map = new Map<string, string>();
        while (!sd.isEmpty()) {
            let oldID = sd.nextToken();
            let newID = sd.nextToken();
            map.set(oldID, newID);
        }
        return map;
    }

    /* 
    URL encoding is defined as 
    [Bool settings].[Decimal settings].[Int settings,].[Enum settings,].[custom link ids].[Joints.].[Links.].[Forces.]
    This should on average be 27 characters plus joints/links/forces
    */
    override encodeURL(): string {

        console.log("Booleans:", this.boolData);
        console.log("Decimals:", this.decimalData);
        console.log("Integers:", this.intData);
        console.log("Enums:", this.enumData);


        // Encode global boolean settings through flagpacker
        const boolSettings = Object.values(this.boolData);
        let boolString = FlagPacker.pack(boolSettings);

        // Encode global decimal settings
        const decimalSettings = Object.values(this.decimalData);
        let decimalString = "";
        for (let i = 0; i < decimalSettings.length; i++) {
            decimalString += this.encodeDecimalNumber(decimalSettings[i]) + ",";
        }
        decimalString = decimalString.substring(0, decimalString.length - 1); // remove trailing comma

        // Encode global integer settings
        const intSettings = Object.values(this.intData);
        let intString = "";
        for (let i = 0; i < intSettings.length; i++) {
            intString += this.encodeInteger(intSettings[i]) + ",";
        }
        intString = intString.substring(0, intString.length - 1); // remove trailing comma

        // Encode global enum settings.
        // Precondition: enum < BaseNConverter.N
        const enumSettings = Object.values(this.enumData);
        let enumString = "";
        for (let i = 0; i < enumSettings.length; i++) {
            enumString += this.encodeInteger(enumSettings[i]);
        }
        enumString = enumString.substring(0, enumString.length - 1); // remove trailing comma
        
        let jointString = ""; // encoded string of all the joints
        for (let i = 0; i < this.joints.length; i++) {
            jointString += this.encodeJoint(this.joints[i]) + ".";
        }
        
        let linkString = ""; // encoded string of all the links
        for (let i = 0; i < this.links.length; i++) {
            linkString += this.encodeLink(this.links[i]) + ".";
        }
        
        let forceString = ""; // encoded string of all the forces
        for (let i = 0; i < this.forces.length; i++) {
            forceString += this.encodeForce(this.forces[i]) + ".";
        }

        // Encode active object. first char is type, rest is id
        let activeObj = this.getActiveObj();
        let activeObjString = activeObj.type.toString() + activeObj.id;

        let fullString = boolString + "." + decimalString + "." + intString + "." + enumString + "." + jointString + "." + linkString + "." + forceString + "." + activeObjString;

        // add checksum character in the end
        let checksum = new Checksum();
        let checkSumChar = checksum.generateChecksum(fullString.length);

        console.log("Generate checksum for length " + fullString.length + "and char " + checkSumChar);

        fullString += checkSumChar;
        return fullString;

    }

    override decodeURL(url: string): void {

        // Verify checksum
        let checksum = new Checksum();
        let lastChar = url.charAt(url.length - 1); // extract last character
        url = url.substring(0, url.length - 1); // remove checksum from url
        console.log("Verifying checksum for length " + url.length + "and char " + lastChar);
        if (!checksum.verifyChecksum(url.length, lastChar)) {
            throw new Error("Checksum failed");
        }

        // Now that we know the checksum is correct, we can remove the last character
        console.log("Checksum passed");
        

        const sd = new StringDisassembler(url);

        // Decode bool settings
        let boolString = sd.nextToken(".");
        let boolSettings = FlagPacker.unpack(boolString, Object.values(this.boolData).length);
        let i = 0;
        for (const key in this.boolData) {
            this.boolData[key] = boolSettings[i];
            i++;
        }

        // Decode decimal settings
        let decimalString = sd.nextToken(".");
        let decimalSettings = decimalString.split(",");
        i = 0;
        for (const key in this.decimalData) {
            this.decimalData[key] = this.decodeDecimalNumber(decimalSettings[i]);
            i++;
        }

        // Decode int settings
        let intString = sd.nextToken(".");
        let intSettings = intString.split(",");
        i = 0;
        for (const key in this.intData) {
            this.intData[key] = this.decodeInteger(intSettings[i]);
            i++;
        }

        // Decode enum settings
        let enumString = sd.nextToken(".");
        i = 0;
        for (const key in this.enumData) {
            this.enumData[key] = this.decodeInteger(enumString.charAt(i));
            i++;
        }

        console.log("Booleans:", this.boolData);
        console.log("Decimals:", this.decimalData);
        console.log("Integers:", this.intData);
        console.log("Enums:", this.enumData);

        // Decode joints
        while (sd.pollNextCharacter() !== ".") {
            let joint = sd.nextToken(".");
            this.addJoint(this.decodeJoint(joint));
        }
        sd.nextCharacter(); // delete the . and move on to links
        console.log("completed decoding joints");
        // Decode links
        while (sd.pollNextCharacter() !== ".") {
            let link = sd.nextToken(".");
            this.addLink(this.decodeLink(link));
        }
        sd.nextCharacter(); // delete the . and move on to forces
        console.log("completed decoding links");
        // Decode forces
        //sd.pollNextCharacter() !== "" adds backwards compatibility to previous encoding scheme.
        while (sd.pollNextCharacter() !== "." && sd.pollNextCharacter() !== "") {
            let force = sd.nextToken(".");
            this.addForce(this.decodeForce(force));
        }
        console.log("completed decoding forces");
        sd.nextCharacter(); // delete the . and move on to active object

        // Decode active object. Next char is type, rest is id
        let activeType = sd.nextCharacter();
        let activeID = sd.nextToken();
        console.log("completed decoding active object");console.log("completed decoding forces");
        let typeEnum;
        if (activeType === "J") typeEnum = ACTIVE_TYPE.JOINT;
        else if (activeType === "L") typeEnum = ACTIVE_TYPE.LINK;
        else if (activeType === "F") typeEnum = ACTIVE_TYPE.FORCE;
        else typeEnum = ACTIVE_TYPE.NOTHING;

        this.setActiveObj(new ActiveObjData(typeEnum, activeID));
        console.log("completed decoding");
    }

}