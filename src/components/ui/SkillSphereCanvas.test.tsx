import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { letterTexture, rasterizeIcon, TEX_SIZE } from './SkillSphereCanvas';

// jsdom has no real 2D canvas, so we mock `getContext('2d')` and the global
// `Image`. These tests exercise the pure-ish rasterize pipeline offline: no
// network, no WebGL — only the draw calls we can assert against.

interface FakeCtx {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

function makeCtx(): FakeCtx {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
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
  it('fills the face-albedo disc and draws a contain-fit icon on success', async () => {
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    const canvas = await rasterizeIcon('https://cdn/react.svg', '#111');

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(TEX_SIZE);
    expect(canvas.height).toBe(TEX_SIZE);
    // Albedo disc: filled circle, NO stroke — the disc must be
    // indistinguishable from the facet it sits on.
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
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

describe('letterTexture (shared albedo-disc fallback)', () => {
  it('fills the albedo disc and draws the initial, tagged sRGB', () => {
    const ctx = makeCtx();
    ctxFactory = () => ctx;

    const tex = letterTexture('React', '#fff', '#111');

    // Same disc pipeline as a real icon — fill only, no stroke.
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
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
