import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { escapeXml } from './xml';

/**
 * The mechanism as a skeleton, fitted to a box.
 *
 * A report that shows numbers without showing what they are about asks a reader
 * to take the geometry on trust, so page one carries the drawing. Deliberately
 * a skeleton rather than a copy of the canvas: the canvas is a live SVG full of
 * handles, marks and hit targets, and what a printed page needs is bars,
 * joints, and which of them are pinned down.
 */
export function mechanismSvg(
  joints: Joint[],
  links: Link[],
  width: number,
  height: number
): string {
  const drawn = joints.filter((joint) => !(joint instanceof PrisJoint));
  if (drawn.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  }

  // Model y points up and SVG y points down, which is why the canvas itself
  // draws through a scaleY(-1); here the flip is folded into the projection.
  const xs = drawn.map((joint) => joint.x);
  const ys = drawn.map((joint) => -joint.y);
  const pad = 26;
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const at = (joint: Joint): [number, number] => [
    round(width / 2 + (joint.x - midX) * scale),
    round(height / 2 + (-joint.y - midY) * scale),
  ];

  const bars = links
    .filter((link): link is RealLink => link instanceof RealLink)
    .map((link) => {
      const points = link.joints
        .filter((joint) => !(joint instanceof PrisJoint))
        .map((joint) => at(joint).join(','))
        .join(' ');
      if (!points) return '';
      const shape = link.joints.length > 2 ? 'polygon' : 'polyline';
      return `<${shape} points="${points}" fill="none" stroke="${
        link.fill || '#5c6bc0'
      }" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    })
    .join('');

  const grounds = drawn
    .filter((joint) => (joint as RealJoint).ground)
    .map((joint) => {
      const [x, y] = at(joint);
      return (
        `<path d="M ${x} ${y} L ${x - 9} ${y + 14} L ${x + 9} ${y + 14} Z" fill="none" stroke="#2c2c2c" stroke-width="1.5"/>` +
        `<line x1="${x - 13}" y1="${y + 14}" x2="${x + 13}" y2="${y + 14}" stroke="#2c2c2c" stroke-width="1.5"/>`
      );
    })
    .join('');

  const pins = drawn
    .map((joint) => {
      const [x, y] = at(joint);
      const input = (joint as RealJoint).input;
      return `<circle cx="${x}" cy="${y}" r="6" fill="${
        input ? '#ffca28' : '#fff8e1'
      }" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>`;
    })
    .join('');

  const labels = drawn
    .map((joint) => {
      const [x, y] = at(joint);
      return `<text x="${x + 9}" y="${y - 8}" font-size="13" font-weight="500" fill="#2c2c2c">${escapeXml(
        (joint as RealJoint).name || joint.id
      )}</text>`;
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Roboto, Helvetica, Arial, sans-serif">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    bars +
    grounds +
    pins +
    labels +
    `</svg>`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
