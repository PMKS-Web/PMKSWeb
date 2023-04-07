import { Component, inject } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { NewGridComponent } from '../new-grid/new-grid.component';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  determineSlope,
  determineYIntersect,
  determineX,
  determineY,
} from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { Link, RealLink } from '../../model/link';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { FormBuilder, FormControl, FormGroupDirective, NgForm, Validators } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { environment } from '../../../environments/environment';
import emailjs, { EmailJSResponseStatus } from '@emailjs/browser';
import { SettingsService } from '../../services/settings.service';
import { Arc, Line } from '../../model/line';
import { C } from '@angular/cdk/keycodes';
import { Coord } from '../../model/coord';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '300px',
        })
      ),
      state(
        'closed',
        style({
          transform: 'translateX(calc(100% + 10px))',
        })
      ),
      state(
        'openWide',
        style({
          width: '500px', //Be careful, there are multiple places to change this value
        })
      ),

      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
})
export class RightPanelComponent {
  private analytics: Analytics = inject(Analytics);

  commentForm = this.fb.group({
    comment: ['', Validators.required],
    email: ['', Validators.email],
    response: [false],
    diagnostics: [true],
  });

  matcher = new MyErrorStateMatcher();

  static openTab = 0; //Default open tab to "Edit" /
  static isOpen = false; // Is the tab open?
  turnOnDebugger() {
    this.settingsService.isGridDebugOn = !this.settingsService.isGridDebugOn;
  }

  constructor(
    public activeObjService: ActiveObjService,
    public mechanismService: MechanismService,
    public settingsService: SettingsService,
    private fb: FormBuilder
  ) {}

  static tabClicked(tabID: number) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.openTab = tabID;
    } else {
      if (this.openTab === tabID) {
        this.isOpen = false;
      } else {
        this.openTab = tabID;
      }
    }
    // console.warn(this.openTab);
    // console.warn(this.isOpen);
  }

  getOpenTab() {
    return RightPanelComponent.openTab;
  }

  getIsOpen() {
    return RightPanelComponent.isOpen;
  }

  debugGetGridState() {
    return (
      NewGridComponent.debugGetGridState() +
      ' (' +
      gridStates[NewGridComponent.debugGetGridState()] +
      ')'
    );
  }

  debugGetJointState() {
    return (
      NewGridComponent.debugGetJointState() +
      ' (' +
      jointStates[NewGridComponent.debugGetJointState()] +
      ')'
    );
  }

  debugGetLinkState() {
    return (
      NewGridComponent.debugGetLinkState() +
      ' (' +
      linkStates[NewGridComponent.debugGetLinkState()] +
      ')'
    );
  }

  debugGetForceState() {
    return (
      NewGridComponent.debugGetForceState() +
      ' (' +
      forceStates[NewGridComponent.debugGetForceState()] +
      ')'
    );
  }

  getLinkDesiredOrder() {
    return RealLink.debugDesiredJointsIDs;
  }

  printMechanism() {
    logEvent(this.analytics, 'debug_print_mechanism');
    console.log(this.mechanismService.mechanisms[0]);
    console.log(this.mechanismService.links);
    console.log(this.mechanismService.joints);
  }

  redrawAllLinks() {
    console.log('Redrawing all links');
    this.mechanismService.links.forEach((link) => {
      (link as RealLink).reComputeDPath();
    });
  }

  printActiveObject() {
    logEvent(this.analytics, 'debug_print_active_object');
    switch (this.activeObjService.objType) {
      case 'Joint':
        console.log(this.activeObjService.selectedJoint);
        break;
      case 'Link':
        console.log(this.activeObjService.selectedLink);
        break;
      case 'Force':
        console.log(this.activeObjService.selectedForce);
        break;
      default:
        console.log('No active object');
    }

    console.log('Running interseciton tests');
    let arc = new Arc(new Coord(0, 0), new Coord(0, 2), new Coord(0, 1));
    let arc2 = new Arc(new Coord(-1, 1), new Coord(1, 1), new Coord(0, 1));
    console.log('Arc intersects with arc2, should be infinite points:');
    console.log(arc.intersectsWith(arc2));

    let line = new Line(new Coord(1, 0), new Coord(1, 2));
    console.log('Arc intersects with line, should be one point:');
    console.log(arc.intersectsWith(line));

    let line2 = new Line(new Coord(0.8, 0), new Coord(0.8, 2));
    console.log('Arc intersects with line2, should be two points:');
    console.log(arc.intersectsWith(line2));
    console.log(line2.intersectsWith(arc));

    let line3 = new Line(new Coord(-1, 0), new Coord(0, 0));
    console.log('Arc intersects with line 3 but only at the end, no points:');
    console.log(line3.intersectsWith(arc));
    console.log(arc.intersectsWith(line3));

    let line4 = new Line(new Coord(0, 2), new Coord(-1, 2));
    console.log('Arc intersects with line 4 but only at the start, no points:');
    console.log(line4.intersectsWith(arc));
    console.log(arc.intersectsWith(line4));

    let arc3 = new Arc(new Coord(-1, 2), new Coord(-1, 0), new Coord(-1, 1));
    console.log('Arc intersects with arc3 but only at the start, no points:');
    console.log(arc3.intersectsWith(line3));
    console.log(line3.intersectsWith(arc3));

    let arcTest = new Arc(
      new Coord(-0.1926, -7.258),
      new Coord(1.038, -7.36),
      new Coord(0.422, -7.31)
    );
    let lineTest = new Line(new Coord(1, 9.95), new Coord(0.457, 0.52));
    console.log('Arc intersects with lineTest, should be undefined:');
    console.log(arcTest.intersectsWith(lineTest));
    console.log(lineTest.intersectsWith(arcTest));

    //Two circle intersection test
    let arc4 = new Arc(new Coord(0, -1), new Coord(0, 1), new Coord(0, 0));
    let arc5 = new Arc(new Coord(1, 1), new Coord(1, -1), new Coord(1, 0));
    console.log('Arc intersects with arc5, should be two points:');
    console.log(arc4.intersectsWith(arc5));
    console.log(arc5.intersectsWith(arc4));

    let arc6 = new Arc(new Coord(3.94, 3.12), new Coord(3.73, 4.33), new Coord(3.83, 3.73));
    let arc7 = new Arc(new Coord(3.49, 4.29), new Coord(3.91, 5.45), new Coord(3.67, 4.88));
    console.log('Arc intersects with arc5, should be two points:');
    console.log(arc6.intersectsWith(arc7));
    console.log(arc7.intersectsWith(arc6));
  }

  gotoHelpSite() {
    //Open a new tab to this site: https://pmks.mech.website/pmks-web-how-to-videos/
    window.open('https://pmks.mech.website/pmks-web-how-to-videos/', '_blank');
    logEvent(this.analytics, 'goto_help_site');
  }

  sendNotReady() {
    NewGridComponent.sendNotification('Sorry, the tutorial is not ready yet.');
    logEvent(this.analytics, 'tutorial_not_ready');
  }

  getBrowserName() {
    const agent = window.navigator.userAgent.toLowerCase();
    switch (true) {
      case agent.indexOf('edge') > -1:
        return 'Edge';
      case agent.indexOf('opr') > -1 && !!(<any>window).opr:
        return 'Opera';
      case agent.indexOf('chrome') > -1 && !!(<any>window).chrome:
        return 'Chrome';
      case agent.indexOf('trident') > -1:
        return 'Internet Explorer';
      case agent.indexOf('firefox') > -1:
        return 'Firefox';
      case agent.indexOf('safari') > -1:
        return 'Safari';
      default:
        return 'Other';
    }
  }

  detectBrowserVersion() {
    var userAgent = navigator.userAgent,
      tem,
      matchTest =
        userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

    if (/trident/i.test(matchTest[1])) {
      tem = /\brv[ :]+(\d+)/g.exec(userAgent) || [];
      return 'IE ' + (tem[1] || '');
    }
    if (matchTest[1] === 'Chrome') {
      tem = userAgent.match(/\b(OPR|Edge)\/(\d+)/);
      if (tem != null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    matchTest = matchTest[2]
      ? [matchTest[1], matchTest[2]]
      : [navigator.appName, navigator.appVersion, '-?'];
    if ((tem = userAgent.match(/version\/(\d+)/i)) != null) matchTest.splice(1, 1, tem[1]);
    return matchTest.join(' ');
  }

  async sendCommentEmail() {
    if (this.commentForm.invalid) {
      NewGridComponent.sendNotification('Please fill out the form correctly.');
      return;
    } else {
      let emailJSKey = '';
      try {
        const res = await fetch('/.netlify//functions/getEmailJSKey').then((response) =>
          response.json()
        );
        emailJSKey = res.apiKey;
      } catch (err) {
        console.log(err);
        NewGridComponent.sendNotification(
          'It looks like you are in a development environment. If this is not the case, please try again later or contact us directly at: gr-pmksplus@wpi.edu'
        );
        return;
      }
      emailjs.init(emailJSKey);

      let browserInfo = '';
      if (this.commentForm.value.diagnostics) {
        browserInfo += 'Browser: ';
        browserInfo += this.getBrowserName();
        browserInfo += '\n Browser Version: ';
        browserInfo += this.detectBrowserVersion();
      } else {
        browserInfo = 'User did not allow diagnostics';
      }

      const params = {
        to_email: 'gr-pmksplus@wpi.edu',
        message: this.commentForm.value.comment
          ? this.commentForm.value.comment
          : 'User did not leave a comment',
        email: this.commentForm.value.email
          ? this.commentForm.value.email
          : 'User did not leave an email and does not want a response',
        diagnostic: browserInfo,
      };

      emailjs
        .send('service_pg2k647', 'template_kfwdx5c', params)
        .then(() => {
          NewGridComponent.sendNotification('Message sent. Thank you for your feedback!');
          this.commentForm.reset();
        })
        .catch((error: any) => {
          console.log(error);
          NewGridComponent.sendNotification(
            'Message failed to send. Please try again later or contact us directly at: gr-pmksplus@wpi.edu'
          );
        });
    }
  }
}

/** Error when invalid control is dirty, touched, or submitted. */
export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}
