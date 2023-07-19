import { Injectable } from '@angular/core';
import { stringToBoolean, stringToFloat, stringToShape } from '../model/utils';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Bound, Link, Piston, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { MechanismService } from './mechanism.service';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { SvgGridService } from './svg-grid.service';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  constructor(
    private mechanismSrv: MechanismService,
    private settingsSrv: SettingsService,
    private svgGrid: SvgGridService,
  ) {

    // the content part of the url (the part after the ?)
    const url = this.getURLContent();

    // update the mechanism from the url
    this.updateFromURL(url);

    // initial save
    //this.mechanismSrv.save();

  }

  // From the full url string, extract the substring after the '?'. If does not exist, return null
  private getURLContent(): string | null {
    const fullURL = decodeURI(window.location.href);
    const index = fullURL.indexOf('?');

    if (index === -1) return null;
    return fullURL.substring(fullURL.indexOf('?') + 1);
  }

  // Decode the url and update mechanism
  updateFromURL(url: string | null) {
    
    // the transcoder is responsible for decoding the url into a mechanism
    const decoder = new StringTranscoder();
    
    // if the url exists, decode it and build the mechanism. Otherwise, skip to updating mechanism directly
    if (url !== null) {
      console.log('decoded url: ' + url);
      decoder.decodeURL(url as string);
      const builder = new MechanismBuilder(this.mechanismSrv, decoder, this.settingsSrv);
      builder.build();

      //Now set the URL back to the original URL without the query string.
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this.mechanismSrv.updateMechanism();

    // animate the mechanism
    if (this.mechanismSrv.mechanismTimeStep > 0) {
      setTimeout(() => {
        this.mechanismSrv.animate(this.mechanismSrv.mechanismTimeStep, false);
      }, 0);
    }

    //After the mechanism is built, scale the mechanism to fit the screen
    //Do this after a 1 sec timeout to allow the mechanism to be built first.
    setTimeout(() => {
      this.svgGrid.scaleToFitLinkage();
    }, 1000);
  }

}
