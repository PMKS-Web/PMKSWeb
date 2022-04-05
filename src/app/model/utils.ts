export class Utils {
}

export function roundNumber(num: number, scale: number): number {
  return Math.round(num * 10000) / 10000;
}
