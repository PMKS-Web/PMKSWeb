/**
 * The words the app says out loud.
 *
 * Not every string in the UI lives here — labels and tooltips stay next to the
 * control they belong to, where they can be read alongside it. What lives here
 * is the text that is *said in more than one place*, or said in reply to
 * something going wrong. Those are the two kinds that drift: the same situation
 * gets a second wording in a second file, and a refusal written in a hurry
 * names a field instead of saying what to do about it.
 *
 * See `docs/ui-vocabulary.md` for which word to use for what, and the voice
 * these are written in.
 */

/**
 * Why an edit cannot happen right now.
 *
 * One situation, one sentence, wherever it is reached from — the same refusal
 * used to have three wordings depending on whether it came from a drag, a
 * context menu or a panel, and one of them called the animation a "simulation".
 *
 * Mode-first where the mode is the reason. Edit and Analyze are becoming more
 * distinctly separate, so a user stopped by one of them should be told which
 * room they are in rather than which button to press.
 */
export const CANNOT_EDIT = {
  analyzeMode: 'Switch to Edit mode to change the mechanism.',
  synthesizeMode: 'Switch to Edit mode to change the mechanism.',
  animating: 'Cannot edit while the animation is running.',
  awayFromStart: 'Step back to the start to edit.',
} as const;

/**
 * What to say when a typed value will not parse.
 *
 * By the *kind* of value, not by the field. There were eleven of these, one per
 * cell of the linkage table, and they differed only in naming a field that is
 * already on screen, highlighted, under the cursor — while saying nothing about
 * what would have been accepted.
 */
export const NOT_A = {
  length: 'That is not a length. Type a number, with or without a unit — 2, 2 cm, 0.75 in.',
  angle: 'That is not an angle. Type a number of degrees.',
  mass: 'That is not a mass. Type a number.',
  momentOfInertia: 'That is not a moment of inertia. Type a number.',
  force: 'That is not a force. Type a number.',
  name: 'A name has to be letters or numbers, and cannot be one already in use.',
} as const;

/** Features that exist as a button and nothing else yet. */
export const NOT_BUILT_YET = 'Not built yet.';
