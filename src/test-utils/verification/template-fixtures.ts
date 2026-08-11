import type { LibraryTemplateID } from '../../app/component/MODALS/templates/template-linkages';
import { FIXTURE_GALLERY, GalleryEntry } from './fixture-gallery';

/**
 * Which verification mechanism each library template ships.
 *
 * The mechanism is named rather than built here, so a template is always one of
 * the mechanisms the suite already asserts on and publishes a link to — there
 * is no way to add a template that nothing tests, and the card and the gallery
 * row cannot come to mean different linkages.
 */
export const LIBRARY_TEMPLATE_SOURCES: Record<LibraryTemplateID, string> = {
  Whitworth_Quick_Return: 'Whitworth proportions',
  Scotch_Yoke: 'Scotch yoke',
  Cylinder_Boom: 'Cylinder-driven boom',
  Cylinder_Gripper: 'Gripper the cylinder closes',
  Radial_Engine: 'Radial engine, five cylinders',
  Chebyshev_Straight_Line: 'Chebyshev straight-line linkage',
  Windshield_Wiper: 'Windshield wiper',
  Elliptical_Crank: 'Elliptical crank',
  Jansen_Leg: 'Jansen leg',
  Backhoe_Bucket: 'Backhoe bucket',
  Toggle_Press: 'Toggle press',
  Scissor_Lift: 'Scissor lift',
  Shaper_Quick_Return: "Shaper's quick-return drive",
  Pedaling_Leg: 'Leg on a bicycle crank',
  Oscillating_Fan: 'Oscillating fan',
  Pumpjack: 'Walking-beam pumping unit',
  Punch_Press: 'Punch press',
  Derrick_Crane: 'Derrick crane',
  Toggle_Clamp: 'Toggle clamp',
  Offset_Load_Rocker: 'Rocker with an offset load',
};

export function libraryTemplateEntry(id: LibraryTemplateID): GalleryEntry {
  const name = LIBRARY_TEMPLATE_SOURCES[id];
  const entry = FIXTURE_GALLERY.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`No FIXTURE_GALLERY entry named "${name}" for template ${id}`);
  return entry;
}
