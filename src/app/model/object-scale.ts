import { BehaviorSubject } from 'rxjs';
import { MODEL_SCALE } from './render-scale';

/**
 * The size of the drawn marks — joints, ground hatching, arrows — as an
 * internal length. It lives here, in a module with no other imports, rather
 * than on SettingsService where its public face is: Coord's closeness
 * thresholds scale with it, and a geometry leaf importing the service graph is
 * the module cycle that left `Coord` undefined while `Joint extends Coord`
 * was being evaluated.
 *
 * 0.7 rather than 1: joints, blocks and cylinder heads at full size crowd a
 * linkage of ordinary proportions, and the first thing most people did was
 * turn it down. A mechanism arriving from a URL carries its own scale, so
 * this is what a new project starts at and what an older URL without the
 * setting falls back to.
 */
export const DEFAULT_OBJECT_SCALE = 0.7 * MODEL_SCALE;

export const OBJECT_SCALE = new BehaviorSubject(DEFAULT_OBJECT_SCALE);
