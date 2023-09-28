import { Injectable, Injector } from '@angular/core';
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
import { ActiveObjService } from './active-obj.service';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  constructor(
    private injector: Injector,
    private settingsSrv: SettingsService,
    private svgGrid: SvgGridService,
    private activeObj: ActiveObjService
  ) {

    // the content part of the url (the part after the ?)
    const url = this.getURLContent();

    // update the mechanism from the url
    try {
    this.updateFromURL(url, true, true, true);
    } catch(error){
      console.log("unable to load from URL");
            //Now set the URL back to the original URL without the query string.
            window.history.replaceState({}, document.title, window.location.pathname);
    }
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
  updateFromURL(url: string | null, resetSvgScale: boolean = true, updateSettings: boolean = true, save: boolean = false) {
    

    const mechanismSrv = this.injector.get(MechanismService);

    // the transcoder is responsible for decoding the url into a mechanism
    const decoder = new StringTranscoder();
    
    // if the url exists, decode it and build the mechanism. Otherwise, skip to updating mechanism directly
    if (url !== null) {
      console.log('decoded url: ' + url);
      decoder.decodeURL(url as string);
      console.log("building mechanism");
      const builder = new MechanismBuilder(mechanismSrv, decoder, this.settingsSrv, this.activeObj);
      builder.build(updateSettings);
  


      //Now set the URL back to the original URL without the query string.
      window.history.replaceState({}, document.title, window.location.pathname);
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
