import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Pose } from '../../model/pose';
import { Coord } from '../../model/coord';
import { Joint, RealJoint, RevJoint } from '../../model/joint';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { Mechanism } from '../../model/mechanism/mechanism';
import { Link, RealLink } from '../../model/link';

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
})
export class SynthesisPanelComponent implements OnInit {
    constructor(private fb: FormBuilder,
    public mechanismSrv: MechanismService) {
        
    }

    

  ngOnInit() {
    //Set initial values
    //(The default values are based on the image Pradeep provided but they can be easily changed below)
    this.synthesisForm.setValue({
      //a0x: '6',
      //a0y: '0',
      //b0x: '8.1213',
      //b0y: '-2.1213',
      //a1x: '8',
      //a1y: '-4',
      //b1x: '8',
      //b1y: '-7',
      //a2x: '1',
      //a2y: '2',
      //b2x: '4',
      //b2y: '2',

        //a0x: '-7.96',
        //a0y: '-1.34',
        //b0x: '-4.42',
        //b0y: '2.2',
        //a1x: '-0.37',
        //a1y: '4.06',
        //b1x: '4.63',
        //b1y: '4.06',
        //a2x: '7.68',
        //a2y: '2.30',
        //b2x: '11.22',
        //b2y: '-1.23',

        a0x: '0',
        a0y: '0',
        b0x: '12.5',
        b0y: '0',
        a1x: '20',
        a1y: '10',
        b1x: '28.8388',
        b1y: '18.8388',
        a2x: '20',
        a2y: '30',
        b2x: '26.25',
        b2y: '40.8253',

        quality: '0.05',

        position1Match: ' ',
        position2Match: ' ',
        position3Match: ' ',


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
      quality: [''],
      position1Match: [''],
      position2Match: [''],
      position3Match: [''],
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

        var qualityfromUser = Number(this.synthesisForm.value.quality);

        //   NewGridComponent.sendNotification(qualityfromUser + ';');

        //find first itnersection point 

        var firstPoint = this.findIntersectionPoint(pose1_coord1, pose2_coord1, pose3_coord1);
        var secondPoint = pose1_coord1;
        var thirdPoint = pose1_coord2;
        var fourthPoint = this.findIntersectionPoint2(pose1_coord2, pose2_coord2, pose3_coord2)

        //now create joints, links, etc. from the above four coordinates

        var joint1 = new RevJoint("a", firstPoint.x, firstPoint.y, true, true);
        var joint2 = new RevJoint("b", secondPoint.x, secondPoint.y, false, false);
        var joint3 = new RevJoint("c", thirdPoint.x, thirdPoint.y, false, false);
        var joint4 = new RevJoint("d", fourthPoint.x, fourthPoint.y, false, true);

        joint1.connectedJoints.push(joint2);
        joint2.connectedJoints.push(joint1, joint3);
        joint3.connectedJoints.push(joint2, joint4);
        joint4.connectedJoints.push(joint3);



        var link1 = new RealLink("ab", [joint1, joint2]);
        var link2 = new RealLink("bc", [joint2, joint3]);
        var link3 = new RealLink("cd", [joint3, joint4]);

        joint1.links.push(link1);
        joint2.links.push(link1, link2);
        joint3.links.push(link2, link3);
        joint4.links.push(link3);

        this.mechanismSrv.joints.splice(0);
        this.mechanismSrv.links.splice(0);

        this.mechanismSrv.mergeToJoints([joint1, joint2, joint3, joint4]);
        this.mechanismSrv.mergeToLinks([link1, link2, link3]);
        this.mechanismSrv.updateMechanism();

        var posCoords = [pose1_coord1, pose1_coord2, pose2_coord1, pose2_coord2, pose3_coord1, pose3_coord2];

        var quality = this.compareTheQualityofSynthesis(this.mechanismSrv.mechanisms[0].joints, posCoords, qualityfromUser);

        //  var trialCoord = new Coord(this.mechanismSrv.mechanisms[0].joints[0][0].x, this.mechanismSrv.mechanisms[0].joints[0][0].y);

        // NewGridComponent.sendNotification(firstPoint.x + ',' + firstPoint.y + ',' + fourthPoint.x + ',' + fourthPoint.y);

        //  NewGridComponent.sendNotification(trialCoord.x+','+trialCoord.y);

        //  NewGridComponent.sendNotification(quality[0]+';');

        //now check if there is 999 in the quality. Count 999 and say which position matches

        var whichPositionMatches = this.checkQuality(quality);

        //  NewGridComponent.sendNotification('Position Matches:'+ whichPositionMatches[0] + ',' + whichPositionMatches[1] + ','+whichPositionMatches[2]);

       
    }

    checkQuality(quality: number[]) {

        let positionMatches: string[]=['Position 1','Position 2','Position 3'];
        if (quality[0] >= 0.09 || quality[1] >= 0.09) { positionMatches[0] = "No Match"; }
        if (quality[3] >= 0.09 || quality[4] >= 0.09) { positionMatches[1] = "No Match"; }
        if (quality[6] >= 0.09 || quality[7] >= 0.09) { positionMatches[2] = "No Match"; }

        return positionMatches;

    }

    compareTheQualityofSynthesis(jointValues:Joint[][],posCoords:Coord[],qualityOfSyn:number) {
        //get position analysis data 
        //joint B, Joint C, 
        //compare that with poses 

        let quality1_b: number=999;
        let quality2_b: number=999;
        let quality3_b: number=999;

        let quality1_c: number=999;
        let quality2_c: number=999;
        let quality3_c: number=999;

        let pos1TimeStep: number=999;
        let pos2TimeStep: number=999;
        let pos3TimeStep: number=999;


        //compare Joint B with pose 1, pose2, and pose3;

        let index: number = 1;

        for (var val in jointValues) {
            var pos1Value_b = Math.sqrt(Math.pow(jointValues[val][1].x - posCoords[0].x, 2) + Math.pow(jointValues[val][1].y - posCoords[0].y, 2));
            var pos2Value_b = Math.sqrt(Math.pow(jointValues[val][1].x - posCoords[2].x, 2) + Math.pow(jointValues[val][1].y - posCoords[2].y, 2));
            var pos3Value_b = Math.sqrt(Math.pow(jointValues[val][1].x - posCoords[4].x, 2) + Math.pow(jointValues[val][1].y - posCoords[4].y, 2));

         //  NewGridComponent.sendNotification('JointCoord;' + jointValues[val][1].x + ';');
          //  NewGridComponent.sendNotification('PosCoord;' + posCoords[0].x + ';');
         //   NewGridComponent.sendNotification('val:' + val);

            var pos1Value_c = Math.sqrt(Math.pow(jointValues[val][2].x - posCoords[1].x, 2) + Math.pow(jointValues[val][2].y - posCoords[1].y, 2));
            var pos2Value_c = Math.sqrt(Math.pow(jointValues[val][2].x - posCoords[3].x, 2) + Math.pow(jointValues[val][2].y - posCoords[3].y, 2));
            var pos3Value_c = Math.sqrt(Math.pow(jointValues[val][2].x - posCoords[5].x, 2) + Math.pow(jointValues[val][2].y - posCoords[5].y, 2));

            //need to compare if less than 0.09 
            //need to store in quality
            //need to check if exact match
            //need to extract time step. 

            if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn && index == 1) {
                quality1_b = pos1Value_b;
                quality1_c = pos1Value_c;
                pos1TimeStep = index;
            }

            else if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn && index > 1) {
                quality1_b = pos1Value_b;
                quality1_c = pos1Value_c;
                pos1TimeStep = index;

            }

            else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn && index == 1) {
                quality2_b = pos2Value_b;
                quality2_c = pos2Value_c;
                pos2TimeStep = index;
            }

            else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn && index > 1) {
                quality2_b = pos2Value_b;
                quality2_c = pos2Value_c;
                pos2TimeStep = index;
            }


            else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn && index == 1) {
                quality3_b = pos3Value_b;
                quality3_c = pos3Value_c;
                pos3TimeStep = index;
            }

            else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn && index > 1) {
                quality3_b = pos3Value_b;
                quality3_c = pos3Value_c;
                pos3TimeStep = index;
            }
            else {
                //if there is no match, then use the prev index and then with the current and prev, find the midpoint and then evaluate the same

                if (index > 1) {
                    var jointB_x = (jointValues[val][1].x + jointValues[index - 2][1].x) / 2;
                    var jointB_y = (jointValues[val][1].y + jointValues[index - 2][1].y) / 2;
                    var jointC_x = (jointValues[val][2].x + jointValues[index - 2][2].x) / 2;
                    var jointC_y = (jointValues[val][2].y + jointValues[index - 2][2].y) / 2;

                //    NewGridComponent.sendNotification("Midpoint;" + val+';'+index);

                    var pos1Value_b = Math.sqrt(Math.pow(jointB_x - posCoords[0].x, 2) + Math.pow(jointB_y - posCoords[0].y, 2));
                    var pos2Value_b = Math.sqrt(Math.pow(jointB_x - posCoords[2].x, 2) + Math.pow(jointB_y - posCoords[2].y, 2));
                    var pos3Value_b = Math.sqrt(Math.pow(jointB_x - posCoords[4].x, 2) + Math.pow(jointB_y - posCoords[4].y, 2));

                    //  NewGridComponent.sendNotification('JointCoord;' + jointValues[val][1].x + ';');
                    //  NewGridComponent.sendNotification('PosCoord;' + posCoords[0].x + ';');
                    //   NewGridComponent.sendNotification('val:' + val);

                    var pos1Value_c = Math.sqrt(Math.pow(jointC_x - posCoords[1].x, 2) + Math.pow(jointC_y - posCoords[1].y, 2));
                    var pos2Value_c = Math.sqrt(Math.pow(jointC_x - posCoords[3].x, 2) + Math.pow(jointC_y - posCoords[3].y, 2));
                    var pos3Value_c = Math.sqrt(Math.pow(jointC_x - posCoords[5].x, 2) + Math.pow(jointC_y - posCoords[5].y, 2));

                    if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn ) {
                        quality1_b = pos1Value_b;
                        quality1_c = pos1Value_c;
                        pos1TimeStep = index-0.5;

                    }

                    else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn ) {
                        quality2_b = pos2Value_b;
                        quality2_c = pos2Value_c;
                        pos2TimeStep = index-0.5;
                    }

                    else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn) {
                        quality3_b = pos3Value_b;
                        quality3_c = pos3Value_c;
                        pos3TimeStep = index-0.5;
                    }



                }



            }

                
            index = index + 1;

          //  NewGridComponent.sendNotification('index:' + index);
        }
    //    NewGridComponent.sendNotification('quality3c:' + quality3_c);

        //now compile quality array and then pass it back

        let qualityCompilation: number[];

        qualityCompilation = [quality1_b, quality1_c, pos1TimeStep, quality2_b, quality2_c, pos2TimeStep, quality3_b, quality3_c, pos3TimeStep];

       // NewGridComponent.sendNotification(";" + qualityCompilation);

        return qualityCompilation;
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
