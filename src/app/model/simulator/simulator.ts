import {Joint} from "../joint";
import {Force} from "../force";
import {Link} from "../link";

export class Simulator {
  joints: Joint[];
  links: Link[];
  forces: Force[];
  gravity: boolean;
  unit: string;

  constructor(joints: Joint[], links: Link[], forces: Force[], gravity: boolean, unit: string) {
    this.joints = joints;
    this.links = links;
    this.forces = forces;
    this.gravity = gravity;
    this.unit = unit;
  }
}
