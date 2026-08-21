import { drawingScreenBox, fitsInside, freeCanvasRect, sameRect } from './view-framing';

/** A stand-in for an element, since only its client rect is ever asked for. */
function card(edge: string, box: [number, number, number, number]) {
  const [x, y, width, height] = box;
  return {
    dataset: { canvasInset: edge },
    getBoundingClientRect: () => ({
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
    }),
  } as unknown as HTMLElement;
}

function canvasOf(width: number, height: number) {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height, width, height }),
  } as unknown as Element;
}

function docWith(
  cards: HTMLElement[],
  layers: Record<string, [number, number, number, number]> = {}
) {
  return {
    querySelectorAll: () => ({ forEach: (fn: (c: HTMLElement) => void) => cards.forEach(fn) }),
    getElementById: (id: string) => {
      const box = layers[id];
      if (!box) return null;
      const [x, y, width, height] = box;
      return {
        getBoundingClientRect: () => ({
          left: x,
          top: y,
          right: x + width,
          bottom: y + height,
          width,
          height,
        }),
      } as unknown as HTMLElement;
    },
  } as unknown as Document;
}

describe('freeCanvasRect', () => {
  it('takes the edge each card hugs off the canvas', () => {
    const free = freeCanvasRect(
      canvasOf(1512, 900),
      docWith([
        card('left', [0, 56, 278, 304]),
        card('top', [12, 12, 1488, 48]),
        card('bottom', [0, 802, 1512, 60]),
        card('bottom', [0, 874, 1512, 26]),
      ])
    );
    expect(free).toEqual({ x: 278, y: 60, width: 1234, height: 742 });
  });

  it('ignores a panel parked off the canvas', () => {
    // A closed left panel is animated out to the left, and a closed drawer past
    // the right edge; neither is standing on anything.
    const free = freeCanvasRect(
      canvasOf(1512, 900),
      docWith([card('left', [-278, 56, 278, 304]), card('right', [1536, 56, 329, 400])])
    );
    expect(free).toEqual({ x: 0, y: 0, width: 1512, height: 900 });
  });

  it('falls back to the whole canvas when the chrome leaves no room', () => {
    const free = freeCanvasRect(canvasOf(400, 900), docWith([card('left', [0, 0, 320, 900])]));
    expect(free).toEqual({ x: 0, y: 0, width: 400, height: 900 });
  });
});

describe('drawingScreenBox', () => {
  it('unions the layers that have ink in them', () => {
    const box = drawingScreenBox(
      ['linkHolder', 'jointHolder', 'pathsHolder'],
      docWith([], {
        linkHolder: [100, 200, 300, 100],
        jointHolder: [90, 190, 320, 130],
      })
    );
    expect(box).toEqual({ x: 90, y: 190, width: 320, height: 130 });
  });

  it('leaves an empty holder out rather than dragging the box to the origin', () => {
    const box = drawingScreenBox(
      ['linkHolder', 'pathsHolder'],
      docWith([], {
        linkHolder: [400, 400, 100, 100],
        pathsHolder: [0, 0, 0, 0],
      })
    );
    expect(box).toEqual({ x: 400, y: 400, width: 100, height: 100 });
  });

  it('is null when nothing is drawn', () => {
    expect(drawingScreenBox(['linkHolder'], docWith([]))).toBeNull();
  });
});

describe('fitsInside', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  it('accepts a box within the bounds', () => {
    expect(fitsInside({ x: 10, y: 10, width: 50, height: 50 }, outer)).toBe(true);
  });

  it('rejects one that hangs out further than the slack allows', () => {
    expect(fitsInside({ x: -20, y: 10, width: 50, height: 50 }, outer, 8)).toBe(false);
    expect(fitsInside({ x: -4, y: 10, width: 50, height: 50 }, outer, 8)).toBe(true);
  });
});

describe('sameRect', () => {
  it('reads a sub-pixel difference as no movement', () => {
    expect(
      sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 0.4, y: 0, width: 10, height: 10 })
    ).toBe(true);
    expect(
      sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 3, y: 0, width: 10, height: 10 })
    ).toBe(false);
  });

  it('treats a missing rect as different from a present one', () => {
    expect(sameRect(null, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
  });
});
