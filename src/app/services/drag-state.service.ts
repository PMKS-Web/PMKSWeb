import { Injectable } from '@angular/core';
import { forceStates, gridStates, jointStates, linkStates } from '../model/utils';

/** What a released gesture asks the caller to do, once. */
export interface GestureOutcome {
  /** A force endpoint moved, so the mechanism has to be rebuilt before saving. */
  rebuild: boolean;
  /** The gesture changed the mechanism, so it earns exactly one undo entry. */
  save: boolean;
}

/**
 * The canvas interaction state machine.
 *
 * Four independent enums used to be four fields on NewGridComponent, assigned
 * from roughly a dozen scattered sites; a gesture that forgot one of them left
 * the canvas in a state no single field described. They live here instead,
 * behind named transitions, so the legal moves are enumerable and testable
 * without a DOM.
 *
 * The service also owns *gesture* bookkeeping, which is a different question
 * from "what is in flight": undo is a stack of URL strings, so a drag has to
 * produce exactly one save on release rather than one per pointer-move.
 */
@Injectable({
  providedIn: 'root',
})
export class DragStateService {
  private _grid: gridStates = gridStates.waiting;
  private _joint: jointStates = jointStates.waiting;
  private _link: linkStates = linkStates.waiting;
  private _force: forceStates = forceStates.waiting;

  private pointerIsDown = false;
  private pointerMoved = false;
  private mechanismModified = false;

  get grid(): gridStates {
    return this._grid;
  }

  get joint(): jointStates {
    return this._joint;
  }

  get link(): linkStates {
    return this._link;
  }

  get force(): forceStates {
    return this._force;
  }

  /** True while a rubber band is being stretched towards a new joint. */
  get isCreatingLink(): boolean {
    return (
      this._grid === gridStates.createJointFromGrid ||
      this._grid === gridStates.createJointFromJoint ||
      this._grid === gridStates.createJointFromLink
    );
  }

  /** True while an existing object is being moved, as opposed to created. */
  get isDragging(): boolean {
    return (
      this._joint === jointStates.dragging ||
      this._link === linkStates.dragging ||
      this._force === forceStates.draggingStart ||
      this._force === forceStates.draggingEnd
    );
  }

  get isPointerDown(): boolean {
    return this.pointerIsDown;
  }

  // --- Creation ---------------------------------------------------------

  beginCreatingLinkFromGrid(): void {
    this._grid = gridStates.createJointFromGrid;
  }

  beginCreatingLinkFromJoint(): void {
    this._grid = gridStates.createJointFromJoint;
    this._joint = jointStates.creating;
  }

  beginCreatingLinkFromLink(): void {
    this._grid = gridStates.createJointFromLink;
    this._link = linkStates.creating;
  }

  beginCreatingForce(): void {
    this._grid = gridStates.createForce;
    this._force = forceStates.creating;
  }

  /** Two-point cylinder creation: start point chosen, ghost tracking cursor. */
  beginCreatingCylinder(): void {
    this._grid = gridStates.createCylinder;
  }

  /** A creation gesture reached its second click and produced its object. */
  finishCreating(): void {
    this._grid = gridStates.waiting;
    this._joint = jointStates.waiting;
    this._link = linkStates.waiting;
    this._force = forceStates.waiting;
  }

  // --- Dragging ---------------------------------------------------------

  beginDraggingJoint(): void {
    this._joint = jointStates.dragging;
  }

  beginDraggingLink(): void {
    this._link = linkStates.dragging;
  }

  beginDraggingForceStart(): void {
    this._force = forceStates.draggingStart;
  }

  beginDraggingForceEnd(): void {
    this._force = forceStates.draggingEnd;
  }

  // --- Gesture ----------------------------------------------------------

  /** A pointer went down. Starts a fresh gesture; nothing is owed yet. */
  press(): void {
    this.pointerIsDown = true;
    this.pointerMoved = false;
    this.mechanismModified = false;
  }

  /** The pointer moved at all — not necessarily over anything draggable. */
  notePointerMoved(): void {
    this.pointerMoved = true;
  }

  /** Something in the mechanism actually changed during this gesture. */
  noteMechanismModified(): void {
    this.mechanismModified = true;
  }

  /**
   * The pointer came up: clear everything in flight and report what the gesture
   * earned. A gesture that moved nothing, or moved the pointer without touching
   * the mechanism, earns no undo entry — that is what keeps a click from
   * pushing a duplicate state onto the history stack.
   */
  release(): GestureOutcome {
    const outcome: GestureOutcome = {
      rebuild: this._force !== forceStates.waiting,
      save: this.pointerMoved && this.mechanismModified,
    };
    this.cancel();
    this.pointerIsDown = false;
    // The credit itself is cleared by the next press(), not here — a released
    // gesture has nothing left to owe.
    return outcome;
  }

  /**
   * Abandon whatever is in flight without crediting the gesture. Used by the
   * middle- and right-button paths, and by creation gestures that get refused.
   */
  cancel(): void {
    this._grid = gridStates.waiting;
    this._joint = jointStates.waiting;
    this._link = linkStates.waiting;
    this._force = forceStates.waiting;
  }
}
