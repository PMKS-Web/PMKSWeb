// import { TestBed } from '@angular/core/testing';
// import { AppComponent } from './app.component';
// import {Joint} from "./model/joint";
// import {Link} from "./model/link";
// import {Force} from "./model/force";
// import {InstantCenter} from "./model/instant-center";
// import {Mechanism} from "./model/mechanism/mechanism";
// import {GridUtilsService} from "./services/grid-utils.service";
// import {ActiveObjService} from "./services/active-obj.service";
// import {SettingsService} from "./services/settings.service";
// import {MechanismService} from "./services/mechanism.service";
// import {ForceSolver} from "./model/mechanism/force-solver";
// import {KinematicsSolver} from "./model/mechanism/kinematic-solver";
//
// describe('AppComponent', () => {
//   beforeEach(async () => {
//     await TestBed.configureTestingModule({
//       declarations: [AppComponent],
//     }).compileComponents();
//   });
//
//   it('should create the app', () => {
//     const fixture = TestBed.createComponent(AppComponent);
//     const app = fixture.componentInstance;
//     expect(app).toBeTruthy();
//   });
//
//   // it(`should have as title 'PMKSWeb'`, () => {
//   //   const fixture = TestBed.createComponent(AppComponent);
//   //   const app = fixture.componentInstance;
//   //   expect(app.title).toEqual('PMKSWeb');
//   // });
//
//   it('should render title', () => {
//     const fixture = TestBed.createComponent(AppComponent);
//     fixture.detectChanges();
//     const compiled = fixture.nativeElement as HTMLElement;
//     expect(compiled.querySelector('.content span')?.textContent).toContain(
//         'PMKSWeb app is running!'
//     );
//   });
// });
//
// describe('SixbarService', () => {
//   // let service: SixbarService;
//   let joints: Joint[] = [];
//   let links: Link[] = [];
//   const forces: Force[] = [];
//   const ics: InstantCenter[] = [];
//   const mechanisms: Mechanism[] = [];
//   const gridUtilService: GridUtilsService = new GridUtilsService();
//   const activeObjService: ActiveObjService = new ActiveObjService();
//   const settingsService: SettingsService = new SettingsService();
//   const mechanismSrv: MechanismService = new MechanismService(gridUtilService, activeObjService, settingsService);
//
//   // Link AB
//   const JointA = mechanismSrv.createRevJoint("-3.74", "-2.41");
//   const JointB = mechanismSrv.createRevJoint("-2.72", "0.91", JointA.id);
//   JointA.connectedJoints.push(JointB);
//   JointB.connectedJoints.push(JointA);
//   const linkAB = gridUtilService.createRealLink(JointA.id +JointB.id, [JointA, JointB]);
//   JointA.links.push(linkAB);
//   JointB.links.push(linkAB);
//   // Link BC
//   const JointC = mechanismSrv.createRevJoint("1.58", "0.43", JointB.id);
//   JointB.connectedJoints.push(JointC);
//   JointC.connectedJoints.push(JointB);
//   const linkBC = gridUtilService.createRealLink(JointB.id +JointC.id, [JointB, JointC]);
//   JointC.links.push(linkBC);
//   JointB.links.push(linkBC);
//   // attach D to BC
//   const JointD = mechanismSrv.createRevJoint("-0.24", "4.01", JointC.id);
//   JointB.connectedJoints.push(JointD);
//   JointC.connectedJoints.push(JointD);
//   JointD.connectedJoints.push(JointB);
//   JointD.connectedJoints.push(JointC);
//   JointD.links.push(linkBC);
//   linkBC.joints.push(JointD);
//   linkBC.id += JointD.id;
//   // DE
//   const JointE = mechanismSrv.createRevJoint("5.08", "5.31", JointD.id);
//   JointD.connectedJoints.push(JointE);
//   JointE.connectedJoints.push(JointD);
//   const linkDE = gridUtilService.createRealLink(JointD.id +JointE.id, [JointD, JointE]);
//   JointD.links.push(linkDE);
//   JointE.links.push(linkDE);
//   // EF
//   const JointF = mechanismSrv.createRevJoint("8.14", "3.35", JointE.id);
//   JointE.connectedJoints.push(JointF);
//   JointF.connectedJoints.push(JointE);
//   const linkEF = gridUtilService.createRealLink(JointE.id +JointF.id, [JointE, JointF]);
//   JointA.links.push(linkEF);
//   JointB.links.push(linkEF);
//   // CF
//   JointC.connectedJoints.push(JointF);
//   JointF.connectedJoints.push(JointC);
//   const linkCF = gridUtilService.createRealLink(JointC.id +JointF.id, [JointC, JointF]);
//   JointC.links.push(linkCF);
//   JointF.links.push(linkCF);
//   // Attach G to CF
//   const JointG = mechanismSrv.createRevJoint("7.32", "-3.51", JointF.id);
//   JointC.connectedJoints.push(JointG);
//   JointF.connectedJoints.push(JointG);
//   JointG.connectedJoints.push(JointC);
//   JointG.connectedJoints.push(JointF);
//   JointG.links.push(linkCF);
//   linkCF.joints.push(JointG);
//   linkCF.id += JointG.id;
//
//   joints = [JointA, JointB, JointC, JointD, JointE, JointF, JointG]
//   links = [linkAB, linkBC, linkDE, linkEF, linkCF]
//
//   const gravity = false;
//   const unit = 'cm';
//
//   mechanisms.push(
//       new Mechanism(
//           joints,
//           links,
//           forces,
//           ics,
//           gravity,
//           unit,
//           10
//       )
//   )
//
//   ForceSolver.determineDesiredLoopLettersForce(mechanismSrv.mechanisms[0].requiredLoops)
//   ForceSolver.determineForceAnalysis(
//       mechanismSrv.joints,
//       mechanismSrv.links,
//       'static',
//       gravity,
//       unit
//   );
//
//   KinematicsSolver.requiredLoops = mechanismSrv.mechanisms[0].requiredLoops;
//   KinematicsSolver.determineKinematics(
//       mechanismSrv.joints,
//       mechanismSrv.links,
//       10
//   );
//
//   describe('LinearJointPosition', () => {
//     it('should determine The position of the Joints', () => {
//       const resultMatch = true;
//       mechanisms[0].joints.forEach((_, index) => {
//         KinematicsSolver.determineKinematics(
//             mechanisms[0].joints[index],
//             mechanisms[0].links[index],
//             mechanisms[0].inputAngularVelocities[index]
//         );
//         mechanisms[0].joints[0].forEach((j) => {
//
//         });
//       });
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('LinearJointVelocity', () => {
//     it('should determine if the velocity of the Joints matches', () => {
//       let resultMatch = true;
//       mechanisms[0].joints.forEach((_, index) => {
//         KinematicsSolver.determineKinematics(
//             mechanisms[0].joints[index],
//             mechanisms[0].links[index],
//             mechanisms[0].inputAngularVelocities[index]
//         );
//         mechanisms[0].joints[index].forEach((j) => {
//           const simvalx = KinematicsSolver.jointVelMap.get(j.id)![0];
//           const simvaly = KinematicsSolver.jointVelMap.get(j.id)![1];
//           const matvalx = 0; // TODO: replaced with matlab output
//           const matvaly = 0;
//
//           if (simvalx.valueOf() !== matvalx.valueOf() || simvaly.valueOf() !== matvaly.valueOf()) {
//             resultMatch = false;
//             console.log('Linear Joint Velocity analysis of ' + index.toString() + ' failed at joint: ' + j.id)
//           }
//         });
//         expect(resultMatch).toBe(true);
//       });
//     });
//   });
//
//   describe('LinearJointAcceleration', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('LinearLinkCoMPosition', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('LinearLinkCoMVelocity', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('LinearLinkCoMAcceleration', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('AngularLinkPosition', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('AngularLinkVelocity', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
//
//   describe('AngularLinkAcceleration', () => {
//     it('should be calculate the CoM correctly', () => {
//       const resultMatch = true;
//       expect(resultMatch).toBe(true);
//     })
//   });
// });

describe('Math problem',()=>{
  it('do 1+1',() => {
    expect(1+1).toBe(2);
  })
});
