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
        content = 'j=a,-0.7,0.07,ab,R,t,Null,t%0Ab,-2.16,1.21,ab%7Cbcd,R,f,Null,f%0Ac,1.32,0.49,bcd%7Ccfg,' +
          'R,f,Null,f%0Ad,-0.24,3.69,de%7Cbcd,R,f,Null,f%0Ae,5.08,5.31,de%7Cef,R,f,Null,f%0Af,5.82,1.65,ef%7Ccfg,' +
          'R,f,Null,f%0Ag,5.14,-2.63,cfg,R,t,Null,f%0A&l=ab,1,1,-1.4300000000000002,0.64,a%7Cb,,line,-2.16,0.07,' +
          '-2.16,1.21,-0.7,1.21,-0.7,0.07%0Abcd,1,1,-0.36000000000000004,1.7966666666666666,b%7Cc%7Cd,,eTriangle,' +
          '1.68,0.192,-2.853,1.033,-2.125,4.96,2.409,4.119%0Ade,1,1,2.42,4.5,d%7Ce,,line,5.08,3.69,5.08,5.31,' +
          '-0.24,5.31,-0.24,3.69%0Aef,1,1,5.45,3.4799999999999995,e%7Cf,,line,5.82,5.31,5.82,1.65,5.08,1.65,' +
          '5.08,5.31%0Acfg,1,1,4.093333333333334,-0.1633333333333334,c%7Cf%7Cg,,eTriangle,0.898,0.522,6.645,' +
          '2.135,8.042,-2.841,2.295,-4.454%0A&f=&s=10,false,false,cm';
        break;
      case 'Watt_II':
        content = 'j=a,-0.46,-1.79,ab,R,t,Null,t%0Ab,-0.76,-0.41,ab%7Cbc,R,f,Null,f%0Ac,1.14,-0.25,bc%7Ccdg,' +
          'R,f,Null,f%0Ad,3.34,-0.23,cdg%7Cde,R,f,Null,f%0Ae,5.62,-0.11,de%7Cef,R,f,Null,f%0Af,5.02,-2.31,ef,R,' +
          't,Null,f%0Ag,2.28,-2.57,cdg,R,t,Null,f%0A&l=ab,1,1,-0.61,-1.1,a%7Cb,,line,-0.76,-1.79,-0.76,-0.41,' +
          '-0.46,-0.41,-0.46,-1.79%0Abc,1,1,0.18999999999999995,-0.32999999999999996,b%7Cc,,line,1.14,-0.41,1.14,' +
          '-0.25,-0.76,-0.25,-0.76,-0.41%0Acdg,1,1,2.2533333333333334,-1.0166666666666666,c%7Cd%7Cg,,eTriangle,' +
          '0.532,-0.053,3.935,-0.022,3.962,-2.97,0.559,-3%0Ade,1,1,4.48,-0.17,d%7Ce,,line,5.62,-0.23,5.62,-0.11,' +
          '3.34,-0.11,3.34,-0.23%0Aef,1,1,5.32,-1.21,e%7Cf,,line,5.02,-0.11,5.02,-2.31,5.62,-2.31,5.62,' +
          '-0.11%0A&f=&s=10,false,false,cm';
        break;
      case 'Stephenson_I':
        content = 'j=a,-0.58,-0.27,abe,R,t,Null,t%0Ab,-0.74,0.61,abe%7Cbc,R,f,Null,f%0Ac,3.72,0.35,bc%7Ccdg,R,' +
          'f,Null,f%0Ad,4.9,-1.61,cdg,R,t,Null,f%0Ae,-2,1.53,ef%7Cabe,R,f,Null,f%0Af,3.3,3.19,ef%7Cgf,R,f,Null,' +
          'f%0Ag,6.52,0.93,gf%7Ccdg,R,f,Null,f%0A&l=abe,1,1,-1.1066666666666667,0.6233333333333334,a%7Cb%7Ce,,' +
          'eTriangle,-1.168,2.749,-0.181,-0.697,-3.166,-1.551,-4.152,1.895%0Abc,1,1,1.4900000000000002,0.48,b%7Cc,,' +
          'line,3.72,0.61,3.72,0.35,-0.74,0.35,-0.74,0.61%0Acdg,1,1,5.046666666666667,-0.11000000000000006,c%7Cd%7Cg,' +
          ',eTriangle,5.13,-2.506,2.822,0.842,5.721,2.841,8.03,-0.507%0Aef,1,1,0.6499999999999999,2.36,e%7Cf,,line,' +
          '3.3,1.53,3.3,3.19,-2,3.19,-2,1.53%0Agf,1,1,4.91,2.06,g%7Cf,,line,3.3,0.93,3.3,3.19,6.52,3.19,' +
          '6.52,0.93%0A&f=&s=10,false,false,cm';
        break;
      case 'Stephenson_II':
        break;
      case 'Stephenson_III':
        content = 'j=a,-1.41,0.25,ab,R,t,Null,t%0Ab,-1.12,0.97,ab%7Cbce,R,f,Null,' +
          'f%0Ac,1.6,1.19,bce%7Ccd,R,f,Null,f%0Ad,1.52,-0.91,cd,R,t,Null,f%0Ae,0,3.15,ef%7Cbce,R,f,Null,' +
          'f%0Af,4.02,4.87,ef%7Cfg,R,f,Null,f%0Ag,4.98,2.61,fg,R,t,Null,f%0A&l=ab,1,1,-1.2650000000000001,' +
          '0.61,a%7Cb,,line,-1.12,0.25,-1.12,0.97,-1.41,0.97,-1.41,0.25%0Abce,1,1,0.16,1.7700000000000002,b%7Cc%7Ce,' +
          ',eTriangle,1.958,0.952,-1.495,0.705,-1.709,3.696,1.744,3.942%0Acd,1,1,1.56,0.13999999999999996,c%7Cd,,' +
          'line,1.52,1.19,1.52,-0.91,1.6,-0.91,1.6,1.19%0Aef,1,1,2.01,4.01,e%7Cf,,line,4.02,3.15,4.02,4.87,0,4.87,' +
          '0,3.15%0Afg,1,1,4.5,3.74,f%7Cg,,line,4.98,4.87,4.98,2.61,4.02,2.61,4.02,4.87%0A&f=&s=10,false,false,cm';
        break;
      case 'Slider_Crank':
        content = 'j=a,-2.04,-1.33,ab,R,t,Null,t%0Ab,-1.26,0.51,ab%7Cbc,R,f,Null,f%0Ac,2,-0.29,bc%7Ccd,R,f,Null,' +
          'f%0Ad,2,-0.29,cd,P,t,0,f%0A&l=ab,R,1,1,-1.65,-0.41000000000000003,a%7Cb,,line,-1.26,-1.33,-1.26,0.51,' +
          '-2.04,0.51,-2.04,-1.33%0Abc,R,1,1,0.37,0.11000000000000001,b%7Cc,,line,2,0.51,2,-0.29,-1.26,-0.29,-1.26,' +
          '0.51%0Acd,P,Null,Null,Null,Null,c%7Cd,,Null,Null,Null,Null,Null,Null,Null,Null,Null%0A&f=&s=10,' +
          'false,false,cm';
        break;
      case 'Force':
        content = 'j=a,-1.24,-0.89,ab,R,t,Null,t%0Ab,-0.1,2.01,ab%7Cbc,R,f,Null,f%0Ac,4.26,2.27,bc%7Ccd,R,f,Null,' +
          'f%0Ad,3.36,-1.01,cd,R,t,Null,f%0A&l=ab,1,1,-0.67,0.5599999999999998,a%7Cb,,line,-0.1,-0.89,-0.1,2.01,' +
          '-1.24,2.01,-1.24,-0.89%0Abc,1,1,2.08,2.1399999999999997,b%7Cc,F01,line,4.26,2.01,4.26,2.27,-0.1,2.27,' +
          '-0.1,2.01%0Acd,1,1,3.8099999999999996,0.63,c%7Cd,,line,3.36,2.27,3.36,-1.01,4.26,-1.01,4.26,2.27%0A&f=F01,' +
          'bc,2.17,2.145,5.19,4.22,t,true,1%0A&s=10,false,false,cm';
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
