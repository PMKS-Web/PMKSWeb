import { Component, OnInit } from '@angular/core';
import {GridComponent} from "../grid/grid.component";
import {Link, RealLink} from "../../model/link";
import {Joint, RealJoint} from "../../model/joint";
import {Force} from "../../model/force";
import {Coord} from "../../model/coord";

@Component({
  selector: 'app-templates-popup',
  templateUrl: './templates-popup.component.html',
  styleUrls: ['./templates-popup.component.css']
})
export class TemplatesPopupComponent implements OnInit {


  private static popUpWindow: SVGElement;
  constructor() { }

  ngOnInit(): void {
    TemplatesPopupComponent.popUpWindow = document.getElementById('templatesPopup') as unknown as SVGElement;
  }

  static showTemplates() {
    TemplatesPopupComponent.popUpWindow.style.display = 'block';
  }

  closeTemplates() {
    TemplatesPopupComponent.popUpWindow.style.display = 'none';
  }

  mouseOver(num: number) {}

  mouseOut(num: number) {}

  openLinkage(linkage: string) {
    let content = '';
    switch (linkage) {
      case '4-Bar':
        content = 'j=a,-1.24,-0.89,ab,R,t,Null,t%0Ab,-0.1,2.01,ab%7Cbc,R,f,Null,f%0Ac,' +
          '4.26,2.27,bc%7Ccd,R,f,Null,f%0Ad,3.36,-1.01,cd,R,t,Null,f%0A&l=ab,1,1,-0.67,0.5599999999999998,a%7Cb,,' +
          'line,-0.1,-0.89,-0.1,2.01,-1.24,2.01,-1.24,-0.89%0Abc,1,1,2.08,2.1399999999999997,b%7Cc,,line,4.26,' +
          '2.01,4.26,2.27,-0.1,2.27,-0.1,2.01%0Acd,1,1,3.8099999999999996,0.63,c%7Cd,,line,3.36,2.27,3.36,-1.01,' +
          '4.26,-1.01,4.26,2.27%0A&f=&s=10,false,false,cm';
        break;
      case 'Watt_I':
        content = 'j=A,-0.7,0.07,AB,R,t,0,0.1,t,%0AB,-2.16,1.21,AB%7CCBD,R,f,0,0.1,f,%0AC,1.32,0.49,CBD%7CCFG,R,f,0,0.1,f,%0AD,' +
          '-0.24,3.69,DE%7CCBD,R,f,0,0.1,f,%0AE,5.08,5.31,DE%7CFE,R,f,0,0.1,f,%0AF,5.82,1.65,FE%7CCFG,R,f,0,0.1,f,%0AG,5.14,-2.63,CFG,R,' +
          't,0,0.1,f,%0A&l=AB,1,1,-1.4300000000000002,0.64,A%7CB,,l,-2.16,0.07,-0.7,0.07,-0.7,1.21,-2.16,1.21%0ADE,1,1,2.42,4.5,D%7CE,,l,' +
          '5.08,3.69,-0.24,3.69,-0.24,5.31,5.08,5.31%0ACBD,1,1,-0.35100000000000053,2.6315,B%7CC%7CD,,et,1.902,0.193,-3.086,0.75,-2.604,' +
          '5.07,2.384,4.513%0AFE,1,1,5.45,3.48,E%7CF,,l,5.82,5.31,5.08,5.31,5.08,1.65,5.82,1.65%0ACFG,1,1,4.563116364922001,' +
          '-1.0471025120608002,C%7CF%7CG,,et,0.837,0.556,6.682,2.412,8.289,-2.65,2.444,-4.506%0A&f=&pp=&tp=&s=10,false,false,cm';
        break;
      case 'Watt_II':
        content = 'j=A,-0.46,-1.79,AB,R,t,0,0.1,t,%0AB,-0.76,-0.41,AB%7CCB,R,f,0,0.1,f,%0AC,1.14,-0.25,CB%7CDCG,R,f,0,' +
          '0.1,f,%0AD,3.34,-0.23,ED%7CDCG,R,f,0,0.1,f,%0AE,5.62,-0.11,ED%7CFE,R,f,0,0.1,f,%0AF,5.02,-2.31,FE,R,t,0,0.1,f,%0AG,' +
          '2.28,-2.57,DCG,R,t,0,0.1,f,%0A&l=AB,1,1,-0.61,-1.1,A%7CB,,l,-0.76,-1.79,-0.46,-1.79,-0.46,-0.41,-0.76,-0.41%0ACB,1,' +
          '1,0.18999999999999995,-0.32999999999999996,B%7CC,,l,1.14,-0.41,-0.76,-0.41,-0.76,-0.25,1.14,-0.25%0AED,1,1,4.48,' +
          '-0.17,D%7CE,,l,5.62,-0.23,3.34,-0.23,3.34,-0.11,5.62,-0.11%0AFE,1,1,5.32,-1.21,E%7CF,,l,5.02,-0.11,5.62,-0.11,5.62,' +
          '-2.31,5.02,-2.31%0ADCG,1,1,2.2616957814821452,-1.5297232122207447,C%7CD%7CG,,et,0.383,0.041,4.085,0.106,4.14,-3.101,' +
          '0.438,-3.165%0A&f=&pp=&tp=&s=10,false,false,cm';
        break;
      case 'Stephenson_I':
        content = 'j=A,-0.58,-0.27,ABE,R,t,0,0.1,t,%0AB,-0.74,0.61,CB%7CABE,R,f,0,0.1,f,%0AC,3.72,0.35,CB%7CGCD,R,f,0,0.1,' +
          'f,%0AE,-2,1.53,EF%7CABE,R,f,0,0.1,f,%0AF,3.3,3.19,EF%7CGF,R,f,0,0.1,f,%0AG,6.52,0.93,GF%7CGCD,R,f,0,0.1,f,%0AD,4.9,-1.61,' +
          'GCD,R,t,0,0.1,f,%0A&l=CB,1,1,1.49,0.48,B%7CC,,l,3.72,0.61,-0.74,0.61,-0.74,0.35,3.72,0.35%0AEF,1,1,0.6499999999999999,2.36,' +
          'E%7CF,,l,3.3,1.53,-2,1.53,-2,3.19,3.3,3.19%0AABE,1,1,-1.9194999999999995,0.891,A%7CB%7CE,,et,1.468,0.306,-2.983,-2.379,-5.307,' +
          '1.476,-0.856,4.161%0AGF,1,1,4.91,2.06,F%7CG,,l,6.52,3.19,3.3,3.19,3.3,0.93,6.52,0.93%0AGCD,1,1,5.264318219270205,' +
          '-0.9356806929201105,C%7CG%7CD,,et,2.784,0.518,7.058,1.311,7.744,-2.389,3.471,-3.182%0A&f=&pp=&tp=&s=10,false,false,cm';
        break;
      case 'Stephenson_II':
        break;
      case 'Stephenson_III':
        content = 'j=A,-1.41,0.25,AB,R,t,0,0.1,t,%0AB,-1.12,0.97,AB%7CBCE,R,f,0,0.1,f,%0AC,1.6,1.19,DC%7CBCE,R,f,0,0.1,f,%0AD,1.52,' +
          '-0.91,DC,R,t,0,0.1,f,%0AE,0,3.15,EF%7CBCE,R,f,0,0.1,f,%0AF,4.02,4.87,EF%7CGF,R,f,0,0.1,f,%0AG,4.98,2.61,GF,R,t,0,' +
          '0.1,f,%0A&l=AB,1,1,-1.2650000000000001,0.61,A%7CB,,l,-1.12,0.25,-1.41,0.25,-1.41,0.97,-1.12,0.97%0ADC,1,1,1.56,' +
          '0.13999999999999993,C%7CD,,l,1.52,1.19,1.6,1.19,1.6,-0.91,1.52,-0.91%0AEF,1,1,2.01,4.01,E%7CF,,l,4.02,3.15,0,3.15,' +
          '0,4.87,4.02,4.87%0ABCE,1,1,0.1367500000000002,2.3575,B%7CC%7CE,,et,1.961,1.019,-1.449,0.743,-1.688,3.696,1.723,3.972%0AGF,1,' +
          '1,4.5,3.7399999999999998,F%7CG,,l,4.98,4.87,4.02,4.87,4.02,2.61,4.98,2.61%0A&f=&pp=&tp=&s=10,false,false,cm';
        break;
      case 'Slider_Crank':
        content = 'j=A,-1.76,-1.99,AB,R,t,0,0.1,t,%0AB,0.52,1.95,AB%7CCB,R,f,0,0.1,f,%0AC,2.54,0.15,CB,P,t,0,' +
          '0.1,f,%0A&l=AB,1,1,-0.4,1.13,A%7CB,,l,0.52,-1.99,-1.76,-1.99,-1.76,1.95,0.52,1.95%0ACB,1,1,0.97,1.6400000000000001,B%7CC,,l,' +
          '0.52,0.15,2.54,0.15,2.54,1.95,0.52,1.95%0A&f=&pp=&tp=&s=10,false,false,cm';
        break;
      case 'Force':
        content = 'j=A,-1.24,-0.89,AB,R,t,0,0.1,t,%0AB,-0.1,2.01,AB%7CCB,R,f,0,0.1,f,%0AC,4.26,2.27,CB%7CDC,' +
          'R,f,0,0.1,f,%0AD,3.36,-1.01,DC,R,t,0,0.1,f,%0A&l=AB,1,1,-0.67,0.5599999999999998,A%7CB,,l,-0.1,-0.89,-1.24,-0.89,-1.24,2.01,' +
          '-0.1,' + '2.01%0ACB,1,1,2.08,2.1399999999999997,B%7CC,F1,l,-0.1,2.27,4.26,2.27,4.26,2.01,-0.1,2.01%0ADC,1,1,3.81,' +
          '0.63,C%7CD,,l,4.26,' + '-1.01,' +
          '3.36,-1.01,3.36,2.27,4.26,2.27%0A&f=F1,CB,1.8,2.123,4.38,4.13,t,true,1,1%0A';
        break;
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;
    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }

  getJoints() {
    // return GridComponent.joints;
  }

  getLinks() {
    // return GridComponent.links;
  }

  getForces() {
    // return GridComponent.forces;
  }

  getLinkProp(link: Link, propType: string) {
    // if (l instanceof ImagLink) {
    //   return
    // }
    if (!(link instanceof RealLink)) {return}
    let top: number;
    let bot: number;
    let left: number;
    let right: number;
    let center_cord: number;
    // const link = l as RealLink;
    switch (propType) {
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
      // translate not used, can delete
      case 'translate':
        left = link.bound.b1.x;
        bot = link.bound.b1.y;
        // TODO: Figure out way to simplify this later
        if (link.bound.b2.x < left) {
          left = link.bound.b2.x;
        }
        if (link.bound.b3.x < left) {
          left = link.bound.b3.x;
        }
        if (link.bound.b4.x < left) {
          left = link.bound.b4.x;
        }
        if (link.bound.b2.y < bot) {
          bot = link.bound.b2.y;
        }
        if (link.bound.b3.y < bot) {
          bot = link.bound.b3.y;
        }
        if (link.bound.b4.y < bot) {
          bot = link.bound.b4.y;
        }
        center_cord = (GridComponent.scaleFactor * left) + GridComponent.gridOffset.x;
        return 'translate(' + (GridComponent.gridOffset.x - center_cord) + ' ' + (GridComponent.gridOffset.y - center_cord) +  ')';
      case 'scale':
        return 'scale(' + GridComponent.scaleFactor + ')'
      case 'transform':
        left = link.bound.b1.x;
        bot = link.bound.b1.y;
        // TODO: Figure out way to simplify this later
        if (link.bound.b2.x < left) {
          left = link.bound.b2.x;
        }
        if (link.bound.b3.x < left) {
          left = link.bound.b3.x;
        }
        if (link.bound.b4.x < left) {
          left = link.bound.b4.x;
        }
        if (link.bound.b2.y < bot) {
          bot = link.bound.b2.y;
        }
        if (link.bound.b3.y < bot) {
          bot = link.bound.b3.y;
        }
        if (link.bound.b4.y < bot) {
          bot = link.bound.b4.y;
        }
        center_cord = (GridComponent.scaleFactor * left) + GridComponent.gridOffset.x;


        top = link.bound.b1.y;
        if (Math.abs(link.bound.b2.y - top) < 0.001) {
          bot = link.bound.b4.y;
        } else {
          bot = link.bound.b2.y;
        }
        const link_height =  (Math.abs(top - bot) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5);
        left = link.bound.b1.x;
        if (Math.abs(link.bound.b2.x - left) < 0.001) {
          right = link.bound.b4.x;
        } else {
          right = link.bound.b2.x;
        }
        const link_width = (Math.abs(right - left) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5);
        // TODO: Need scale factor?? Or does this need to be 1 / AppConstants.scaleFactor?
        // TODO: Make sure that the conversion for screen grid matches
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * -50;
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * -50;
        const link_center_x = ((left + right) / 2) * (-1 * GridComponent.scaleFactor);
        const link_center_y = ((top + bot) / 2) * (-1 * GridComponent.scaleFactor);
        // const link_center_x = 0;
        // const link_center_y = 0;
        // const grid_center_x =
        // const dist_from_center_x = link_center_x - ((1 / AppConstants.scaleFactor) * -1 * this.gridOffset.x);
        // const dist_from_center_y = link_center_y - ((1 / AppConstants.scaleFactor) * this.gridOffset.y);
        // const link_center_x = 0;
        // const link_center_y = 0;

        // const box = GridComponent.canvasSVGElement.getBoundingClientRect();
        // const grid_width = box.width;
        // const grid_height = box.height;
        // const grid_center_x = 528 - GridComponent._gridOffset.x;
        // const grid_center_y = 470.5 - GridComponent._gridOffset.y;
        // const grid_center_x = (528 - GridComponent._gridOffset.x) * AppConstants.scaleFactor;
        // const grid_center_y = (470.5 - GridComponent._gridOffset.y) * AppConstants.scaleFactor;
        // const x_dist = (grid_center_x - (link_width / 2)) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - (link_height / 2)) * AppConstants.scaleFactor;
        // const x_dist = (grid_center_x - link_width) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - link_height) * AppConstants.scaleFactor;
        // const x_dist = ((link_center_x - grid_center_x)) + (link_width / 2);
        // const y_dist = ((link_center_y - grid_center_y)) + (link_height / 2);
        // const x_dist = (grid_center_x - link_center_x) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - link_center_y) * AppConstants.scaleFactor;
        // TODO: Each screen width and height are different. Be sure to pull screens dimensions
        // const x_dist = link_center_x + dist_from_center_x + (link_width / 2);
        // const y_dist = link_center_y + dist_from_center_y + (link_height / 2);
        const x_dist = link_center_x + (link_width / 2) + 25;
        const y_dist = link_center_y + (link_height / 2) + 30;
        // // const x_dist = 0;
        // const y_dist = 0;
        // TODO: Be sure to account for the force that is added on the link as well

        return 'translate(' + (x_dist) + ' ' + (y_dist) +  '), scale(' + GridComponent.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord) + ' ' + (this.gridOffset.y - center_cord) +  '), scale(' + this.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord + 60) + ' ' + (this.gridOffset.y - center_cord + 45) +  '), scale(' + this.scaleFactor + ')'
      case 'height':
        top = link.bound.b1.y;
        if (Math.abs(link.bound.b2.y - top) < 0.1) {
          bot = link.bound.b4.y;
        } else {
          bot = link.bound.b2.y;
        }
        return (Math.abs(top - bot) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5) + 60;
      case 'width':
        left = link.bound.b1.x;
        if (Math.abs(link.bound.b2.x - left) < 0.001) {
          right = link.bound.b4.x;
        } else {
          right = link.bound.b2.x;
        }
        return (Math.abs(right - left) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5) + 50;
      default:
        return '?';
    }
  }

  getJointProp(joint: any, propType: string) {
    // TODO: Make sure joint is of type Joint and not any
    if (joint === undefined) {
      return 0;
    }
    switch (propType) {
      case 'ring':
        if (!(joint instanceof RealJoint)) {return}
        return joint.r;
      case 'r':
        if (!(joint instanceof RealJoint)) {return}
        return joint.r * 7 / 5;
      default:
        return;
    }
  }

  getForceLine(joint: Joint, dir: string, xOrY: string) {
    switch (dir) {
      case 'pos':
        if (xOrY === 'x') {
          return Force.createForceLine(joint, new Coord(joint.x + 0.7, joint.y));
        } else {
          return Force.createForceLine(joint, new Coord(joint.x, joint.y + 0.7));
        }
      case 'neg':
        if (xOrY === 'x') {
          return Force.createForceLine(joint, new Coord(joint.x - 0.7, joint.y));
        } else {
          return Force.createForceLine(joint, new Coord(joint.x, joint.y - 0.7));
        }
      default:
        return
    }
  }
}
