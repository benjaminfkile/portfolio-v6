import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  faceTargetQuaternion,
  letterTexture,
  rasterizeIcon,
  TEX_SIZE,
} from './SkillSphereCanvas';

// jsdom has no real 2D canvas, so we mock `getContext('2d')` and the global
// `Image`. These tests exercise the pure-ish rasterize pipeline offline: no
// network, no WebGL — only the draw calls we can assert against.

interface FakeCtx {
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
}

function makeCtx(): FakeCtx {
  return {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  };
}

// Behaviour knobs for the mocked Image, reset in afterEach.
let imageMode: 'load' | 'error' = 'load';
let naturalW = 48;
let naturalH = 48;

class MockImage {
  crossOrigin = '';
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    // Fire asynchronously, after the caller has attached its handlers.
    queueMicrotask(() => {
      if (imageMode === 'error') {
        this.onerror?.();
        return;
      }
      this.naturalWidth = naturalW;
      this.naturalHeight = naturalH;
      this.onload?.();
    });
  }
}

// Per-test factory so a test can inspect the exact ctx used, or return null to
// simulate a canvas that yields no 2D context.
let ctxFactory: () => FakeCtx | null = makeCtx;

beforeEach(() => {
  vi.stubGlobal('Image', MockImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctxFactory() as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  imageMode = 'load';
  naturalW = 48;
  naturalH = 48;
  ctxFactory = makeCtx;
});

describe('rasterizeIcon', () => {
  it('fills the opaque albedo ground and draws a contain-fit icon on success', async () => {
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    const canvas = await rasterizeIcon('https://cdn/react.svg', '#111');

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(TEX_SIZE);
    expect(canvas.height).toBe(TEX_SIZE);
    // Opaque edge-to-edge albedo ground — the disc shape lives in the tile's
    // CircleGeometry, never in a texture alpha edge (alpha edges bilinear-mix
    // with transparent-black texels and render as a ring around the icon).
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, TEX_SIZE, TEX_SIZE);
    // Icon drawn with an EXPLICIT destination size (the load-bearing fix).
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const [, , , dw, dh] = ctx.drawImage.mock.calls[0];
    expect(dw).toBeGreaterThan(0);
    expect(dh).toBeGreaterThan(0);
    // A square icon is drawn square.
    expect(dw).toBeCloseTo(dh);
  });

  it('contain-fits a wide wordmark shorter than it is wide', async () => {
    naturalW = 200;
    naturalH = 50;
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    await rasterizeIcon('https://cdn/aws.svg', '#111');

    const [, , , dw, dh] = ctx.drawImage.mock.calls[0];
    expect(dw).toBeGreaterThan(dh);
    expect(dw).toBeLessThanOrEqual(TEX_SIZE);
  });

  it('still rasterizes a size-less SVG (naturalWidth/Height 0) at full box', async () => {
    naturalW = 0;
    naturalH = 0;
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    await rasterizeIcon('https://cdn/express.svg', '#111');

    // No intrinsic size → fall back to a square draw with an explicit size,
    // never a zero-area upload.
    const [, , , dw, dh] = ctx.drawImage.mock.calls[0];
    expect(dw).toBeGreaterThan(0);
    expect(dh).toBeGreaterThan(0);
  });

  it('rejects on image load error (→ letter fallback)', async () => {
    imageMode = 'error';
    ctxFactory = () => makeCtx();

    await expect(
      rasterizeIcon('https://cdn/broken.svg', '#111'),
    ).rejects.toThrow(/icon load failed/);
  });

  it('rejects without throwing when no 2D context is available', async () => {
    ctxFactory = () => null;

    await expect(
      rasterizeIcon('https://cdn/react.svg', '#111'),
    ).rejects.toThrow(/context unavailable/);
  });

  it('rejects when drawImage throws (zero-area/broken decode)', async () => {
    const ctx = makeCtx();
    ctx.drawImage = vi.fn(() => {
      throw new Error('boom');
    });
    ctxFactory = () => ctx;

    await expect(
      rasterizeIcon('https://cdn/react.svg', '#111'),
    ).rejects.toThrow();
  });
});

describe('faceTargetQuaternion (Skills Console v1.9 rotate-to-target math)', () => {
  // The pure helper the canvas slerps toward: the group orientation that swings
  // a tile's outward normal to face the camera (+Z). Unit-tested here rather
  // than driving WebGL in jsdom (the facePlacements/pickDetail export pattern).
  const normals: Array<[number, number, number]> = [
    [0, 0, 1], // already facing the camera → identity
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0.5773, 0.5773, 0.5773],
    [-0.3, 0.7, 0.6481],
  ];

  it.each(normals)(
    'rotates the normal (%s, %s, %s) onto +Z',
    (x, y, z) => {
      const q = faceTargetQuaternion([x, y, z]);
      const v = new THREE.Vector3(x, y, z).normalize().applyQuaternion(q);
      expect(v.x).toBeCloseTo(0, 4);
      expect(v.y).toBeCloseTo(0, 4);
      expect(v.z).toBeCloseTo(1, 4);
    },
  );

  it('handles the antiparallel (-Z) normal without NaN, still landing on +Z', () => {
    const q = faceTargetQuaternion([0, 0, -1]);
    expect(Number.isNaN(q.x)).toBe(false);
    expect(q.length()).toBeCloseTo(1, 5);
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    expect(v.z).toBeCloseTo(1, 4);
  });

  it('returns a unit quaternion', () => {
    expect(faceTargetQuaternion([1, 2, 3]).length()).toBeCloseTo(1, 5);
  });
});

describe('letterTexture (shared albedo-ground fallback)', () => {
  it('fills the albedo ground and draws the initial, tagged sRGB', () => {
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    const tex = letterTexture('React', '#fff', '#111');

    // Same opaque-ground pipeline as a real icon.
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, TEX_SIZE, TEX_SIZE);
    // The uppercased initial, centred.
    expect(ctx.fillText).toHaveBeenCalledWith('R', TEX_SIZE / 2, TEX_SIZE / 2);
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
    tex.dispose();
  });

  it('falls back to "?" for a blank title without throwing', () => {
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    const tex = letterTexture('   ', '#fff', '#111');

    expect(ctx.fillText).toHaveBeenCalledWith('?', TEX_SIZE / 2, TEX_SIZE / 2);
    tex.dispose();
  });
});
