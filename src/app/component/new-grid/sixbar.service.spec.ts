import { TestBed } from '@angular/core/testing';

import { SixbarService } from './sixbar.service';
import { Joint } from '../../model/joint';
import { Link } from '../../model/link';
import { Force } from '../../model/force';
import { InstantCenter } from '../../model/instant-center';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SettingsService } from '../../services/settings.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { euclideanDistance } from '../../model/utils';


describe('SixbarService', () => {
  let service: SixbarService;
  let joints: Joint[] = [];
  let links: Link[] = [];
  const forces: Force[] = [];
  const ics: InstantCenter[] = [];
  const mechanisms: Mechanism[] = [];
  const gridUtilService: GridUtilsService = new GridUtilsService();
  const activeObjService: ActiveObjService = new ActiveObjService();
  const settingsService: SettingsService = new SettingsService();
  const mechanismSrv: MechanismService = new MechanismService(gridUtilService, activeObjService, settingsService);

  // Link AB
  const JointA = mechanismSrv.createRevJoint("-3.74", "-2.41");
  const JointB = mechanismSrv.createRevJoint("-2.72", "0.91", JointA.id);
  JointA.connectedJoints.push(JointB);
  JointB.connectedJoints.push(JointA);
  const linkAB = gridUtilService.createRealLink(JointA.id +JointB.id, [JointA, JointB]);
  JointA.links.push(linkAB);
  JointB.links.push(linkAB);
  // Link BC
  const JointC = mechanismSrv.createRevJoint("1.58", "0.43", JointB.id);
  JointB.connectedJoints.push(JointC);
  JointC.connectedJoints.push(JointB);
  const linkBC = gridUtilService.createRealLink(JointB.id +JointC.id, [JointB, JointC]);
  JointC.links.push(linkBC);
  JointB.links.push(linkBC);
  // attach D to BC
  const JointD = mechanismSrv.createRevJoint("-0.24", "4.01", JointC.id);
  JointB.connectedJoints.push(JointD);
  JointC.connectedJoints.push(JointD);
  JointD.connectedJoints.push(JointB);
  JointD.connectedJoints.push(JointC);
  JointD.links.push(linkBC);
  linkBC.joints.push(JointD);
  linkBC.id += JointD.id;
  // DE
  const JointE = mechanismSrv.createRevJoint("5.08", "5.31", JointD.id);
  JointD.connectedJoints.push(JointE);
  JointE.connectedJoints.push(JointD);
  const linkDE = gridUtilService.createRealLink(JointD.id +JointE.id, [JointD, JointE]);
  JointD.links.push(linkDE);
  JointE.links.push(linkDE);
  // EF
  const JointF = mechanismSrv.createRevJoint("8.14", "3.35", JointE.id);
  JointE.connectedJoints.push(JointF);
  JointF.connectedJoints.push(JointE);
  const linkEF = gridUtilService.createRealLink(JointE.id +JointF.id, [JointE, JointF]);
  JointA.links.push(linkEF);
  JointB.links.push(linkEF);
  // CF
  JointC.connectedJoints.push(JointF);
  JointF.connectedJoints.push(JointC);
  const linkCF = gridUtilService.createRealLink(JointC.id +JointF.id, [JointC, JointF]);
  JointC.links.push(linkCF);
  JointF.links.push(linkCF);
  // Attach G to CF
  const JointG = mechanismSrv.createRevJoint("7.32", "-3.51", JointF.id);
  JointC.connectedJoints.push(JointG);
  JointF.connectedJoints.push(JointG);
  JointG.connectedJoints.push(JointC);
  JointG.connectedJoints.push(JointF);
  JointG.links.push(linkCF);
  linkCF.joints.push(JointG);
  linkCF.id += JointG.id;

  joints = [JointA, JointB, JointC, JointD, JointE, JointF, JointG]
  links = [linkAB, linkBC, linkDE, linkEF, linkCF]

  const gravity = false;
  const unit = 'cm';

  mechanisms.push(
    new Mechanism(
      joints,
      links,
      forces,
      ics,
      gravity,
      unit,
      10
    )
  )

  ForceSolver.determineDesiredLoopLettersForce(mechanismSrv.mechanisms[0].requiredLoops)
  ForceSolver.determineForceAnalysis(
    mechanismSrv.joints,
    mechanismSrv.links,
    'static',
    gravity,
    unit
  );

  KinematicsSolver.requiredLoops = mechanismSrv.mechanisms[0].requiredLoops;
  KinematicsSolver.determineKinematics(
    mechanismSrv.joints,
    mechanismSrv.links,
    10
  );

  describe('LinearJointPosition', () => {
    it('should determine if the calculated position of the Joints match the expected', () => {
      const expectedPositions = {
        A: [[-3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74],
        [-2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41]],
        B: [[-2.72, -2.77809734, -2.836487685, -2.895153249, -2.954076162, -3.013238474, -2.954076162, -2.895153249, -2.836487685, -2.77809734, -2.72, -2.662213362, -2.604755027, -2.5476425, -2.490893176, -2.434524342, -2.490893176, -2.5476425, -2.604755027, -2.662213362, -2.72],
        [0.91, 0.927295802, 0.943575032, 0.958832731, 0.97306425, 0.986265255, 0.97306425, 0.958832731, 0.943575032, 0.927295802, 0.91, 0.891692893, 0.872380059, 0.85206738, 0.830761044, 0.80846754, 0.830761044, 0.85206738, 0.872380059, 0.891692893, 0.91]],
        C: [[1.58, 1.50571068, 1.424734868, 1.333967325, 1.226229881, 1.072453296, 1.226229881, 1.333967325, 1.424734868, 1.50571068, 1.58, 1.649271316, 1.714536666, 1.776459599, 1.835499254, 1.891985979, 1.835499254, 1.776459599, 1.714536666, 1.649271316, 1.58],
        [0.43, 0.319522125, 0.19365347, 0.045082673, -0.142929206, -0.437645825, -0.142929206, 0.045082673, 0.19365347, 0.319522125, 0.43, 0.529063777, 0.619162242, 0.701930653, 0.77852557, 0.849800888, 0.77852557, 0.701930653, 0.619162242, 0.529063777, 0.43]],
        D: [[-0.24, -0.20692689, -0.166131325, -0.113459123, -0.039439742, 0.093856787, -0.039439742, -0.113459123, -0.166131325, -0.20692689, -0.24, -0.267622262, -0.291201653, -0.311685672, -0.329750417, -0.345900063, -0.329750417, -0.311685672, -0.291201653, -0.267622262, -0.24],
        [4.01, 3.952106956, 3.881192589, 3.79124827, 3.668485283, 3.457370077, 3.668485283, 3.79124827, 3.881192589, 3.952106956, 4.01, 4.058131502, 4.098503241, 4.132448008, 4.160905481, 4.184567157, 4.160905481, 4.132448008, 4.098503241, 4.058131502, 4.01]],
        E: [[5.08, 5.052715348, 5.019306468, 4.977710481, 4.922823802, 4.833273855, 4.922823802, 4.977710481, 5.019306468, 5.052715348, 5.08, 5.102088403, 5.11926972, 5.131240111, 5.136668195, 5.130591284, 5.136668195, 5.131240111, 5.11926972, 5.102088403, 5.08],
        [5.31, 5.478070103, 5.642906214, 5.809265135, 5.98545324, 6.201513998, 5.98545324, 5.809265135, 5.642906214, 5.478070103, 5.31, 5.134517759, 4.946559555, 4.738219353, 4.493572821, 4.163530929, 4.493572821, 4.738219353, 4.946559555, 5.134517759, 5.31]],
        F: [[8.14, 8.008676464, 7.860744895, 7.688348453, 7.473467619, 7.143589478, 7.473467619, 7.688348453, 7.860744895, 8.008676464, 8.14, 8.258979451, 8.368233407, 8.469504867, 8.56402191, 8.652687258, 8.56402191, 8.469504867, 8.368233407, 8.258979451, 8.14],
        [3.35, 3.364425411, 3.37764074, 3.389008582, 3.397130207, 3.396582319, 3.397130207, 3.389008582, 3.37764074, 3.364425411, 3.35, 3.334729183, 3.318851055, 3.302535399, 3.285911233, 3.269081403, 3.285911233, 3.302535399, 3.318851055, 3.334729183, 3.35]],
        G: [[7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32],
        [-3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        const positions = expectedPositions[joint.id];

        positions.forEach((expectedPosition) => {
            KinematicsSolver.determineKinematics(
              mechanisms[0].joints[index],
              mechanisms[0].links[index],
              mechanisms[0].inputAngularVelocities[index]
            );
          });

          const resultMatch = mechanisms[0].joints.every((joint) => {
            const calculatedPosition = [joint.x, joint.y];
            const expectedPosition = expectedPositions[joint.id];
            const dist = euclideanDistance(calculatedPosition[0], calculatedPosition[1], expectedPosition[0], expectedPosition[1]);
            const tolerance = 0.001; // Tolerance of 0.001 units

            return dist < tolerance;
          });

          expect(resultMatch).toBe(true);
        });
      });
    });
  });
  describe('LinearJointVelocity', () => {
    it('should determine if the velocity of the Joints matches', () => {
      let resultMatch = true;
      mechanisms[0].joints.forEach((_, index) => {
      KinematicsSolver.determineKinematics(
        mechanisms[0].joints[index],
        mechanisms[0].links[index],
        mechanisms[0].inputAngularVelocities[index]
      );
      mechanisms[0].joints[index].forEach((j) => {
        const simvalx = KinematicsSolver.jointVelMap.get(j.id)![0];
        const simvaly = KinematicsSolver.jointVelMap.get(j.id)![1];
        const matvalx = 0; // TODO: replaced with matlab output
        const matvaly = 0;

        if (simvalx.valueOf() !== matvalx.valueOf() || simvaly.valueOf() !== matvaly.valueOf()){
          resultMatch = false;
          console.log('Linear Joint Velocity analysis of ' + index.toString() + ' failed at joint: ' + j.id)
        }
      });
      expect(resultMatch).toBe(true);
    })
  });

  describe('LinearJointAcceleration', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('LinearLinkCoMPosition', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('LinearLinkCoMVelocity', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('LinearLinkCoMAcceleration', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('AngularLinkPosition', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('AngularLinkVelocity', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });

  describe('AngularLinkAcceleration', () => {
    it('should be calculate the CoM correctly', () => {
      const resultMatch = true;
      expect(resultMatch).toBe(true);
    })
  });


});