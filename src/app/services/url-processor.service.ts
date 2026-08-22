import { Injectable, Injector, inject } from '@angular/core';
import { MechanismService } from './mechanism.service';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { SvgGridService } from './svg-grid.service';
import { ActiveObjService } from './active-obj.service';
import { NotificationService } from './notification.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { applySynthesisDesign } from './synthesis/synthesis-url';
import { SynthesisSolutionService } from './synthesis/synthesis-solution.service';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  private injector = inject(Injector);
  private settingsSrv = inject(SettingsService);
  private svgGrid = inject(SvgGridService);
  private activeObj = inject(ActiveObjService);
  private notify = inject(NotificationService);
  private synthesis = inject(SynthesisBuilderService);

  constructor() {
    // the content part of the url (the part after the ?)
    const url = this.getURLContent();

    // update the mechanism from the url
    this.updateFromURL(url, true, true, true);
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
    // different by them, so nothing remembered per joint may carry across --
    // nor does whether somebody chose a mark size, which was a fact about the
    // drawing being replaced. It is the incoming URL that says what size this
    // one's marks are, and that number is the only evidence there is about
    // whether its author picked it (svg-grid.service, adoptScaleForDrawing).
    if (!continuingHistory) {
      mechanismSrv.forgetSessionPreferences();
      SettingsService.objectScaleChosen = false;
    }

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
    //
    // Named rather than excluded: getSelectedObj() answers for exactly these
    // three and throws for anything else, so a deny-list turns every selection
    // kind added later into a crash on Undo. The background image was one --
    // it is not a mechanism object and has no id to hold.
    const heldSelection =
      continuingHistory && ['Joint', 'Link', 'Force'].includes(this.activeObj.objType)
        ? { type: this.activeObj.objType, id: this.activeObj.getSelectedObj()?.id }
        : undefined;
    mechanismSrv.rewindToStart();
    // The unit the drawing is about to be expressed in decides how big it is on
    // screen, and the viewport is compensated for that -- but only where the
    // change came from the settings panel. Replaying a step that crossed a unit
    // change has to compensate too, or the geometry comes back at its old size
    // through a viewport still zoomed for the new one.
    const unitBefore = this.settingsSrv.lengthUnit.value;

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
        // After the mechanism, because a design is about a machine that is not
        // on the grid yet and so has nothing in the build to wait for -- but
        // before the rebuild below, so the panel and the canvas come up
        // describing the same state.
        applySynthesisDesign(decoder.getSynthesisMarks(), this.synthesis);
        // Ownership names joints this URL is supposed to carry. Anything it
        // names that is not here was removed by hand at some point, and a
        // claim on an object that does not exist is not a claim worth keeping.
        const present = new Set(mechanismSrv.joints.map((joint) => joint.id));
        // Ids and their baselines are one list in two arrays, so they are
        // filtered together or not at all -- dropping an id on its own would
        // slide every baseline after it onto the wrong joint.
        const survives = this.synthesis.ownedJointIds.map((id) => present.has(id));
        const kept = this.synthesis.ownedJointIds.filter((_, index) => survives[index]);
        const keptAt = this.synthesis.ownedAt.filter((_, index) => survives[index]);
        // Dropping the ids of joints that are gone is right -- a claim on
        // something that does not exist would be inherited by whatever new
        // joint next took that letter. But dropping them silently threw away
        // the one fact that made the linkage entangled rather than ours, so a
        // reload turned "you cut into this, I will leave it alone" into "this
        // is mine, I will delete it": the reader's own edits, removed without
        // the warning that exists to prevent exactly that.
        // Only while something of ours is still standing. If every joint we
        // wrote has been taken away there is nothing left to be entangled
        // with -- the design owns nothing, and saying otherwise would keep a
        // section in every URL it writes from then on.
        if (kept.length > 0 && kept.length !== this.synthesis.ownedJointIds.length) {
          this.synthesis.ownershipPartial = true;
        } else if (kept.length === 0) {
          this.synthesis.ownershipPartial = false;
        }
        this.synthesis.ownedJointIds = kept;
        this.synthesis.ownedAt = keptAt;
        // A decode replaces the design wholesale, so whatever was found for the
        // last one says nothing about this one. Resolved late, like the other
        // services this one reaches: asking for it at construction would build
        // MechanismService before this service is finished being built.
        this.injector.get(SynthesisSolutionService).invalidate();
      } catch (error) {
        console.error('Unable to load mechanism URL', error);
        // Deferred because this can run inside the service's own constructor,
        // before there is an overlay to open into. A failure, and it waits to
        // be dismissed: the reader followed a link that did not work, and the
        // grid they are looking at instead is not an obvious clue that it
        // didn't.
        setTimeout(() => {
          this.notify.failure(
            'url.undecodable',
            'That shared link could not be opened — it may be from an older version of PMKS+.'
          );
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

    // A drawing that arrives while an analysis mode is open, and that nothing
    // in can be analysed, leaves the reader in a mode with no graphs, no
    // transport and no way to fix any of it -- the geometry is locked. Edit is
    // where the work is. Only for a drawing that *arrives*: a step through this
    // mechanism's own history is not a new subject.
    if (!continuingHistory) {
      const tabs = this.injector.get(SelectedTabService);
      if (tabs.isAnalysisMode() && !mechanismSrv.oneValidMechanismExists()) {
        tabs.setTab(TabID.EDIT);
      }
    }

    if (resetSvgScale) {
      // Frame it as soon as it has been drawn, and without the glide: a
      // mechanism that arrives should already be in view, not zoom itself in
      // once a second has passed. `scaleToFitLinkage` waits for the render.
      this.svgGrid.scaleToFitLinkage(false);
    } else {
      this.svgGrid.compensateForUnitChange(unitBefore, this.settingsSrv.lengthUnit.value);
    }
  }
}
