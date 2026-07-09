import { expect, test, describe } from 'vitest'
import FloatingLayer from '../floating_layer.js'
import { create_solid_bitmap } from './test_helpers.js'

const BLACK = { r: 0, g: 0, b: 0 };

async function makeLayer(x = 20, y = 20, w = 40, h = 40, shape = 'rect') {
  const original = await create_solid_bitmap(w, h, BLACK);
  return new FloatingLayer(original, { x, y, w, h }, shape);
}

describe('construction', () => {
  test('starts with no rotation, no flip, and the given bounds/shape', async () => {
    const fl = await makeLayer(10, 20, 30, 40, 'ellipse');

    expect(fl.bounds()).toStrictEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(fl.shape).toBe('ellipse');
    expect(fl.flipH).toBe(false);
    expect(fl.flipV).toBe(false);
  });
});

describe('contains', () => {
  test('true for coords inside the bounds, including edges', async () => {
    const fl = await makeLayer(10, 10, 20, 20);

    expect(fl.contains({ x: 10, y: 10 })).toBe(true);
    expect(fl.contains({ x: 30, y: 30 })).toBe(true);
    expect(fl.contains({ x: 20, y: 20 })).toBe(true);
  });

  test('false for coords outside the bounds', async () => {
    const fl = await makeLayer(10, 10, 20, 20);

    expect(fl.contains({ x: 9, y: 15 })).toBe(false);
    expect(fl.contains({ x: 31, y: 15 })).toBe(false);
  });
});

describe('move / nudge', () => {
  test('move translates x/y by dx/dy', async () => {
    const fl = await makeLayer(10, 10, 20, 20);

    fl.move(5, -3);

    expect(fl.bounds()).toMatchObject({ x: 15, y: 7 });
  });

  test('nudge moves by step in the given direction', async () => {
    const fl = await makeLayer(10, 10, 20, 20);

    fl.nudge('right', 1);
    fl.nudge('down', 1);
    expect(fl.bounds()).toMatchObject({ x: 11, y: 11 });

    fl.nudge('left', 5);
    fl.nudge('up', 5);
    expect(fl.bounds()).toMatchObject({ x: 6, y: 6 });
  });
});

describe('rotate / flip', () => {
  test('rotate cw/ccw cycles through 0/90/180/270', async () => {
    const fl = await makeLayer();

    fl.rotate('cw');
    expect(fl.rotation).toBe(90);
    fl.rotate('cw');
    expect(fl.rotation).toBe(180);
    fl.rotate('ccw');
    expect(fl.rotation).toBe(90);
  });

  test('flip toggles flipH/flipV independently', async () => {
    const fl = await makeLayer();

    fl.flip('h');
    expect(fl.flipH).toBe(true);
    expect(fl.flipV).toBe(false);

    fl.flip('v');
    expect(fl.flipV).toBe(true);

    fl.flip('h');
    expect(fl.flipH).toBe(false);
  });
});

describe('preview', () => {
  test('resizes to the current w/h without mutating the original bitmap', async () => {
    const original = await create_solid_bitmap(50, 50, BLACK);
    const fl = new FloatingLayer(original, { x: 0, y: 0, w: 50, h: 50 }, 'rect');
    fl.w = 20;
    fl.h = 10;

    const preview = fl.preview();

    expect(preview.width).toBe(20);
    expect(preview.height).toBe(10);
    expect(fl.original.width).toBe(50);
    expect(fl.original.height).toBe(50);
  });

  test('masks corners transparent for shape:"ellipse"', async () => {
    const original = await create_solid_bitmap(100, 100, BLACK);
    const fl = new FloatingLayer(original, { x: 0, y: 0, w: 100, h: 100 }, 'ellipse');

    const data = fl.preview().data();

    expect(data[3]).toBe(0); // corner (0,0), outside the ellipse
    const centerIdx = (50 * 100 + 50) * 4;
    expect(data[centerIdx + 3]).toBe(255); // center, inside the ellipse
  });

  test('leaves corners opaque for shape:"rect"', async () => {
    const original = await create_solid_bitmap(20, 20, BLACK);
    const fl = new FloatingLayer(original, { x: 0, y: 0, w: 20, h: 20 }, 'rect');

    expect(fl.preview().data()[3]).toBe(255);
  });

  test('repeated calls with the same rotation produce identical results (no cumulative loss)', async () => {
    const fl = await makeLayer();
    fl.rotate('cw');

    const first = Array.from(fl.preview().data());
    const second = Array.from(fl.preview().data());

    expect(first).toStrictEqual(second);
  });
});

describe('resize gestures (beginResize/applyDrag)', () => {
  // default layer box: x20 y20 w40 h40
  test('dragging a corner handle resizes both axes, anchored at the opposite corner', async () => {
    const fl = await makeLayer(); // se handle at (60,60)
    fl.beginResize('se');

    fl.applyDrag({ x: 80, y: 70 });

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 60, h: 50 });
  });

  test('dragging an edge handle resizes only its single axis', async () => {
    const fl = await makeLayer(); // e handle at (60,40)
    fl.beginResize('e');

    fl.applyDrag({ x: 90, y: 999 }); // y ignored: e handle is horizontal-only

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 70, h: 40 });
  });

  test('lockAspect locks the aspect ratio while resizing from a corner', async () => {
    const fl = await makeLayer(); // square 40x40, se handle at (60,60)
    fl.beginResize('se');

    fl.applyDrag({ x: 100, y: 40 }, true); // raw would be 80x20

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 80, h: 80 });
  });

  test('resize is unconstrained without lockAspect', async () => {
    const fl = await makeLayer();
    fl.beginResize('se');

    fl.applyDrag({ x: 100, y: 40 });

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 80, h: 20 });
  });

  test('dragging a corner past the opposite corner flips through without erroring or zero size', async () => {
    const fl = await makeLayer(); // nw handle at (20,20), anchor (se) at (60,60)
    fl.beginResize('nw');

    expect(() => fl.applyDrag({ x: 80, y: 80 })).not.toThrow();

    expect(fl.bounds()).toMatchObject({ x: 60, y: 60, w: 20, h: 20 });
    expect(fl.flipH).toBe(true);
    expect(fl.flipV).toBe(true);
  });

  test('endDrag clears the gesture so a further applyDrag is a no-op', async () => {
    const fl = await makeLayer();
    fl.beginResize('se');
    fl.endDrag();

    fl.applyDrag({ x: 999, y: 999 });

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 40, h: 40 });
  });
});

describe('move gesture (beginMove/applyDrag)', () => {
  test('dragging moves the layer by the delta from the drag start', async () => {
    const fl = await makeLayer();
    fl.beginMove({ x: 40, y: 40 }); // center, well clear of any handle

    fl.applyDrag({ x: 50, y: 55 });

    expect(fl.bounds()).toMatchObject({ x: 30, y: 35, w: 40, h: 40 });
  });

  test('applyDrag before any gesture has begun is a no-op', async () => {
    const fl = await makeLayer();

    fl.applyDrag({ x: 999, y: 999 });

    expect(fl.bounds()).toMatchObject({ x: 20, y: 20, w: 40, h: 40 });
  });
});
