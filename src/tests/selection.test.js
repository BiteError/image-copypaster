import { expect, test, describe } from 'vitest'
import Selection from '../selection.js'
import { create_solid_bitmap } from './test_helpers.js'

const BLACK = { r: 0, g: 0, b: 0 };

function makeMarquee(x = 20, y = 20, w = 40, h = 40, type = 'rect') {
  return new Selection({ x, y, w, h, type });
}

async function makeFloating(x = 20, y = 20, w = 40, h = 40, type = 'rect') {
  const sel = makeMarquee(x, y, w, h, type);
  const original = await create_solid_bitmap(w, h, BLACK);
  sel.enterFloating(original);
  return sel;
}

describe('construction', () => {
  test('starts as marquee: no original, no rotation/flip, given bounds/shape', () => {
    const sel = makeMarquee(10, 20, 30, 40, 'ellipse');

    expect(sel.bounds()).toStrictEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(sel.type).toBe('ellipse');
    expect(sel.original).toBeNull();
    expect(sel.isFloating).toBe(false);
    expect(sel.rotation).toBe(0);
    expect(sel.flipH).toBe(false);
    expect(sel.flipV).toBe(false);
  });
});

describe('contains', () => {
  test('true for coords inside the bounds, including edges', () => {
    const sel = makeMarquee(10, 10, 20, 20);

    expect(sel.contains({ x: 10, y: 10 })).toBe(true);
    expect(sel.contains({ x: 30, y: 30 })).toBe(true);
    expect(sel.contains({ x: 20, y: 20 })).toBe(true);
  });

  test('false for coords outside the bounds', () => {
    const sel = makeMarquee(10, 10, 20, 20);

    expect(sel.contains({ x: 9, y: 15 })).toBe(false);
    expect(sel.contains({ x: 31, y: 15 })).toBe(false);
  });
});

describe('move / nudge', () => {
  test('move translates x/y by dx/dy', () => {
    const sel = makeMarquee(10, 10, 20, 20);

    sel.move(5, -3);

    expect(sel.bounds()).toMatchObject({ x: 15, y: 7 });
  });

  test('nudge moves by step in the given direction', () => {
    const sel = makeMarquee(10, 10, 20, 20);

    sel.nudge('right', 1);
    sel.nudge('down', 1);
    expect(sel.bounds()).toMatchObject({ x: 11, y: 11 });

    sel.nudge('left', 5);
    sel.nudge('up', 5);
    expect(sel.bounds()).toMatchObject({ x: 6, y: 6 });
  });
});

describe('rotate / flip', () => {
  test('rotate cw/ccw cycles through 0/90/180/270', () => {
    const sel = makeMarquee();

    sel.rotate('cw');
    expect(sel.rotation).toBe(90);
    sel.rotate('cw');
    expect(sel.rotation).toBe(180);
    sel.rotate('ccw');
    expect(sel.rotation).toBe(90);
  });

  test('flip toggles flipH/flipV independently', () => {
    const sel = makeMarquee();

    sel.flip('h');
    expect(sel.flipH).toBe(true);
    expect(sel.flipV).toBe(false);

    sel.flip('v');
    expect(sel.flipV).toBe(true);

    sel.flip('h');
    expect(sel.flipH).toBe(false);
  });

  test('rotate/flip work the same whether marquee or floating', async () => {
    const sel = await makeFloating();

    sel.rotate('cw');
    sel.flip('h');

    expect(sel.rotation).toBe(90);
    expect(sel.flipH).toBe(true);
  });
});

describe('entering/exiting floating', () => {
  test('enterFloating loads the original bitmap and flips isFloating to true', async () => {
    const sel = makeMarquee(10, 10, 30, 30);
    const original = await create_solid_bitmap(30, 30, BLACK);

    sel.enterFloating(original);

    expect(sel.isFloating).toBe(true);
    expect(sel.original).toBe(original);
    expect(sel.rotation).toBe(0);
    expect(sel.flipH).toBe(false);
    expect(sel.flipV).toBe(false);
  });

  test('loadOriginal loads a bitmap and resets transform without snapshotting for cancel', async () => {
    const sel = makeMarquee(10, 10, 30, 30);
    sel.rotate('cw'); // pre-existing transform state, should be reset by loadOriginal
    const original = await create_solid_bitmap(30, 30, BLACK);

    sel.loadOriginal(original);

    expect(sel.isFloating).toBe(true);
    expect(sel.rotation).toBe(0);
  });

  test('exitFloating clears original/transform but keeps the current bounds/shape', async () => {
    const sel = await makeFloating(10, 10, 30, 30, 'ellipse');
    sel.move(5, 5);
    sel.rotate('cw');

    sel.exitFloating();

    expect(sel.isFloating).toBe(false);
    expect(sel.original).toBeNull();
    expect(sel.rotation).toBe(0);
    expect(sel.bounds()).toStrictEqual({ x: 15, y: 15, w: 30, h: 30 });
    expect(sel.type).toBe('ellipse');
  });

  test('cancelFloating restores the pre-paste bounds/shape snapshotted by enterFloating', async () => {
    const sel = makeMarquee(10, 10, 30, 30, 'rect');
    const original = await create_solid_bitmap(30, 30, BLACK);
    sel.enterFloating(original);
    sel.move(50, 50);
    sel.rotate('cw');

    sel.cancelFloating();

    expect(sel.isFloating).toBe(false);
    expect(sel.bounds()).toStrictEqual({ x: 10, y: 10, w: 30, h: 30 });
    expect(sel.type).toBe('rect');
    expect(sel.rotation).toBe(0);
  });
});

describe('preview', () => {
  test('resizes to the current w/h without mutating the original bitmap', async () => {
    const original = await create_solid_bitmap(50, 50, BLACK);
    const sel = makeMarquee(0, 0, 50, 50);
    sel.loadOriginal(original);
    sel.w = 20;
    sel.h = 10;

    const preview = sel.preview();

    expect(preview.width).toBe(20);
    expect(preview.height).toBe(10);
    expect(sel.original.width).toBe(50);
    expect(sel.original.height).toBe(50);
  });

  test('masks corners transparent for shape:"ellipse"', async () => {
    const original = await create_solid_bitmap(100, 100, BLACK);
    const sel = makeMarquee(0, 0, 100, 100, 'ellipse');
    sel.loadOriginal(original);

    const data = sel.preview().data();

    expect(data[3]).toBe(0); // corner (0,0), outside the ellipse
    const centerIdx = (50 * 100 + 50) * 4;
    expect(data[centerIdx + 3]).toBe(255); // center, inside the ellipse
  });

  test('leaves corners opaque for shape:"rect"', async () => {
    const original = await create_solid_bitmap(20, 20, BLACK);
    const sel = makeMarquee(0, 0, 20, 20, 'rect');
    sel.loadOriginal(original);

    expect(sel.preview().data()[3]).toBe(255);
  });

  test('repeated calls with the same rotation produce identical results (no cumulative loss)', async () => {
    const sel = await makeFloating();
    sel.rotate('cw');

    const first = Array.from(sel.preview().data());
    const second = Array.from(sel.preview().data());

    expect(first).toStrictEqual(second);
  });
});

describe('resize gestures (beginResize/applyDrag)', () => {
  // default selection box: x20 y20 w40 h40
  test('dragging a corner handle resizes both axes, anchored at the opposite corner', () => {
    const sel = makeMarquee(); // se handle at (60,60)
    sel.beginResize('se');

    sel.applyDrag({ x: 80, y: 70 });

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 60, h: 50 });
  });

  test('dragging an edge handle resizes only its single axis', () => {
    const sel = makeMarquee(); // e handle at (60,40)
    sel.beginResize('e');

    sel.applyDrag({ x: 90, y: 999 }); // y ignored: e handle is horizontal-only

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 70, h: 40 });
  });

  test('lockAspect locks the aspect ratio while resizing from a corner', () => {
    const sel = makeMarquee(); // square 40x40, se handle at (60,60)
    sel.beginResize('se');

    sel.applyDrag({ x: 100, y: 40 }, true); // raw would be 80x20

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 80, h: 80 });
  });

  test('resize is unconstrained without lockAspect', () => {
    const sel = makeMarquee();
    sel.beginResize('se');

    sel.applyDrag({ x: 100, y: 40 });

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 80, h: 20 });
  });

  test('dragging a corner past the opposite corner flips through without erroring or zero size', () => {
    const sel = makeMarquee(); // nw handle at (20,20), anchor (se) at (60,60)
    sel.beginResize('nw');

    expect(() => sel.applyDrag({ x: 80, y: 80 })).not.toThrow();

    expect(sel.bounds()).toMatchObject({ x: 60, y: 60, w: 20, h: 20 });
    expect(sel.flipH).toBe(true);
    expect(sel.flipV).toBe(true);
  });

  test('endDrag clears the gesture so a further applyDrag is a no-op', () => {
    const sel = makeMarquee();
    sel.beginResize('se');
    sel.endDrag();

    sel.applyDrag({ x: 999, y: 999 });

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 40, h: 40 });
  });
});

describe('move gesture (beginMove/applyDrag)', () => {
  test('dragging moves the selection by the delta from the drag start', () => {
    const sel = makeMarquee();
    sel.beginMove({ x: 40, y: 40 }); // center, well clear of any handle

    sel.applyDrag({ x: 50, y: 55 });

    expect(sel.bounds()).toMatchObject({ x: 30, y: 35, w: 40, h: 40 });
  });

  test('applyDrag before any gesture has begun is a no-op', () => {
    const sel = makeMarquee();

    sel.applyDrag({ x: 999, y: 999 });

    expect(sel.bounds()).toMatchObject({ x: 20, y: 20, w: 40, h: 40 });
  });
});
