import { Injectable } from '@angular/core';
import { stringToBoolean, stringToFloat, stringToShape } from '../model/utils';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Bound, Link, Piston, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { MechanismService } from './mechanism.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  constructor(mechanismSrv: MechanismService, settingsSrv: SettingsService) {
    
    // the transcoder is responsible for decoding the url into a mechanism
    const decoder = new StringTranscoder();

    // the content part of the url (the part after the ?)
    const url = this.getURLContent();

    // if the url exists, decode it and build the mechanism. Otherwise, skip to updating mechanism directly
    if (url !== null) {
      console.log("decoded url: " + url);
      decoder.decodeURL(url as string);
      const builder = new MechanismBuilder(mechanismSrv, decoder, settingsSrv);
      builder.build();
    }

    mechanismSrv.updateMechanism();
  }

  // From the full url string, extract the substring after the '?'. If does not exist, return null
  private getURLContent(): string | null {
    const fullURL = decodeURI(window.location.href);
    const index = fullURL.indexOf('?');

    if (index === -1) return null;
    return fullURL.substring(fullURL.indexOf('?') + 1);
  }
}
