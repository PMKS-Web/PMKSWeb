/**
 * The colours a part can be drawn in.
 *
 * A leaf module with no imports of its own, like the object scale beside it:
 * the URL codec and the canvas both need these, and neither should be reaching
 * through the service graph for a list of hex values.
 */

/**
 * What links are drawn in, and what forces are offered.
 *
 * One palette for both, because a force belongs to a link and reading a drawing
 * means pairing them up -- a force in a colour no link could be would say it
 * belonged to something that is not there.
 */
export const PART_COLORS = [
  '#c5cae9',
  '#303e9f',
  '#0d125a',
  '#B2DFDB',
  '#26A69A',
  '#00695C',
] as const;

/**
 * The colour a force is drawn in until somebody chooses another.
 *
 * The darkest of the six rather than a seventh colour of its own, so the picker
 * always has one swatch ticked and there is nothing in the list that is not
 * also a link colour.
 */
export const DEFAULT_FORCE_COLOR = '#0d125a';

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

/**
 * Amber through brown, warm the whole way, none of it a link colour.
 *
 * Amber is exactly what every joint has always been drawn in and does not move.
 * The other three sit a step further up their own ramps than amber does on
 * hers -- at the palest they were four off-whites a hand's width apart, which
 * read as one material but left a coloured joint indistinguishable from an
 * uncoloured one until somebody pointed at it. The hover shade moves with the
 * resting one, or the two would be the same colour.
 */
export const JOINT_FAMILIES: readonly JointFamily[] = [
  { id: '', name: 'Amber', normal: '#fff8e1', hover: '#ffecb3', selected: '#ffca28' },
  { id: 'o', name: 'Orange', normal: '#ffe0b2', hover: '#ffcc80', selected: '#fb8c00' },
  { id: 'd', name: 'Deep orange', normal: '#ffccbc', hover: '#ffab91', selected: '#f4511e' },
  { id: 'b', name: 'Brown', normal: '#d7ccc8', hover: '#bcaaa4', selected: '#6d4c41' },
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
