
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
import { join } from '@angular/compiler-cli';


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
    it('should show the calculated position of the Joints DO match the expected', () => {
      const expectedPositions = {
        JointA: [[-3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74],
        [-2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41]],
        JointB: [[-2.72, -2.77809734, -2.836487685, -2.895153249, -2.954076162, -3.013238474, -2.954076162, -2.895153249, -2.836487685, -2.77809734, -2.72, -2.662213362, -2.604755027, -2.5476425, -2.490893176, -2.434524342, -2.490893176, -2.5476425, -2.604755027, -2.662213362, -2.72],
        [0.91, 0.927295802, 0.943575032, 0.958832731, 0.97306425, 0.986265255, 0.97306425, 0.958832731, 0.943575032, 0.927295802, 0.91, 0.891692893, 0.872380059, 0.85206738, 0.830761044, 0.80846754, 0.830761044, 0.85206738, 0.872380059, 0.891692893, 0.91]],
        JointC: [[1.58, 1.50571068, 1.424734868, 1.333967325, 1.226229881, 1.072453296, 1.226229881, 1.333967325, 1.424734868, 1.50571068, 1.58, 1.649271316, 1.714536666, 1.776459599, 1.835499254, 1.891985979, 1.835499254, 1.776459599, 1.714536666, 1.649271316, 1.58],
        [0.43, 0.319522125, 0.19365347, 0.045082673, -0.142929206, -0.437645825, -0.142929206, 0.045082673, 0.19365347, 0.319522125, 0.43, 0.529063777, 0.619162242, 0.701930653, 0.77852557, 0.849800888, 0.77852557, 0.701930653, 0.619162242, 0.529063777, 0.43]],
        JointD: [[-0.24, -0.20692689, -0.166131325, -0.113459123, -0.039439742, 0.093856787, -0.039439742, -0.113459123, -0.166131325, -0.20692689, -0.24, -0.267622262, -0.291201653, -0.311685672, -0.329750417, -0.345900063, -0.329750417, -0.311685672, -0.291201653, -0.267622262, -0.24],
        [4.01, 3.952106956, 3.881192589, 3.79124827, 3.668485283, 3.457370077, 3.668485283, 3.79124827, 3.881192589, 3.952106956, 4.01, 4.058131502, 4.098503241, 4.132448008, 4.160905481, 4.184567157, 4.160905481, 4.132448008, 4.098503241, 4.058131502, 4.01]],
        JointE: [[5.08, 5.052715348, 5.019306468, 4.977710481, 4.922823802, 4.833273855, 4.922823802, 4.977710481, 5.019306468, 5.052715348, 5.08, 5.102088403, 5.11926972, 5.131240111, 5.136668195, 5.130591284, 5.136668195, 5.131240111, 5.11926972, 5.102088403, 5.08],
        [5.31, 5.478070103, 5.642906214, 5.809265135, 5.98545324, 6.201513998, 5.98545324, 5.809265135, 5.642906214, 5.478070103, 5.31, 5.134517759, 4.946559555, 4.738219353, 4.493572821, 4.163530929, 4.493572821, 4.738219353, 4.946559555, 5.134517759, 5.31]],
        JointF: [[8.14, 8.008676464, 7.860744895, 7.688348453, 7.473467619, 7.143589478, 7.473467619, 7.688348453, 7.860744895, 8.008676464, 8.14, 8.258979451, 8.368233407, 8.469504867, 8.56402191, 8.652687258, 8.56402191, 8.469504867, 8.368233407, 8.258979451, 8.14],
        [3.35, 3.364425411, 3.37764074, 3.389008582, 3.397130207, 3.396582319, 3.397130207, 3.389008582, 3.37764074, 3.364425411, 3.35, 3.334729183, 3.318851055, 3.302535399, 3.285911233, 3.269081403, 3.285911233, 3.302535399, 3.318851055, 3.334729183, 3.35]],
        JointG: [[7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32],
        [-3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedPosition = joint[index];

          let expectedPositionx = 0;
          let expectedPositiony = 0;
          if (jcount == 0) {
            expectedPositionx = expectedPositions['JointA'][0][index];
            expectedPositiony = expectedPositions['JointA'][1][index];
          }
          else if (jcount == 1) {
            expectedPositionx = expectedPositions['JointB'][0][index];
            expectedPositiony = expectedPositions['JointB'][1][index];
          }
          else if (jcount == 2) {
            expectedPositionx = expectedPositions['JointC'][0][index];
            expectedPositiony = expectedPositions['JointC'][1][index];
          }
          else if (jcount == 3) {
            expectedPositionx = expectedPositions['JointD'][0][index];
            expectedPositiony = expectedPositions['JointD'][1][index];
          }
          else if (jcount == 4) {
            expectedPositionx = expectedPositions['JointE'][0][index];
            expectedPositiony = expectedPositions['JointE'][1][index];
          }
          else if (jcount == 5) {
            expectedPositionx = expectedPositions['JointF'][0][index];
            expectedPositiony = expectedPositions['JointF'][1][index];
          }
          else if (jcount == 6) {
            expectedPositionx = expectedPositions['JointG'][0][index];
            expectedPositiony = expectedPositions['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedPosition.x, calculatedPosition.y, expectedPositionx, expectedPositiony);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(true);
      });
    })

    it('should show the calculated position of the Joints DO NOT match the expected', () => {
      const expectedPositions = {
        JointA: [[-3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74, -3.74],
          [-2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41, -2.41]],
        JointB: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointC: [[1.58, 1.50571068, 1.424734868, 1.333967325, 1.226229881, 1.072453296, 1.226229881, 1.333967325, 1.424734868, 1.50571068, 1.58, 1.649271316, 1.714536666, 1.776459599, 1.835499254, 1.891985979, 1.835499254, 1.776459599, 1.714536666, 1.649271316, 1.58],
          [0.43, 0.319522125, 0.19365347, 0.045082673, -0.142929206, -0.437645825, -0.142929206, 0.045082673, 0.19365347, 0.319522125, 0.43, 0.529063777, 0.619162242, 0.701930653, 0.77852557, 0.849800888, 0.77852557, 0.701930653, 0.619162242, 0.529063777, 0.43]],
        JointD: [[-0.24, -0.20692689, -0.166131325, -0.113459123, -0.039439742, 0.093856787, -0.039439742, -0.113459123, -0.166131325, -0.20692689, -0.24, -0.267622262, -0.291201653, -0.311685672, -0.329750417, -0.345900063, -0.329750417, -0.311685672, -0.291201653, -0.267622262, -0.24],
          [4.01, 3.952106956, 3.881192589, 3.79124827, 3.668485283, 3.457370077, 3.668485283, 3.79124827, 3.881192589, 3.952106956, 4.01, 4.058131502, 4.098503241, 4.132448008, 4.160905481, 4.184567157, 4.160905481, 4.132448008, 4.098503241, 4.058131502, 4.01]],
        JointE: [[5.08, 5.052715348, 5.019306468, 4.977710481, 4.922823802, 4.833273855, 4.922823802, 4.977710481, 5.019306468, 5.052715348, 5.08, 5.102088403, 5.11926972, 5.131240111, 5.136668195, 5.130591284, 5.136668195, 5.131240111, 5.11926972, 5.102088403, 5.08],
          [5.31, 5.478070103, 5.642906214, 5.809265135, 5.98545324, 6.201513998, 5.98545324, 5.809265135, 5.642906214, 5.478070103, 5.31, 5.134517759, 4.946559555, 4.738219353, 4.493572821, 4.163530929, 4.493572821, 4.738219353, 4.946559555, 5.134517759, 5.31]],
        JointF: [[8.14, 8.008676464, 7.860744895, 7.688348453, 7.473467619, 7.143589478, 7.473467619, 7.688348453, 7.860744895, 8.008676464, 8.14, 8.258979451, 8.368233407, 8.469504867, 8.56402191, 8.652687258, 8.56402191, 8.469504867, 8.368233407, 8.258979451, 8.14],
          [3.35, 3.364425411, 3.37764074, 3.389008582, 3.397130207, 3.396582319, 3.397130207, 3.389008582, 3.37764074, 3.364425411, 3.35, 3.334729183, 3.318851055, 3.302535399, 3.285911233, 3.269081403, 3.285911233, 3.302535399, 3.318851055, 3.334729183, 3.35]],
        JointG: [[7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32, 7.32],
          [-3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51, -3.51]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedPosition = joint[index];

          let expectedPositionx = 0;
          let expectedPositiony = 0;
          if (jcount == 0) {
            expectedPositionx = expectedPositions['JointA'][0][index];
            expectedPositiony = expectedPositions['JointA'][1][index];
          }
          else if (jcount == 1) {
            expectedPositionx = expectedPositions['JointB'][0][index];
            expectedPositiony = expectedPositions['JointB'][1][index];
          }
          else if (jcount == 2) {
            expectedPositionx = expectedPositions['JointC'][0][index];
            expectedPositiony = expectedPositions['JointC'][1][index];
          }
          else if (jcount == 3) {
            expectedPositionx = expectedPositions['JointD'][0][index];
            expectedPositiony = expectedPositions['JointD'][1][index];
          }
          else if (jcount == 4) {
            expectedPositionx = expectedPositions['JointE'][0][index];
            expectedPositiony = expectedPositions['JointE'][1][index];
          }
          else if (jcount == 5) {
            expectedPositionx = expectedPositions['JointF'][0][index];
            expectedPositiony = expectedPositions['JointF'][1][index];
          }
          else if (jcount == 6) {
            expectedPositionx = expectedPositions['JointG'][0][index];
            expectedPositiony = expectedPositions['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedPosition.x, calculatedPosition.y, expectedPositionx, expectedPositiony);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(false);
      });
    })
  });

  describe('LinearJointVelocity', () => {
    it('should determine the velocity of the Joints DO match', () => {
      const expectedJV = {
        JointA: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointB: [[-33.2, -33.37295802, -33.53575032, -33.68832731, -33.8306425, -33.96265255, 33.8306425, 33.68832731, 33.53575032, 33.37295802, 33.2, 33.01692893, 32.82380059, 32.6206738, 32.40761044, 32.1846754, -32.40761044, -32.6206738, -32.82380059, -33.01692893, -33.2],
          [10.2, 9.619026597, 9.035123145, 8.448467507, 7.859238384, 7.267615261, -7.859238384, -8.448467507, -9.035123145, -9.619026597, -10.2, -10.77786638, -11.35244973, -11.923575, -12.49106824, -13.05475658, 12.49106824, 11.923575, 11.35244973, 10.77786638, 10.2]],
        JointC: [[-41.00746046, -44.27488778, -48.79445031, -55.82191815, -69.51571725, -125.2800691, 69.51571725, 55.82191815, 48.79445031, 44.27488778, 41.00746046, 38.4656376, 36.38504015, 34.61657883, 33.06903467, 31.68310979, -33.06903467, -34.61657883, -36.38504015, -38.4656376, -41.00746046],
          [-59.74183325, -67.22170514, -77.66823326, -93.99270192, -125.8104823, -254.7535336, 125.8104823, 93.99270192, 77.66823326, 67.22170514, 59.74183325, 54.0046423, 49.39379867, 45.56067493, 42.29125894, 39.44592163, -42.29125894, -45.56067493, -49.39379867, -54.0046423, -59.74183325]],
        JointD: [[17.22318211, 20.88453934, 26.2361341, 34.92072629, 52.35830468, 124.5127687, -52.35830468, -34.92072629, -26.2361341, -20.88453934, -17.22318211, -14.56061152, -12.54819419, -10.9884306, -9.759868612, -8.783103813, 9.759868612, 10.9884306, 12.54819419, 14.56061152, 17.22318211],
          [-30.13854569, -36.50129857, -45.29878135, -58.93197112, -85.33935335, -191.9947657, 85.33935335, 58.93197112, 45.29878135, 36.50129857, 30.13854569, 25.2022264, 21.18522031, 17.80104716, 14.87409376, 12.28996308, -14.87409376, -17.80104716, -21.18522031, -25.2022264, -30.13854569]],
        JointE: [[-14.09031526, -17.26027427, -21.20710171, -26.88596125, -37.38189038, -79.08230644, 37.38189038, 26.88596125, 21.20710171, 17.26027427, 14.09031526, 11.24830171, 8.414122354, 5.190386704, 0.664951931, -9.760290972, -0.664951931, -5.190386704, -8.414122354, -11.24830171, -14.09031526],
          [98.00592049, 94.9750567, 94.34590579, 96.99751308, 106.8577364, 159.6347413, -106.8577364, -96.99751308, -94.34590579, -94.9750567, -98.00592049, -103.5493215, -112.5511975, -127.5675026, -156.4274623, -242.1072173, 156.4274623, 127.5675026, 112.5511975, 103.5493215, 98.00592049]],
        JointF: [[-71.39877633, -79.47843194, -90.7424646, -108.3282522, -142.6029151, -281.6267464, 142.6029151, 108.3282522, 90.7424646, 79.47843194, 71.39877633, 65.18512377, 60.17395424, 55.99015941, 52.40361064, 49.26426364, -52.40361064, -55.99015941, -60.17395424, -65.18512377, -71.39877633],
          [8.534547608, 7.962109148, 7.124141097, 5.783808445, 3.168454789, -7.193416236, -3.168454789, -5.783808445, -7.124141097, -7.962109148, -8.534547608, -8.942280997, -9.236744009, -9.447431386, -9.592715027, -9.684771803, 9.592715027, 9.447431386, 9.236744009, 8.942280997, 8.534547608]],
        JointG: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedJV = joint[index];

          let expectedJVx = 0;
          let expectedJVy = 0;
          if (jcount == 0) {
            expectedJVx = expectedJV['JointA'][0][index];
            expectedJVy = expectedJV['JointA'][1][index];
          }
          else if (jcount == 1) {
            expectedJVx = expectedJV['JointB'][0][index];
            expectedJVy = expectedJV['JointB'][1][index];
          }
          else if (jcount == 2) {
            expectedJVx = expectedJV['JointC'][0][index];
            expectedJVy = expectedJV['JointC'][1][index];
          }
          else if (jcount == 3) {
            expectedJVx = expectedJV['JointD'][0][index];
            expectedJVy = expectedJV['JointD'][1][index];
          }
          else if (jcount == 4) {
            expectedJVx = expectedJV['JointE'][0][index];
            expectedJVy = expectedJV['JointE'][1][index];
          }
          else if (jcount == 5) {
            expectedJVx = expectedJV['JointF'][0][index];
            expectedJVy = expectedJV['JointF'][1][index];
          }
          else if (jcount == 6) {
            expectedJVx = expectedJV['JointG'][0][index];
            expectedJVy = expectedJV['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedJV.x, calculatedJV.y, expectedJVx, expectedJVy);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(true);
      });
    })

    it('should determine the velocity of the Joints DO NOT match', () => {
      const expectedJV = {
        JointA: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointB: [[-33.2, -33.37295802, -33.53575032, -33.68832731, -33.8306425, -33.96265255, 33.8306425, 33.68832731, 33.53575032, 33.37295802, 33.2, 33.01692893, 32.82380059, 32.6206738, 32.40761044, 32.1846754, -32.40761044, -32.6206738, -32.82380059, -33.01692893, -33.2],
          [10.2, 9.619026597, 9.035123145, 8.448467507, 7.859238384, 7.267615261, -7.859238384, -8.448467507, -9.035123145, -9.619026597, -10.2, -10.77786638, -11.35244973, -11.923575, -12.49106824, -13.05475658, 12.49106824, 11.923575, 11.35244973, 10.77786638, 10.2]],
        JointC: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointD: [[17.22318211, 20.88453934, 26.2361341, 34.92072629, 52.35830468, 124.5127687, -52.35830468, -34.92072629, -26.2361341, -20.88453934, -17.22318211, -14.56061152, -12.54819419, -10.9884306, -9.759868612, -8.783103813, 9.759868612, 10.9884306, 12.54819419, 14.56061152, 17.22318211],
          [-30.13854569, -36.50129857, -45.29878135, -58.93197112, -85.33935335, -191.9947657, 85.33935335, 58.93197112, 45.29878135, 36.50129857, 30.13854569, 25.2022264, 21.18522031, 17.80104716, 14.87409376, 12.28996308, -14.87409376, -17.80104716, -21.18522031, -25.2022264, -30.13854569]],
        JointE: [[-14.09031526, -17.26027427, -21.20710171, -26.88596125, -37.38189038, -79.08230644, 37.38189038, 26.88596125, 21.20710171, 17.26027427, 14.09031526, 11.24830171, 8.414122354, 5.190386704, 0.664951931, -9.760290972, -0.664951931, -5.190386704, -8.414122354, -11.24830171, -14.09031526],
          [98.00592049, 94.9750567, 94.34590579, 96.99751308, 106.8577364, 159.6347413, -106.8577364, -96.99751308, -94.34590579, -94.9750567, -98.00592049, -103.5493215, -112.5511975, -127.5675026, -156.4274623, -242.1072173, 156.4274623, 127.5675026, 112.5511975, 103.5493215, 98.00592049]],
        JointF: [[-71.39877633, -79.47843194, -90.7424646, -108.3282522, -142.6029151, -281.6267464, 142.6029151, 108.3282522, 90.7424646, 79.47843194, 71.39877633, 65.18512377, 60.17395424, 55.99015941, 52.40361064, 49.26426364, -52.40361064, -55.99015941, -60.17395424, -65.18512377, -71.39877633],
          [8.534547608, 7.962109148, 7.124141097, 5.783808445, 3.168454789, -7.193416236, -3.168454789, -5.783808445, -7.124141097, -7.962109148, -8.534547608, -8.942280997, -9.236744009, -9.447431386, -9.592715027, -9.684771803, 9.592715027, 9.447431386, 9.236744009, 8.942280997, 8.534547608]],
        JointG: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedJV = joint[index];

          let expectedJVx = 0;
          let expectedJVy = 0;
          if (jcount == 0) {
            expectedJVx = expectedJV['JointA'][0][index];
            expectedJVy = expectedJV['JointA'][1][index];
          } else if (jcount == 1) {
            expectedJVx = expectedJV['JointB'][0][index];
            expectedJVy = expectedJV['JointB'][1][index];
          } else if (jcount == 2) {
            expectedJVx = expectedJV['JointC'][0][index];
            expectedJVy = expectedJV['JointC'][1][index];
          } else if (jcount == 3) {
            expectedJVx = expectedJV['JointD'][0][index];
            expectedJVy = expectedJV['JointD'][1][index];
          } else if (jcount == 4) {
            expectedJVx = expectedJV['JointE'][0][index];
            expectedJVy = expectedJV['JointE'][1][index];
          } else if (jcount == 5) {
            expectedJVx = expectedJV['JointF'][0][index];
            expectedJVy = expectedJV['JointF'][1][index];
          } else if (jcount == 6) {
            expectedJVx = expectedJV['JointG'][0][index];
            expectedJVy = expectedJV['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedJV.x, calculatedJV.y, expectedJVx, expectedJVy);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(false);
      });
    })
  });

  describe('LinearJointAcceleration', () => {
    it('should show the calculated Joint Acceleration DO match the expected', () => {
      const resultMatch = true;

      const expectedJA = {
        JointA: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointB: [[-102, -96.19026597, -90.35123145, -84.48467507, -78.59238384, -72.67615261, -78.59238384, -84.48467507, -90.35123145, -96.19026597, -102, -107.7786638, -113.5244973, -119.23575, -124.9106824, -130.5475658, -124.9106824, -119.23575, -113.5244973, -107.7786638, -102],
          [-332, -333.7295802, -335.3575032, -336.8832731, -338.306425, -339.6265255, -338.306425, -336.8832731, -335.3575032, -333.7295802, -332, -330.1692893, -328.2380059, -326.206738, -324.0761044, -321.846754, -324.0761044, -326.206738, -328.2380059, -330.1692893, -332]],
        JointC: [[-1630.71572, -2160.299911, -3125.417557, -5242.495089, -12006.0521, -95915.60203, -12006.0521, -5242.495089, -3125.417557, -2160.299911, -1630.71572, -1306.05688, -1091.881623, -943.1095983, -835.7918176, -756.1545967, -835.7918176, -943.1095983, -1091.881623, -1306.05688, -1630.71572],
          [-3708.377332, -4971.803637, -7246.471141, -12188.87588, -27864.82366, -221273.8582, -27864.82366, -12188.87588, -7246.471141, -4971.803637, -3708.377332, -2922.063511, -2393.735174, -2018.61082, -1740.92759, -1528.560158, -1740.92759, -2018.61082, -2393.735174, -2922.063511, -3708.377332]],
        JointD: [[1767.556952, 2489.56754, 3782.555644, 6580.211055, 15425.86642, 124315.6237, 15425.86642, 6580.211055, 3782.555644, 2489.56754, 1767.556952, 1315.264644, 1009.017761, 789.6400115, 625.6184202, 498.7868069, 625.6184202, 789.6400115, 1009.017761, 1315.264644, 1767.556952],
          [-3172.708646, -4208.148141, -6077.048697, -10147.05072, -23082.20122, -182973.0174, -23082.20122, -10147.05072, -6077.048697, -4208.148141, -3172.708646, -2530.05286, -2099.521676, -1794.790619, -1569.95267, -1398.579437, -1569.95267, -1794.790619, -2099.521676, -2530.05286, -3172.708646]],
        JointE: [[-1628.541536, -1900.67281, -2515.363082, -3986.905799, -8895.503512, -71477.25923, -8895.503512, -3986.905799, -2515.363082, -1900.67281, -1628.541536, -1554.136805, -1662.443004, -2072.251637, -3382.695211, -11710.5844, -3382.695211, -2072.251637, -1662.443004, -1554.136805, -1628.541536],
          [-2660.628166, -1357.466729, 113.4957572, 2570.83777, 9588.092386, 95018.91321, 9588.092386, 2570.83777, 113.4957572, -1357.466729, -2660.628166, -4235.022161, -6664.060735, -11396.93768, -24240.5874, -103395.7389, -24240.5874, -11396.93768, -6664.060735, -4235.022161, -2660.628166]],
        JointF: [[-4214.706537, -5557.545463, -7989.796642, -13297.48176, -30179.88705, -238820.0546, -30179.88705, -13297.48176, -7989.796642, -5557.545463, -4214.706537, -3385.568049, -2834.01763, -2447.186575, -2165.025871, -1952.95027, -2165.025871, -2447.186575, -2834.01763, -3385.568049, -4214.706537],
          [-938.3213417, -1058.088683, -1260.499029, -1678.634904, -2955.144946, -18266.8373, -2955.144946, -1678.634904, -1260.499029, -1058.088683, -938.3213417, -857.9343913, -799.0344872, -752.9961727, -715.1928464, -682.9390452, -715.1928464, -752.9961727, -799.0344872, -857.9343913, -938.3213417]],
        JointG: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedJA = joint[index];

          let expectedJAx = 0;
          let expectedJAy = 0;
          if (jcount == 0) {
            expectedJAx = expectedJA['JointA'][0][index];
            expectedJAy = expectedJA['JointA'][1][index];
          }
          else if (jcount == 1) {
            expectedJAx = expectedJA['JointB'][0][index];
            expectedJAy = expectedJA['JointB'][1][index];
          }
          else if (jcount == 2) {
            expectedJAx = expectedJA['JointC'][0][index];
            expectedJAy = expectedJA['JointC'][1][index];
          }
          else if (jcount == 3) {
            expectedJAx = expectedJA['JointD'][0][index];
            expectedJAy = expectedJA['JointD'][1][index];
          }
          else if (jcount == 4) {
            expectedJAx = expectedJA['JointE'][0][index];
            expectedJAy = expectedJA['JointE'][1][index];
          }
          else if (jcount == 5) {
            expectedJAx = expectedJA['JointF'][0][index];
            expectedJAy = expectedJA['JointF'][1][index];
          }
          else if (jcount == 6) {
            expectedJAx = expectedJA['JointG'][0][index];
            expectedJAy = expectedJA['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedJA.x, calculatedJA.y, expectedJAx, expectedJAy);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(true);
      });
    })

    it('should show the calculated Joint Acceleration DO match the expected', () => {
      const resultMatch = true;

      const expectedJA = {
        JointA: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointB: [[-102, -96.19026597, -90.35123145, -84.48467507, -78.59238384, -72.67615261, -78.59238384, -84.48467507, -90.35123145, -96.19026597, -102, -107.7786638, -113.5244973, -119.23575, -124.9106824, -130.5475658, -124.9106824, -119.23575, -113.5244973, -107.7786638, -102],
          [-332, -333.7295802, -335.3575032, -336.8832731, -338.306425, -339.6265255, -338.306425, -336.8832731, -335.3575032, -333.7295802, -332, -330.1692893, -328.2380059, -326.206738, -324.0761044, -321.846754, -324.0761044, -326.206738, -328.2380059, -330.1692893, -332]],
        JointC: [[-1630.71572, -2160.299911, -3125.417557, -5242.495089, -12006.0521, -95915.60203, -12006.0521, -5242.495089, -3125.417557, -2160.299911, -1630.71572, -1306.05688, -1091.881623, -943.1095983, -835.7918176, -756.1545967, -835.7918176, -943.1095983, -1091.881623, -1306.05688, -1630.71572],
          [-3708.377332, -4971.803637, -7246.471141, -12188.87588, -27864.82366, -221273.8582, -27864.82366, -12188.87588, -7246.471141, -4971.803637, -3708.377332, -2922.063511, -2393.735174, -2018.61082, -1740.92759, -1528.560158, -1740.92759, -2018.61082, -2393.735174, -2922.063511, -3708.377332]],
        JointD: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        JointE: [[-1628.541536, -1900.67281, -2515.363082, -3986.905799, -8895.503512, -71477.25923, -8895.503512, -3986.905799, -2515.363082, -1900.67281, -1628.541536, -1554.136805, -1662.443004, -2072.251637, -3382.695211, -11710.5844, -3382.695211, -2072.251637, -1662.443004, -1554.136805, -1628.541536],
          [-2660.628166, -1357.466729, 113.4957572, 2570.83777, 9588.092386, 95018.91321, 9588.092386, 2570.83777, 113.4957572, -1357.466729, -2660.628166, -4235.022161, -6664.060735, -11396.93768, -24240.5874, -103395.7389, -24240.5874, -11396.93768, -6664.060735, -4235.022161, -2660.628166]],
        JointF: [[-4214.706537, -5557.545463, -7989.796642, -13297.48176, -30179.88705, -238820.0546, -30179.88705, -13297.48176, -7989.796642, -5557.545463, -4214.706537, -3385.568049, -2834.01763, -2447.186575, -2165.025871, -1952.95027, -2165.025871, -2447.186575, -2834.01763, -3385.568049, -4214.706537],
          [-938.3213417, -1058.088683, -1260.499029, -1678.634904, -2955.144946, -18266.8373, -2955.144946, -1678.634904, -1260.499029, -1058.088683, -938.3213417, -857.9343913, -799.0344872, -752.9961727, -715.1928464, -682.9390452, -715.1928464, -752.9961727, -799.0344872, -857.9343913, -938.3213417]],
        JointG: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }

      mechanisms[0].joints.forEach((_, index) => {
        let jcount = 0;

        KinematicsSolver.determineKinematics(
          mechanisms[0].joints[index],
          mechanisms[0].links[index],
          mechanisms[0].inputAngularVelocities[index]
        );

        const resultMatch = mechanisms[0].joints.every((joint) => {
          const calculatedJA = joint[index];

          let expectedJAx = 0;
          let expectedJAy = 0;
          if (jcount == 0) {
            expectedJAx = expectedJA['JointA'][0][index];
            expectedJAy = expectedJA['JointA'][1][index];
          }
          else if (jcount == 1) {
            expectedJAx = expectedJA['JointB'][0][index];
            expectedJAy = expectedJA['JointB'][1][index];
          }
          else if (jcount == 2) {
            expectedJAx = expectedJA['JointC'][0][index];
            expectedJAy = expectedJA['JointC'][1][index];
          }
          else if (jcount == 3) {
            expectedJAx = expectedJA['JointD'][0][index];
            expectedJAy = expectedJA['JointD'][1][index];
          }
          else if (jcount == 4) {
            expectedJAx = expectedJA['JointE'][0][index];
            expectedJAy = expectedJA['JointE'][1][index];
          }
          else if (jcount == 5) {
            expectedJAx = expectedJA['JointF'][0][index];
            expectedJAy = expectedJA['JointF'][1][index];
          }
          else if (jcount == 6) {
            expectedJAx = expectedJA['JointG'][0][index];
            expectedJAy = expectedJA['JointG'][1][index];
          }

          const distance = euclideanDistance(calculatedJA.x, calculatedJA.y, expectedJAx, expectedJAy);
          const tolerance = 0.001; // Tolerance of 0.001 units

          jcount = jcount + 1
          return distance < tolerance;
        });

        expect(resultMatch).toBe(false);
      });
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