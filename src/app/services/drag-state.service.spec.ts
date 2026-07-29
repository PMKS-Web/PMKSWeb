import { forceStates, gridStates, jointStates, linkStates } from '../model/utils';
import { DragStateService } from './drag-state.service';

describe('DragStateService', () => {
  it('reports a link-creation gesture as creating, not as dragging', () => {
    const state = new DragStateService();

    state.beginCreatingLinkFromJoint();

    expect(state.isCreatingLink).toBe(true);
    expect(state.isDragging).toBe(false);
    expect(state.grid).toBe(gridStates.createJointFromJoint);
    expect(state.joint).toBe(jointStates.creating);
  });

  it('clears every enum when a gesture is cancelled', () => {
    const state = new DragStateService();
    state.beginCreatingLinkFromLink();
    state.beginDraggingJoint();
    state.beginDraggingForceEnd();

    state.cancel();

    expect(state.grid).toBe(gridStates.waiting);
    expect(state.joint).toBe(jointStates.waiting);
    expect(state.link).toBe(linkStates.waiting);
    expect(state.force).toBe(forceStates.waiting);
    expect(state.isDragging).toBe(false);
  });

  // Undo is a stack of URL strings, so anything that saves more than once per
  // gesture fills the history with poses the user never asked to return to.
  it('earns one save for a drag that moved the mechanism', () => {
    const state = new DragStateService();
    state.press();
    state.beginDraggingJoint();

    state.notePointerMoved();
    state.noteMechanismModified();
    state.notePointerMoved();
    state.noteMechanismModified();

    expect(state.release().save).toBe(true);
  });

  it('earns no save for a click that selected without moving anything', () => {
    const state = new DragStateService();
    state.press();
    state.beginDraggingJoint();

    expect(state.release().save).toBe(false);
  });

  it('earns no save when the pointer moved but the mechanism did not', () => {
    const state = new DragStateService();
    state.press();
    state.notePointerMoved();

    expect(state.release().save).toBe(false);
  });

  it('does not carry a previous gesture credit into the next one', () => {
    const state = new DragStateService();
    state.press();
    state.beginDraggingJoint();
    state.notePointerMoved();
    state.noteMechanismModified();
    state.release();

    state.press();
    state.notePointerMoved();

    expect(state.release().save).toBe(false);
  });

  // A force endpoint is dragged on the editable pose only; the solved timesteps
  // that depend on it are stale until the mechanism is rebuilt.
  it('asks for a rebuild only when a force was in flight', () => {
    const state = new DragStateService();
    state.press();
    state.beginDraggingForceStart();
    expect(state.release().rebuild).toBe(true);

    state.press();
    state.beginDraggingJoint();
    expect(state.release().rebuild).toBe(false);
  });

  it('tracks whether the pointer is down across a gesture', () => {
    const state = new DragStateService();
    expect(state.isPointerDown).toBe(false);

    state.press();
    expect(state.isPointerDown).toBe(true);

    state.release();
    expect(state.isPointerDown).toBe(false);
  });
});
