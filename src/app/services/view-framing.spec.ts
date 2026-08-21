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
    querySelectorAll: () => cards,
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

  it('goes below a panel that leaves no room beside it', () => {
    // A phone-shape window: the panel takes most of the width and hangs from
    // the top, so the drawing belongs under it rather than in the sliver beside
    // it -- and certainly rather than behind it, which is what framing to the
    // whole window would do.
    const free = freeCanvasRect(
      canvasOf(420, 760),
      docWith([card('left', [0, 56, 396, 192]), card('top', [0, 0, 420, 60])])
    );
    expect(free).toEqual({ x: 0, y: 248, width: 420, height: 512 });
  });

  it('stays beside a panel whenever there is room beside it', () => {
    // The ordinary desktop case: below the panel would be the larger rectangle
    // by area on some windows, and beside it is still what a reader expects.
    const free = freeCanvasRect(
      canvasOf(1000, 900),
      docWith([card('left', [0, 56, 428, 192]), card('top', [0, 0, 1000, 60])])
    );
    expect(free).toEqual({ x: 428, y: 60, width: 572, height: 840 });
  });

  it('clears the bottom of a panel that hangs from the bottom', () => {
    const free = freeCanvasRect(canvasOf(420, 700), docWith([card('left', [0, 460, 396, 240])]));
    expect(free).toEqual({ x: 0, y: 0, width: 420, height: 460 });
  });

  it('frames into the band between the strips in a window with almost no height', () => {
    // Short enough that the strips nearly meet, but the band between them is
    // still somewhere a drawing can be seen -- and the panel clearance it has
    // plenty of room for is worth keeping either way.
    const free = freeCanvasRect(
      canvasOf(1200, 260),
      docWith([
        card('left', [0, 0, 278, 260]),
        card('top', [0, 0, 1200, 60]),
        card('bottom', [0, 160, 1200, 100]),
      ])
    );
    expect(free).toEqual({ x: 278, y: 60, width: 922, height: 100 });
  });

  it('draws through the strips when they leave no band at all', () => {
    const free = freeCanvasRect(
      canvasOf(1200, 90),
      docWith([card('top', [0, 0, 1200, 60]), card('bottom', [0, 40, 1200, 50])])
    );
    expect(free).toEqual({ x: 0, y: 0, width: 1200, height: 90 });
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
