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

    // Rewind before the incoming mechanism takes the joints array over.
    //
    // `updateMechanism` puts the editable joints back on sample 0 before it
    // rebuilds, because they are simultaneously what the grid draws and what
    // the rebuild reads as t = 0. That works everywhere except here: by the
    // time it runs, the joints it is putting back belong to the mechanism that
    // has just arrived while the solved samples it reads them from still belong
    // to the one being replaced. Paired off by index, a template opened over a
    // running animation came up wearing the old linkage's start pose — and,
    // where the new linkage had more joints than the old, indexed past the end
    // of the samples and got NaN. Rewinding here, while frames and joints still
    // belong to each other, leaves that call with nothing left to do.
    const heldStep = mechanismSrv.mechanismTimeStep;
    // What is selected right now, so a step through history can put it back.
    //
    // Selection rides along in the same URL the history is made of, so undo
    // restored whatever happened to be selected when the *earlier* state was
    // written — and the panel silently re-pointed at another object. Undoing an
    // edit to joint B left you reading joint N's panel, which looks for all the
    // world like B's own switches turning themselves off.
    //
    // Selecting something is not an edit. It earns no history entry, so it
    // should not be undone by one.
    const heldSelection =
      continuingHistory && this.activeObj.objType !== 'Nothing' && this.activeObj.objType !== 'Grid'
        ? { type: this.activeObj.objType, id: this.activeObj.getSelectedObj()?.id }
        : undefined;
    mechanismSrv.rewindToStart();

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

    // Put the selection back before the mechanism is rebuilt, so everything
    // downstream — the panel, the canvas highlight, the analysis graphs — is
    // built once, against the object the user is actually looking at.
    //
    // By id rather than by reference: the decode replaces every joint and link
    // with a new object, so the one held above no longer exists. If its id does
    // not either, the edit really did remove it and the URL's own selection is
    // the honest answer.
    if (heldSelection?.id) {
      const restored =
        heldSelection.type === 'Joint'
          ? mechanismSrv.joints.find((joint) => joint.id === heldSelection.id)
          : heldSelection.type === 'Link'
            ? mechanismSrv.links.find((link) => link.id === heldSelection.id)
            : mechanismSrv.forces.find((force) => force.id === heldSelection.id);
      if (restored) this.activeObj.updateSelectedObj(restored);
    }

    // Through the structural seam rather than straight to `updateMechanism`.
    //
    // Decoding a URL builds a whole mechanism, which is as structural as an
    // edit gets — but it was the one path that skipped the reconcilers, so a
    // mechanism could arrive carrying a state the app itself would not build
    // and nothing looked at it. A URL is a compatibility surface: whatever an
    // older version wrote has to keep opening, and has to open as something
    // coherent.
    mechanismSrv.finishStructuralEdit(save);

    // A step within one mechanism's own history goes back to the time it was
    // taken at; a different mechanism arriving starts at the beginning of its
    // own cycle, which is the only time in it that means anything yet.
    if (continuingHistory && heldStep > 0) {
      setTimeout(() => {
        mechanismSrv.animate(heldStep, false);
      }, 0);
    }

    if (resetSvgScale) {
      // Frame it as soon as it has been drawn, and without the glide: a
      // mechanism that arrives should already be in view, not zoom itself in
      // once a second has passed. `scaleToFitLinkage` waits for the render.
      this.svgGrid.scaleToFitLinkage(false);
    }
  }
}
