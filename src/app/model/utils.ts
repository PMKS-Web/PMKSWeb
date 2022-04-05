export class Utils {
}

export function roundNumber(num: number, scale: number): number {
  const tens = Math.pow(10, scale);
  return Math.round(num * tens) / tens;
}
