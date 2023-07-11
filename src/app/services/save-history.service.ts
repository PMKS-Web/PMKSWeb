import { Injectable } from '@angular/core';
import { UrlGenerationService } from './url-generation.service';
import { UrlProcessorService } from './url-processor.service';

/*
  * This service is responsible for saving the history of the mechanism
  * as an ordered list of URLs representing the full mechanism state.
  * This is useful for undo and redo functionality.
*/

@Injectable({
  providedIn: 'root'
})
export class SaveHistoryService {

  private history: string[] = [];
  
  // index of the current state in the history
  private index: number = -1;

  constructor(
    private urlGenerationService: UrlGenerationService,
    private urlProcessorService: UrlProcessorService
  ) { }

  /*
    * Add a new state to the history.
    * If the current state is not the last state in the history,
    * delete all states after the current state.
    * If the current state is the last state in the history,
    * add the new state to the end of the history.
    * Update index to point to the new last state.
  */
  save() {

    // if the current state is not the last state in the history,
    // delete all states after the current state
    if (this.index < this.history.length - 1) {
      this.history.splice(this.index + 1);
    }

    // add the new state to the end of the history
    let state = this.urlGenerationService.generateUrlQuery();
    this.history.push(state);

    // update index to point to the new last state
    this.index = this.history.length - 1;
  }

  /*
    * Return whether there is history before current state to undo to.
  */
  canUndo(): boolean {
    return this.index > 0;
  }

  private setMechanismToState(index: number) {
    this.index = index;
    this.urlProcessorService.updateFromURL(this.history[this.index]);
  }

  /*
    * Undo to the previous state in the history.
    * Update index to point to the new current state.
  */
  undo() {

    if (!this.canUndo()) {
      return;
    }

    // If the actual mechanism state is not the same as the
    // state set by index, then the user has made changes
    // to the mechanism since the last save, and we should
    // revert to the last saved state.
    if (this.urlGenerationService.generateUrlQuery() !== this.history[this.index]) {
      this.setMechanismToState(this.index);
    } else {
      // Otherwise, update index to point to the new current state
      this.setMechanismToState(this.index - 1);
    }
  }

  /*
    * Return whether there is history after current state to redo to.
  */
  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  /*
    * Redo to the next state in the history.
    * Update index to point to the new current state.
  */
  redo() {

    if (!this.canRedo()) {
      return;
    }
    this.setMechanismToState(this.index + 1);
  }
}
