import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Pose } from '../../model/pose';
import { Coord } from '../../model/coord';
import { Joint, RealJoint } from '../../model/joint';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { Mechanism } from '../../model/mechanism/mechanism';
import { Link } from '../../model/link';

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
})
export class SynthesisPanelComponent implements OnInit {
    constructor(private fb: FormBuilder) { }

    private static mechanismService: MechanismService

  ngOnInit() {
    //Set initial values
    //(The default values are based on the image Pradeep provided but they can be easily changed below)
    this.synthesisForm.setValue({
      a0x: '6',
      a0y: '0',
      b0x: '8.1213',
      b0y: '-2.1213',
      a1x: '8',
      a1y: '-4',
      b1x: '8',
      b1y: '-7',
      a2x: '1',
      a2y: '2',
      b2x: '4',
      b2y: '2',
    });
  }

  //Angular form stuff with 12 numbers, a0x, a0y, b0x, b0y, a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y
  synthesisForm = this.fb.group({
    a0x: [''],
    a0y: [''],
    b0x: [''],
    b0y: [''],
    a1x: [''],
    a1y: [''],
    b1x: [''],
    b1y: [''],
    a2x: [''],
    a2y: [''],
    b2x: [''],
    b2y: [''],
  });

  handleButton() {
    //Send notification to grid for now
    NewGridComponent.sendNotification(
      'Call your backend function with these values! A0: (' +
        this.synthesisForm.value.a0x! +
        ',' +
        this.synthesisForm.value.a0y! +
        ') B0: (' +
        this.synthesisForm.value.b0x! +
        ',' +
        this.synthesisForm.value.b0y! +
        ') A1: (' +
        this.synthesisForm.value.a1x! +
        ',' +
        this.synthesisForm.value.a1y! +
        ') B1: (' +
        this.synthesisForm.value.b1x! +
        ',' +
        this.synthesisForm.value.b1y! +
        ') A2: (' +
        this.synthesisForm.value.a2x! +
        ',' +
        this.synthesisForm.value.a2y! +
        ') B2: (' +
        this.synthesisForm.value.b2x! +
        ',' +
        this.synthesisForm.value.b2y! +
        ')'
    );
    //If you need the values as a number instead of a string, use this:
    console.log(Number(this.synthesisForm.value.a0x!));
    }


    synthesisFunction() {
        //call synthesis functions 

        //populate pose information 

        var pose1_coord1 = new Coord(Number(this.synthesisForm.value.a0x!), Number(this.synthesisForm.value.a0y!));
        var pose1_coord2 = new Coord(Number(this.synthesisForm.value.b0x!), Number(this.synthesisForm.value.b0y!));
        var pose2_coord1 = new Coord(Number(this.synthesisForm.value.a1x!), Number(this.synthesisForm.value.a1y!));
        var pose2_coord2 = new Coord(Number(this.synthesisForm.value.b1x!), Number(this.synthesisForm.value.b1y!));
        var pose3_coord1 = new Coord(Number(this.synthesisForm.value.a2x!), Number(this.synthesisForm.value.a2y!));
        var pose3_coord2 = new Coord(Number(this.synthesisForm.value.b2x!), Number(this.synthesisForm.value.b2y!));

        //find first itnersection point 

        var firstPoint = this.findIntersectionPoint(pose1_coord1, pose2_coord1, pose3_coord1);
        var secondPoint = pose1_coord1;
        var thirdPoint = pose1_coord2;
        var fourthPoint = this.findIntersectionPoint2(pose1_coord2, pose2_coord2, pose3_coord2)

        //now create joints, links, etc. from the above four coordinates

        var joint1 = new Joint("a", firstPoint.x, firstPoint.y);
        var joint2 = new Joint("b", secondPoint.x, secondPoint.y);
        var joint3 = new Joint("c", thirdPoint.x, thirdPoint.y);
        var joint4 = new Joint("d", fourthPoint.x, fourthPoint.y);

        var jointList = [joint1, joint2, joint3, joint4];
       // var realJoint1=new RealJoint("a",firstPoint.x,firstPoint.y,true,true)

        var link1 = new Link("ab", [joint1, joint2]);
        var link2 = new Link("bc", [joint2, joint3]);
        var link3 = new Link("cd", [joint3, joint4]);

        var linkList = [link1, link2, link3];


        NewGridComponent.sendNotification(firstPoint.x + ',' + firstPoint.y + ',' + fourthPoint.x + ',' + fourthPoint.y);

    }
    findIntersectionPoint(pose1_coord1: Coord, pose2_coord1: Coord, pose3_coord1: Coord) {

        //slope of Line 1
        var slope1 = 1 / ((pose2_coord1.y - pose1_coord1.y) / (pose2_coord1.x - pose1_coord1.x));
        //slope of line 2
        var slope2 = 1 / ((pose3_coord1.y - pose2_coord1.y) / (pose3_coord1.x - pose2_coord1.x));

        //midpoints of the above two lines
        var midpoint_line1 = new Coord(
            (pose1_coord1.x + pose2_coord1.x) / 2,
            (pose1_coord1.y + pose2_coord1.y) / 2
        );
        var midpoint_line2 = new Coord(
            (pose3_coord1.x + pose2_coord1.x) / 2,
            (pose3_coord1.y + pose2_coord1.y) / 2
        );

        //intercept
        var c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
        var c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

        //intersection point
        var x1 = (c1 - c2) / (-slope2 + slope1);
        var y1 = -slope1 * x1 + c1;

        return new Coord(x1, y1);
    }

    findIntersectionPoint2(pose1_coord2: Coord, pose2_coord2: Coord, pose3_coord2: Coord) {
        var slope1 = 1 / ((pose2_coord2.y - pose1_coord2.y) / (pose2_coord2.x - pose1_coord2.x));
        //slope of line 2
        var slope2 = 1 / ((pose3_coord2.y - pose2_coord2.y) / (pose3_coord2.x - pose2_coord2.x));

        //midpoints of the above two lines
        var midpoint_line1 = new Coord(
            (pose1_coord2.x + pose2_coord2.x) / 2,
            (pose1_coord2.y + pose2_coord2.y) / 2
        );
        var midpoint_line2 = new Coord(
            (pose3_coord2.x + pose2_coord2.x) / 2,
            (pose3_coord2.y + pose2_coord2.y) / 2
        );

        //intercept
        var c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
        var c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

        //intersection point
        var x1 = (c1 - c2) / (-slope2 + slope1);
        var y1 = -slope1 * x1 + c1;

        return new Coord(x1, y1);
    }
}
