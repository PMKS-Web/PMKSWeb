/**
 * The mechanism exactly as the canvas draws it, as a self-contained SVG.
 *
 * The report used to carry a skeleton drawn from the joint coordinates: bars,
 * pins and ground triangles. That is fine for a four-bar and wrong for
 * everything the app has learned to draw since — a slot, a piston, a sealed
 * cylinder and a compound outline all come out as straight lines between the
 * wrong points, and a reader comparing the page with their screen sees a
 * different machine.
 *
 * So the page takes the canvas itself. The grid ruling and the editing handles
 * come off, every computed style is written onto the element that had it —
 * the app's stylesheet is not going with it — and the frame is set to what is
 * actually drawn rather than to wherever the reader had panned to.
 */

/** Layers that are the paper and the tools, not the machine. */
const DROPPED = ['backgroundAndGrid', 'backgroundImageHandles'];

/**
 * The properties that decide what a shape looks like.
 *
 * Copied rather than the whole computed style: a full dump is some three
 * hundred declarations per element, which on a Jansen leg is a megabyte of
 * inline style for a picture three inches wide.
 */
const COPIED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'filter',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'letter-spacing',
  'display',
  'visibility',
];

/**
 * @param jointIds The joints of the one machine this picture is about. The
 * frame is set on those, so a drawing holding three machines yields three
 * pictures of one machine each rather than three of the same crowd — and the
 * one being reported on fills the box instead of sitting in a corner of it.
 */
export function canvasSnapshot(
  width: number,
  height: number,
  jointIds: string[] = []
): string | undefined {
  const canvas = document.querySelector('svg#canvas') as SVGSVGElement | null;
  if (!canvas) return undefined;

  const frame = machineFrame(canvas, jointIds) ?? contentFrame(canvas);
  if (!frame) return undefined;

  const clone = canvas.cloneNode(true) as SVGSVGElement;
  // Styles first, while the two trees still walk in step; the layers come off
  // afterwards.
  inlineStyles(canvas, clone);
  DROPPED.forEach((id) => clone.querySelector(`#${id}`)?.remove());

  absolutiseHrefs(clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  clone.removeAttribute('id');
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  return new XMLSerializer().serializeToString(clone);
}

/**
 * The box one machine's joints stand in, in the canvas's own coordinates.
 *
 * Its joints rather than its links: a joint is one marker with an id on it,
 * where a link is several paths and a label with none. The margin is generous
 * enough to take in the bodies hanging off those joints — a bar reaches no
 * further than the two pins holding it, and a ground mark or a ram's barrel
 * only a little past its own.
 */
function machineFrame(canvas: SVGSVGElement, jointIds: string[]): DOMRect | undefined {
  if (jointIds.length === 0) return undefined;
  const origin = canvas.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  jointIds.forEach((id) => {
    const marker = canvas.querySelector(`#joint_${CSS.escape(id)}`);
    if (!marker) return;
    const box = marker.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  });
  if (!Number.isFinite(left)) return undefined;

  const span = Math.max(right - left, bottom - top, 1);
  const margin = span * 0.16 + 16;
  return new DOMRect(
    left - origin.left - margin,
    top - origin.top - margin,
    right - left + 2 * margin,
    bottom - top + 2 * margin
  );
}

/**
 * What is drawn, in the canvas's own coordinates.
 *
 * Measured off the screen rather than through `getBBox`: the layers are turned
 * upside down by a transform of their own and framed by a pan-and-zoom
 * viewport, and the union of those two is exactly what a client rectangle
 * already accounts for.
 */
function contentFrame(canvas: SVGSVGElement): DOMRect | undefined {
  const origin = canvas.getBoundingClientRect();
  const layers = [...canvas.children].filter(
    (child) =>
      child instanceof SVGElement && !DROPPED.includes(child.id) && child.tagName !== 'defs'
  ) as SVGElement[];

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  layers.forEach((layer) => {
    const box = layer.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  });
  if (!Number.isFinite(left) || right <= left || bottom <= top) return undefined;

  // A margin, so a ground mark or a label is not cut off at the frame's edge.
  const margin = Math.max(12, (right - left) * 0.04);
  return new DOMRect(
    left - origin.left - margin,
    top - origin.top - margin,
    right - left + 2 * margin,
    bottom - top + 2 * margin
  );
}

/**
 * Point every referenced file at where it actually is.
 *
 * The canvas reaches for its ground marks and input arrows with paths relative
 * to the app — `../../../assets/Ground.svg`. The report is its own document
 * with its own base, so every one of those came out as a broken-image square
 * under the joints they belong to.
 */
function absolutiseHrefs(root: Element): void {
  const XLINK = 'http://www.w3.org/1999/xlink';
  [root, ...root.querySelectorAll('*')].forEach((element) => {
    (['href', 'xlink:href'] as const).forEach((name) => {
      const value =
        name === 'href' ? element.getAttribute('href') : element.getAttributeNS(XLINK, 'href');
      // A fragment points inside this file — at a filter or a gradient — and
      // must stay a fragment.
      if (!value || value.startsWith('#') || value.startsWith('data:')) return;
      const absolute = new URL(value, document.baseURI).href;
      if (name === 'href') element.setAttribute('href', absolute);
      else element.setAttributeNS(XLINK, 'xlink:href', absolute);
    });
  });
}

/** Write what the stylesheet was saying onto the elements it was saying it to. */
function inlineStyles(source: Element, clone: Element): void {
  const from = [source, ...source.querySelectorAll('*')];
  const to = [clone, ...clone.querySelectorAll('*')];
  for (let at = 0; at < from.length && at < to.length; at++) {
    const computed = getComputedStyle(from[at]);
    const target = to[at] as SVGElement;
    if (!target.style) continue;
    COPIED.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'none' && value !== 'normal') {
        target.style.setProperty(property, value);
      }
    });
    // Nothing in a printed picture answers a pointer, and the attributes that
    // said so are noise in the file.
    target.removeAttribute('pointer-events');
  }
}
