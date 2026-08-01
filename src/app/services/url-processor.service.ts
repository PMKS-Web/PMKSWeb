import { Injectable, Injector } from '@angular/core';
import { stringToBoolean, stringToFloat, stringToShape } from '../model/utils';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Bound, Link, SliderBlock, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { MechanismService } from './mechanism.service';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { SvgGridService } from './svg-grid.service';
import { ActiveObjService } from './active-obj.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  constructor(
    private injector: Injector,
    private settingsSrv: SettingsService,
    private svgGrid: SvgGridService,
    private activeObj: ActiveObjService,
    private snackBar: MatSnackBar
  ) {
    // the content part of the url (the part after the ?)
    const url = this.getURLContent();

    // update the mechanism from the url
    this.updateFromURL(url, true, true, true);

    // initial save
    // this causes a circular dependency
    // this.mechanismSrv.save();
  }

  // From the full url string, extract the substring after the '?'. If does not exist, return null
  private getURLContent(): string | null {
    const fullURL = decodeURI(window.location.href);
    const index = fullURL.indexOf('?');

    if (index === -1) return null;
    return fullURL.substring(fullURL.indexOf('?') + 1);
  }

  // Decode the url and update mechanism
  updateFromURL(
    url: string | null,
    resetSvgScale: boolean = true,
    updateSettings: boolean = true,
    save: boolean = false,
    /**
     * True when this is a step within one mechanism's own history rather than a
     * different mechanism arriving. Undo and redo pass it; opening a project,
     * loading a template and the initial URL decode do not.
     */
    continuingHistory: boolean = false
  ) {
    const mechanismSrv = this.injector.get(MechanismService);
    // A different mechanism reuses the same joint letters and means something
    // different by them, so nothing remembered per joint may carry across.
    if (!continuingHistory) mechanismSrv.forgetSessionPreferences();

    // the transcoder is responsible for decoding the url into a mechanism
    const decoder = new StringTranscoder();

    // if the url exists, decode it and build the mechanism. Otherwise, skip to updating mechanism directly
    if (url !== null) {
      try {
        console.log('decoded url: ' + url);
        decoder.decodeURL(url);
        const builder = new MechanismBuilder(
          mechanismSrv,
          decoder,
          this.settingsSrv,
          this.activeObj
        );
        builder.build(updateSettings);
      } catch (error) {
        console.error('Unable to load mechanism URL', error);
        setTimeout(() => {
          this.snackBar.open('Unable to load the shared mechanism URL.', '', {
            duration: 4000,
            horizontalPosition: 'center',
            verticalPosition: 'top',
          });
        });
      } finally {
        // Invalid data must not remain in the address bar or be retried on refresh.
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    mechanismSrv.updateMechanism(save);

    // animate the mechanism
    if (mechanismSrv.mechanismTimeStep > 0) {
      setTimeout(() => {
        mechanismSrv.animate(mechanismSrv.mechanismTimeStep, false);
      }, 0);
    }

    if (resetSvgScale) {
      //After the mechanism is built, scale the mechanism to fit the screen
      //Do this after a 1 sec timeout to allow the mechanism to be built first.
      setTimeout(() => {
        this.svgGrid.scaleToFitLinkage();
      }, 1000);
    }
  }
}
