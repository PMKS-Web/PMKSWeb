import { BaseNConverter } from './base64-converter';
import { Checksum } from './checksum';
import { FlagPacker } from './flag-packer';
import { StringDisassembler } from './string-disassembler';
import {
  ACTIVE_TYPE,
  ActiveObjData,
  ForceData,
  JOINT_TYPE,
  JointData,
  LINK_TYPE,
  LinkData,
} from './transcoder-data';
import { GenericTranscoder } from './transcoder-interface';
import { JOINT_FAMILIES } from '../../model/joint-colors';

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
    let normalizedNumber = Math.round(number * 1000);

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
    [FLAGS] = (JointType == PRISMATIC), (isInput), (isGrounded), (isWelded), (showCurve), (isSealed)
    [JointID] = string
    [x] = number
    [y] = number
    [angleRadians] = number
    A floating slot appends three more tokens:
    ...,[carrierID],[slotJointAID],[slotJointBID]
    They are written only when the slot is floating, so grounded sliders and
    every pre-existing URL keep exactly the five tokens they had.
    This should on average be 18 characters per joint
    */
  private encodeJoint(joint: JointData): string {
    // Six flags still pack into one base-64 character, so appending isSealed
    // leaves every pre-sealed URL byte-identical and decodes their sixth bit
    // as false — which is the correct legacy meaning (a plain welded slide).
    let flags = FlagPacker.pack([
      joint.type == JOINT_TYPE.PRISMATIC,
      joint.isInput,
      joint.isGrounded,
      joint.isWelded,
      joint.showCurve,
      joint.isSealed,
    ]);

    let xString = this.encodeDecimalNumber(joint.x);
    let yString = this.encodeDecimalNumber(joint.y);
    let angleString = this.encodeDecimalNumber(joint.angleRadians);

    // Written only by a joint that has actually been given its own speed, so a
    // mechanism running at the document-wide default encodes exactly as it
    // always did -- every template and every previously shared URL still comes
    // back byte-identical, and only a drawing that uses the feature pays for
    // it.
    //
    // It has to land *after* the slot triple, so a joint with a speed and no
    // slot writes the triple empty; without those placeholders the decoder
    // would read the speed as a carrier id.
    let driveString =
      joint.isInput && joint.driveSpeed !== 0
        ? ',' + this.encodeDecimalNumber(joint.driveSpeed)
        : '';
    let slotString =
      joint.carrierID === ''
        ? driveString === ''
          ? ''
          : ',,,'
        : ',' + joint.carrierID + ',' + joint.slotJointAID + ',' + joint.slotJointBID;

    return (
      '' +
      flags +
      joint.id +
      ',' +
      joint.name +
      ',' +
      xString +
      ',' +
      yString +
      ',' +
      angleString +
      slotString +
      driveString
    );
  }

  private decodeJoint(jointString: string): JointData {
    const sd = new StringDisassembler(jointString);

    let flags = sd.nextFlags(6);
    let jointType = flags[0] ? JOINT_TYPE.PRISMATIC : JOINT_TYPE.REVOLUTE;
    let isInput = flags[1];
    let isGrounded = flags[2];
    let isWelded = flags[3];
    let showCurve = flags[4];
    let isSealed = flags[5];

    let id = sd.nextToken();
    let name = sd.nextToken();
    let x = sd.nextDecimalNumber();
    let y = sd.nextDecimalNumber();
    let angle = sd.nextDecimalNumber();

    // Absent on a pre-feature URL, where nextToken answers "" past the end.
    let carrierID = sd.nextToken();
    let slotJointAID = sd.nextToken();
    let slotJointBID = sd.nextToken();
    // Zero past the end, which is how a URL written before per-mechanism speed
    // says "use the document-wide default".
    let driveSpeed = sd.nextDecimalNumber();

    return new JointData(
      jointType,
      id,
      name,
      x,
      y,
      isGrounded,
      isInput,
      isWelded,
      angle,
      showCurve,
      carrierID,
      slotJointAID,
      slotJointBID,
      isSealed,
      driveSpeed
    );
  }

  /*
    Link encoding is defined as 
    [type][id],[mass],[massMoI],[xCoM],[yCoM],[color],[jointID1,jointID2...],,[subsetLinkID1,subsetLinkID2...]
    This should on average be 26 + [number of joints] characters per link
    */
  /**
   * The link record's leading character carries root-ness, the two auto/custom
   * flags and whether the link is drawn as a disc, all in one slot, because the
   * record's tail is variable length and cannot take an appended field. 'Y'/'N'
   * are the legacy pair and keep meaning what every old URL meant: values the
   * author chose, drawn as a bar.
   *
   *   bar,  root:      Y = both custom   A = both auto   M = MoI auto   G = CoM auto
   *   bar,  non-root:  N = both custom   a = both auto   m = MoI auto   g = CoM auto
   *   disc, root:      0 = both custom   1 = both auto   2 = MoI auto   3 = CoM auto
   *   disc, non-root:  4 = both custom   5 = both auto   6 = MoI auto   7 = CoM auto
   *
   * Digits for the disc half so the two halves cannot be confused for one
   * another by eye, and because no letter was left that did not already read as
   * something else in this format. A drawing with no circular link in it still
   * encodes to exactly the bytes it did before discs existed — the same bargain
   * the lock section makes.
   */
  private static readonly LINK_FLAG_CHARS: Record<string, [boolean, boolean, boolean, boolean]> = {
    // char: [isRoot, moiIsCustom, comIsCustom, isCircle]
    Y: [true, true, true, false],
    A: [true, false, false, false],
    M: [true, false, true, false],
    G: [true, true, false, false],
    N: [false, true, true, false],
    a: [false, false, false, false],
    m: [false, false, true, false],
    g: [false, true, false, false],
    '0': [true, true, true, true],
    '1': [true, false, false, true],
    '2': [true, false, true, true],
    '3': [true, true, false, true],
    '4': [false, true, true, true],
    '5': [false, false, false, true],
    '6': [false, false, true, true],
    '7': [false, true, false, true],
  };

  private encodeLink(link: LinkData): string {
    // Found in the same table the decoder reads, rather than written out a
    // second time here: the two can then only agree.
    const wanted = [link.isRoot, link.moiIsCustom, link.comIsCustom, link.isCircle];
    const isRoot = Object.keys(StringTranscoder.LINK_FLAG_CHARS).find((candidate) =>
      StringTranscoder.LINK_FLAG_CHARS[candidate].every((flag, i) => flag === wanted[i])
    )!;
    let type: string = link.type == LINK_TYPE.REAL ? 'R' : 'P';
    let id = link.id;
    let massString = this.encodeDecimalNumber(link.mass);
    let massMoIString = this.encodeDecimalNumber(link.massMoI);
    let xCoMString = this.encodeDecimalNumber(link.xCoM);
    let yCoMString = this.encodeDecimalNumber(link.yCoM);
    let color = link.color.substring(1); // remove leading #

    let jointIDs: string = '';
    for (let i = 0; i < link.jointIDs.length; i++) {
      jointIDs += link.jointIDs[i] + ',';
    }
    // don't remove trailing comma. between joint and subset will have 2 consecutive commas

    let subsetLinkIDs: string = '';
    for (let i = 0; i < link.subsetLinkIDs.length; i++) {
      subsetLinkIDs += link.subsetLinkIDs[i] + ',';
    }
    subsetLinkIDs = subsetLinkIDs.substring(0, subsetLinkIDs.length - 1); // remove trailing comma

    return (
      isRoot +
      type +
      id +
      ',' +
      link.name +
      ',' +
      massString +
      ',' +
      massMoIString +
      ',' +
      xCoMString +
      ',' +
      yCoMString +
      ',' +
      color +
      ',' +
      jointIDs +
      ',' +
      subsetLinkIDs
    );
  }

  private decodeLink(linkString: string): LinkData {
    const sd = new StringDisassembler(linkString);

    const flagChar = sd.nextCharacter();
    const flags = StringTranscoder.LINK_FLAG_CHARS[flagChar];
    if (!flags) {
      // Fail closed: a character from some future format must reject the URL,
      // not quietly demote the link to a non-root nobody solves.
      throw new Error(`Unknown link flag character '${flagChar}'`);
    }
    const [isRoot, moiIsCustom, comIsCustom, isCircle] = flags;
    let type = sd.nextCharacter() === 'R' ? LINK_TYPE.REAL : LINK_TYPE.PISTON;
    let id = sd.nextToken();
    let name = sd.nextToken();
    let mass = sd.nextDecimalNumber();
    let massMoI = sd.nextDecimalNumber();
    let xCoM = sd.nextDecimalNumber();
    let yCoM = sd.nextDecimalNumber();
    let color = '#' + sd.nextToken(); // add leading #

    // parse joints until we hit a double comma
    let jointIDs: string[] = [];
    while (true) {
      let jointID = sd.nextToken();
      if (jointID === '') break;
      jointIDs.push(jointID);
    }

    // parse subset links until we hit the end of the string
    let subsetLinkIDs: string[] = [];
    while (!sd.isEmpty()) subsetLinkIDs.push(sd.nextToken());

    return new LinkData(
      isRoot,
      type,
      id,
      name,
      mass,
      massMoI,
      xCoM,
      yCoM,
      color,
      jointIDs,
      subsetLinkIDs,
      moiIsCustom,
      comIsCustom,
      isCircle
    );
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
    let flags = FlagPacker.pack([force.isLocal, force.isFacingOut]);

    let startXString = this.encodeDecimalNumber(force.startX);
    let startYString = this.encodeDecimalNumber(force.startY);
    let endXString = this.encodeDecimalNumber(force.endX);
    let endYString = this.encodeDecimalNumber(force.endY);
    let magnitudeString = this.encodeDecimalNumber(force.magnitude);

    return (
      '' +
      flags +
      force.id +
      ',' +
      force.linkID +
      ',' +
      force.name +
      ',' +
      startXString +
      ',' +
      startYString +
      ',' +
      endXString +
      ',' +
      endYString +
      ',' +
      magnitudeString
    );
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

    return new ForceData(
      id,
      linkID,
      name,
      startX,
      startY,
      endX,
      endY,
      isLocal,
      isFacingOut,
      magnitude
    );
  }

  /* 
    URL encoding is defined as 
    [Bool settings].[Decimal settings].[Int settings,].[Enum settings,].[custom link ids].[Joints.].[Links.].[Forces.]
    This should on average be 27 characters plus joints/links/forces
    */
  override encodeURL(): string {
    console.log('Booleans:', this.boolData);
    console.log('Decimals:', this.decimalData);
    console.log('Integers:', this.intData);
    console.log('Enums:', this.enumData);

    // Encode global boolean settings through flagpacker
    const boolSettings = Object.values(this.boolData);
    let boolString = FlagPacker.pack(boolSettings);

    // Encode global decimal settings
    const decimalSettings = Object.values(this.decimalData);
    let decimalString = '';
    for (let i = 0; i < decimalSettings.length; i++) {
      decimalString += this.encodeDecimalNumber(decimalSettings[i]) + ',';
    }
    decimalString = decimalString.substring(0, decimalString.length - 1); // remove trailing comma

    // Encode global integer settings
    const intSettings = Object.values(this.intData);
    let intString = '';
    for (let i = 0; i < intSettings.length; i++) {
      intString += this.encodeInteger(intSettings[i]) + ',';
    }
    intString = intString.substring(0, intString.length - 1); // remove trailing comma

    // Encode global enum settings.
    // Precondition: enum < BaseNConverter.N
    const enumSettings = Object.values(this.enumData);
    let enumString = '';
    for (let i = 0; i < enumSettings.length; i++) {
      enumString += this.encodeInteger(enumSettings[i]);
    }

    let jointString = ''; // encoded string of all the joints
    for (let i = 0; i < this.joints.length; i++) {
      jointString += this.encodeJoint(this.joints[i]) + '.';
    }

    let linkString = ''; // encoded string of all the links
    for (let i = 0; i < this.links.length; i++) {
      linkString += this.encodeLink(this.links[i]) + '.';
    }

    let forceString = ''; // encoded string of all the forces
    for (let i = 0; i < this.forces.length; i++) {
      forceString += this.encodeForce(this.forces[i]) + '.';
    }

    // Encode active object. first char is type, rest is id
    let activeObj = this.getActiveObj();
    let activeObjString = activeObj.type.toString() + activeObj.id;

    let fullString =
      boolString +
      '.' +
      decimalString +
      '.' +
      intString +
      '.' +
      enumString +
      '.' +
      jointString +
      '.' +
      linkString +
      '.' +
      forceString +
      '.' +
      activeObjString;

    // Written only when there is something to say, so a URL with no locks and
    // no re-anchored centre of mass stays byte-identical to one written before
    // either existed — the same bargain the slot triple and the per-joint
    // drive speed struck.
    //
    // Centre-of-mass anchors share this section rather than opening a second
    // one, because they are the same shape of thing: a tagged reference to an
    // object the URL already carries. Their tag is 'C', which no lock uses, so
    // the two are told apart on the way in and neither can be mistaken for the
    // other. 'CG<link>' holds the point on the drawing; 'CJ<link>~<joint>'
    // holds it on one pin, '~' being a character no id can contain.
    // Synthesis joins them for a third time, tagged 'S'. Its entries describe a
    // design rather than an object the URL carries, so unlike a lock or an
    // anchor there is nothing for them to resolve against -- which is exactly
    // why they can be validated on their own numbers alone.
    // A fourth kind of tagged reference, 'K', for a part asked to be drawn in a
    // colour of its own: 'KJ<joint>~<family>' and 'KF<force>~<rrggbb>'. Only
    // the parts that were asked, so a drawing where nobody chose a colour says
    // nothing about colour.
    const trailing = [
      ...this.lockedIds,
      ...this.comAnchors,
      ...this.synthesisMarks,
      ...this.partColors,
    ];
    if (trailing.length > 0) {
      fullString += '.' + trailing.join(',');
    }

    // add checksum character in the end
    let checksum = new Checksum();
    let checkSumChar = checksum.generateChecksum(fullString.length);

    console.log('Generate checksum for length ' + fullString.length + 'and char ' + checkSumChar);

    fullString += checkSumChar;
    return fullString;
  }

  override decodeURL(url: string): void {
    if (url.length < 2) throw new Error('URL data is incomplete');

    // Verify checksum
    let checksum = new Checksum();
    let lastChar = url.charAt(url.length - 1); // extract last character
    url = url.substring(0, url.length - 1); // remove checksum from url
    console.log('Verifying checksum for length ' + url.length + 'and char ' + lastChar);
    if (!checksum.verifyChecksum(url.length, lastChar)) {
      throw new Error('Checksum failed');
    }

    // Now that we know the checksum is correct, we can remove the last character
    console.log('Checksum passed');

    const sd = new StringDisassembler(url);

    // Decode bool settings
    let boolString = sd.nextToken('.');
    if (boolString === '') throw new Error('URL settings are missing');
    let boolSettings = FlagPacker.unpack(boolString, Object.values(this.boolData).length);
    let i = 0;
    for (const key in this.boolData) {
      this.boolData[key] = boolSettings[i];
      i++;
    }

    // Decode decimal settings
    let decimalString = sd.nextToken('.');
    if (decimalString === '') throw new Error('URL decimal settings are missing');
    let decimalSettings = decimalString.split(',');
    i = 0;
    for (const key in this.decimalData) {
      // One-decimal URLs predate LINEAR_INPUT_SPEED. A missing trailing token
      // must not be decoded as a truncated base-N number; zero here is what the
      // builder reads as "not in this URL" and answers with the default.
      this.decimalData[key] =
        i < decimalSettings.length ? this.decodeDecimalNumber(decimalSettings[i]) : 0;
      i++;
    }

    // Decode int settings
    let intString = sd.nextToken('.');
    if (intString === '') throw new Error('URL integer settings are missing');
    let intSettings = intString.split(',');
    i = 0;
    for (const key in this.intData) {
      this.intData[key] = this.decodeInteger(intSettings[i]);
      i++;
    }

    // Decode enum settings
    let enumString = sd.nextToken('.');
    i = 0;
    for (const key in this.enumData) {
      // Three-enum URLs predate GLOBAL_UNIT. Missing trailing enum data
      // must not be decoded as an invalid/truncated base-N token.
      this.enumData[key] = i < enumString.length ? this.decodeInteger(enumString.charAt(i)) : 0;
      i++;
    }

    console.log('Booleans:', this.boolData);
    console.log('Decimals:', this.decimalData);
    console.log('Integers:', this.intData);
    console.log('Enums:', this.enumData);

    // Decode joints
    while (!sd.isEmpty() && sd.pollNextCharacter() !== '.') {
      let joint = sd.nextToken('.');
      this.addJoint(this.decodeJoint(joint));
    }
    if (sd.isEmpty()) throw new Error('URL link section is missing');
    sd.nextCharacter(); // delete the . and move on to links

    // Decode links
    while (!sd.isEmpty() && sd.pollNextCharacter() !== '.') {
      let link = sd.nextToken('.');
      this.addLink(this.decodeLink(link));
    }
    if (sd.isEmpty()) throw new Error('URL force section is missing');
    sd.nextCharacter(); // delete the . and move on to forces

    // Decode forces
    while (!sd.isEmpty() && sd.pollNextCharacter() !== '.') {
      let force = sd.nextToken('.');
      this.addForce(this.decodeForce(force));
    }
    if (!sd.isEmpty() && sd.pollNextCharacter() === '.') {
      sd.nextCharacter(); // delete the . and move on to active object
    }

    // Decode active object. Next char is type, rest is id.
    // The id stops at '.' because the optional lock section follows it; a URL
    // without that section reads to the end exactly as it always did.
    let activeType = sd.isEmpty() ? 'N' : sd.nextCharacter();
    let activeID = sd.isEmpty() ? '' : sd.nextToken('.');

    // The trailing section: type-tagged ids, absent on every URL written before
    // locks existed — and "absent" simply means the disassembler is empty.
    // 'C' entries are centre-of-mass anchors and go to their own list, so the
    // lock validator below never has to know they exist.
    while (!sd.isEmpty()) {
      let entry = sd.nextToken(',');
      if (entry === '') continue;
      if (entry.charAt(0) === 'C') this.comAnchors.push(entry);
      else if (entry.charAt(0) === 'S') this.synthesisMarks.push(entry);
      else if (entry.charAt(0) === 'K') this.partColors.push(entry);
      else this.lockedIds.push(entry);
    }

    let typeEnum;
    if (activeType === 'J') typeEnum = ACTIVE_TYPE.JOINT;
    else if (activeType === 'L') typeEnum = ACTIVE_TYPE.LINK;
    else if (activeType === 'F') typeEnum = ACTIVE_TYPE.FORCE;
    else typeEnum = ACTIVE_TYPE.NOTHING;

    this.setActiveObj(new ActiveObjData(typeEnum, activeID));
    this.validateDecodedData();
  }

  private validateDecodedData(): void {
    const jointIDs = new Set(this.joints.map((joint) => joint.id));
    const linkIDs = new Set(this.links.map((link) => link.id));
    if (jointIDs.size !== this.joints.length || linkIDs.size !== this.links.length) {
      throw new Error('URL contains duplicate object IDs');
    }
    this.joints.forEach((joint) => {
      if (!joint.id || ![joint.x, joint.y, joint.angleRadians].every(Number.isFinite)) {
        throw new Error('URL contains an invalid joint');
      }
    });
    this.validateDecodedSlots(jointIDs);
    this.links.forEach((link) => {
      if (
        !link.id ||
        ![link.mass, link.massMoI, link.xCoM, link.yCoM].every(Number.isFinite) ||
        link.jointIDs.some((id) => !jointIDs.has(id)) ||
        link.subsetLinkIDs.some((id) => !linkIDs.has(id))
      ) {
        throw new Error('URL contains an invalid link');
      }
    });
    this.validateDecodedSlotCarriers();
    this.validateDecodedLocks(jointIDs, linkIDs);
    this.validateDecodedPartColors(jointIDs);
    this.forces.forEach((force) => {
      if (
        !force.id ||
        !linkIDs.has(force.linkID) ||
        ![force.startX, force.startY, force.endX, force.endY, force.magnitude].every(
          Number.isFinite
        ) ||
        force.magnitude < 0
      ) {
        throw new Error('URL contains an invalid force');
      }
    });
  }

  /*
    A floating slot is all three tokens or none of them (§2.4a). Anything in
    between is reported rather than repaired: repairing it would mean picking
    between "this was meant to be grounded" and "this was meant to slide on a
    link we can no longer name", and guessing wrong silently hands the user a
    different mechanism than the one they shared.
    */
  private validateDecodedSlots(jointIDs: Set<string>): void {
    this.joints.forEach((joint) => {
      // The sealed bit belongs to the prismatic pin of a floating slot — a
      // cylinder's barrel is a link, never the ground. No legacy URL carries
      // the bit, so strictness here costs nothing and catches hand-edits.
      if (joint.isSealed && (joint.type !== JOINT_TYPE.PRISMATIC || joint.carrierID === '')) {
        throw new Error('URL seals a joint that is not a floating slider');
      }
      const tokens = [joint.carrierID, joint.slotJointAID, joint.slotJointBID];
      const present = tokens.filter((token) => token !== '').length;
      if (present === 0) return;
      if (present !== 3) {
        throw new Error('URL contains a slot missing its carrier or slot joints');
      }
      if (joint.type !== JOINT_TYPE.PRISMATIC) {
        throw new Error('URL gives a slot carrier to a joint that does not slide');
      }
      if (joint.isGrounded) {
        throw new Error('URL contains a slot that is both grounded and carried');
      }
      if (joint.slotJointAID === joint.slotJointBID) {
        throw new Error('URL contains a slot defined by one joint twice');
      }
      if (joint.slotJointAID === joint.id || joint.slotJointBID === joint.id) {
        throw new Error('URL contains a slot defined by the sliding joint itself');
      }
      if (!jointIDs.has(joint.slotJointAID) || !jointIDs.has(joint.slotJointBID)) {
        throw new Error('URL contains a slot whose defining joints are missing');
      }
    });
  }

  /*
    Every lock reference must name an object this URL actually carries. No
    legacy URL has the section at all, so strictness costs nothing and catches
    hand-edits — the same bargain the sealed bit strikes.
    */
  /*
    Every colour must name a part this URL carries, and say something about it
    this build understands. Refused rather than dropped, for the same reason a
    lock reference is: a URL saying something this build cannot honour would
    open as a different drawing than the one that was shared. A joint family the
    reader does not have is exactly that -- and the default family's id is empty
    and never written, so an entry naming it is a URL saying nothing twice.
    */
  private validateDecodedPartColors(jointIDs: Set<string>): void {
    const families = new Set(JOINT_FAMILIES.map((family) => family.id).filter((id) => id !== ''));
    const forceIDs = new Set(this.forces.map((force) => force.id));
    this.partColors.forEach((entry) => {
      const kind = entry.charAt(1);
      const [id, value] = entry.substring(2).split('~');
      const known =
        kind === 'J'
          ? jointIDs.has(id) && families.has(value ?? '')
          : kind === 'F'
            ? forceIDs.has(id) && /^[0-9a-fA-F]{6}$/.test(value ?? '')
            : false;
      if (!known) throw new Error('URL colours a part it does not carry');
    });
  }

  private validateDecodedLocks(jointIDs: Set<string>, linkIDs: Set<string>): void {
    const forceIDs = new Set(this.forces.map((force) => force.id));
    this.lockedIds.forEach((lockedId) => {
      const tag = lockedId.charAt(0);
      const id = lockedId.substring(1);
      const resolves =
        (tag === 'J' && jointIDs.has(id)) ||
        (tag === 'L' && linkIDs.has(id)) ||
        (tag === 'F' && forceIDs.has(id));
      if (!resolves) {
        throw new Error('URL locks an object it does not contain');
      }
    });
    this.validateDecodedComAnchors(linkIDs);
    this.validateDecodedSynthesis();
  }

  /**
   * A synthesis design must be the right entries, with the right count of
   * readable numbers in each.
   *
   * Most of it names nothing in the drawing -- the exception is `SO`, which
   * lists the joints the design put there -- so there is little to resolve
   * against. What there is to check is shape, and a design half-read is worse
   * than no design: the panel would open on positions that are not where the
   * reader left them. Fails closed, like every other trailing section.
   */
  private validateDecodedSynthesis(): void {
    // Field counts per entry. `SO` is the one that varies: it lists the joints
    // the design owns, and how many there are depends on the linkage.
    const expected: { [tag: string]: number } = { SD: 3, SP: 3, SR: 4 };
    /*
      Every character the number encoder can emit, and nothing else.

      Without this the check stopped at counting fields, and an unreadable
      character decoded to -1 rather than failing -- so one corrupt digit in a
      length silently produced a different number, and the design came back
      with its three positions intact around a coupler that was not the one
      that had been shared. That is precisely the half-load this validator
      exists to prevent.
    */
    const numeric = /^[0-9A-Za-z_-]+$/;
    const seen = new Map<string, number>();
    this.synthesisMarks.forEach((entry) => {
      const tag = entry.substring(0, 2);
      const count = expected[tag];
      // `SO` and `SW` both vary in length with the size of the linkage: the
      // ids the design owns, and the place each of them was put.
      const varies = tag === 'SO' || tag === 'SW';
      if (count === undefined && !varies) {
        throw new Error('URL contains an unknown synthesis entry');
      }
      seen.set(tag, (seen.get(tag) ?? 0) + 1);
      const parts = entry.substring(2).split('~').slice(1);
      const enough = varies ? parts.length >= 1 : parts.length === count;
      // Two numbers to a joint, so an odd count is a truncated list and the
      // baseline would silently belong to the wrong joints.
      if (tag === 'SW' && parts.length % 2 !== 0) {
        throw new Error('URL contains an incomplete synthesis entry');
      }
      if (!enough || parts.some((part) => part === '')) {
        throw new Error('URL contains an incomplete synthesis entry');
      }
      // Ownership carries object ids, which are letters; every other entry is
      // numbers, and has to look like numbers.
      if (tag !== 'SO' && parts.some((part) => !numeric.test(part))) {
        throw new Error('URL contains an unreadable synthesis number');
      }
    });
    if ((seen.get('SP') ?? 0) > 3) {
      throw new Error('URL contains more than three synthesis positions');
    }
    // One design per URL. Two headers, or two of anything that describes the
    // design as a whole, means the section was assembled by something other
    // than this app, and there is no sensible way to choose between them.
    (['SD', 'SR', 'SO', 'SW'] as const).forEach((tag) => {
      if ((seen.get(tag) ?? 0) > 1) {
        throw new Error('URL repeats a synthesis entry');
      }
    });
  }

  /**
   * Every anchor must name a link this URL carries, and a pin anchor must name
   * a joint of that same link — anchoring to a pin the link does not hold has
   * no meaning, and would silently fall back to the centroid on first use.
   */
  private validateDecodedComAnchors(linkIDs: Set<string>): void {
    this.comAnchors.forEach((entry) => {
      const [reference, jointID] = entry.substring(2).split('~');
      const link = this.links.find((candidate) => candidate.id === reference);
      const resolves =
        linkIDs.has(reference) &&
        link !== undefined &&
        (entry.charAt(1) === 'G'
          ? jointID === undefined
          : entry.charAt(1) === 'J' && jointID !== undefined && link.jointIDs.includes(jointID));
      if (!resolves) {
        throw new Error('URL anchors a center of mass to something it does not contain');
      }
    });
  }

  /* Both slot joints must be members of the carrier, and the slider must not. */
  private validateDecodedSlotCarriers(): void {
    this.joints.forEach((joint) => {
      if (joint.carrierID === '') return;
      const carrier = this.links.find((link) => link.id === joint.carrierID);
      if (!carrier) {
        throw new Error('URL contains a slot whose carrier link is missing');
      }
      if (
        !carrier.jointIDs.includes(joint.slotJointAID) ||
        !carrier.jointIDs.includes(joint.slotJointBID)
      ) {
        throw new Error('URL contains a slot whose joints are not on its carrier');
      }
      if (carrier.jointIDs.includes(joint.id)) {
        throw new Error('URL contains a slot that is a member of its own carrier');
      }
    });
  }
}
