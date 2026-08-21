/**
 * The colours a joint can be drawn in.
 *
 * A leaf module with no imports of its own, like the object scale beside it:
 * the URL codec and the canvas both need these, and neither should be reaching
 * through the service graph for a list of hex values.
 */

/**
 * One joint colour: what it is drawn in at rest, under the cursor, and picked.
 *
 * `id` is what travels in the URL, and the first family's is empty -- a joint
 * that has never been given a colour says nothing, so a drawing where nobody
 * chose one encodes to the bytes it always did.
 */
export interface JointFamily {
  id: string;
  name: string;
  normal: string;
  hover: string;
  selected: string;
}

/** Amber through brown, warm the whole way, none of it a link colour. */
export const JOINT_FAMILIES: readonly JointFamily[] = [
  { id: '', name: 'Amber', normal: '#fff8e1', hover: '#ffecb3', selected: '#ffca28' },
  { id: 'o', name: 'Orange', normal: '#fff3e0', hover: '#ffe0b2', selected: '#ffa726' },
  { id: 'd', name: 'Deep orange', normal: '#fbe9e7', hover: '#ffccbc', selected: '#ff7043' },
  { id: 'b', name: 'Brown', normal: '#efebe9', hover: '#d7ccc8', selected: '#8d6e63' },
];

/**
 * What a selection looks like whichever family a joint is drawn in.
 *
 * Amber is what "picked" means everywhere in the app -- the outline of a
 * selected link, every pressed control -- so a joint in another family wears it
 * as a ring inside its own edge rather than giving up its own colour. The fill
 * says which joint this is; the ring says it is the one that is selected.
 */
export const SELECTION_RING = '#ffca28';
