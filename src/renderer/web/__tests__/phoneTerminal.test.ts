import { describe, it, expect } from 'vitest';
import {
  PHONE_CELL_HEIGHT_RATIO,
  PHONE_CELL_WIDTH_RATIO,
  PHONE_MIN_READABLE_CELL,
  PHONE_TERMINAL_FONT,
  needsReadablePan,
  phoneTerminalGrid,
  readableSurfaceWidth,
} from '../phoneTerminal';

describe('phoneTerminalGrid', () => {
  it('asks for a readable phone grid, not the desk width', () => {
    // A 390 x 844 phone: the pane's own box is smaller than the screen, and the
    // numbers must come from the box, never the viewport.
    const grid = phoneTerminalGrid(364, 692);
    expect(grid).not.toBeNull();
    expect(grid!.cols).toBeGreaterThanOrEqual(40);
    expect(grid!.cols).toBeLessThanOrEqual(60);
    expect(grid!.rows).toBeGreaterThanOrEqual(30);
    // Every requested cell fits the box at the target font.
    expect(grid!.cols * PHONE_TERMINAL_FONT * PHONE_CELL_WIDTH_RATIO).toBeLessThanOrEqual(364 - 24);
    expect(grid!.rows * PHONE_TERMINAL_FONT * PHONE_CELL_HEIGHT_RATIO).toBeLessThanOrEqual(692 - 8);
  });

  it('keeps the contract floor on a narrow screen', () => {
    expect(phoneTerminalGrid(120, 300)?.cols).toBe(40);
    expect(phoneTerminalGrid(1000, 60)?.rows).toBe(8);
  });

  it('caps a tablet-sized box instead of requesting a desk-sized grid', () => {
    const grid = phoneTerminalGrid(1600, 2000);
    expect(grid?.cols).toBe(120);
    expect(grid?.rows).toBe(100);
  });

  it('answers nothing for a box that is not laid out yet', () => {
    expect(phoneTerminalGrid(0, 800)).toBeNull();
    expect(phoneTerminalGrid(390, 0)).toBeNull();
    expect(phoneTerminalGrid(40, 30)).toBeNull();
  });
});

describe('desk-owned pan', () => {
  it('pans a desk grid instead of shrinking it to an unreadable font', () => {
    // A 390px phone and a 151-column desk pane: 2.6px per column.
    expect(needsReadablePan(151, 390)).toBe(true);
    expect(390 / 151).toBeLessThan(PHONE_MIN_READABLE_CELL);
    // The grid the phone itself asks for still fits.
    expect(needsReadablePan(46, 390)).toBe(false);
  });

  it('draws the panned surface at the target font', () => {
    const width = readableSurfaceWidth(151);
    expect(width).toBeGreaterThan(390);
    expect(width).toBeGreaterThanOrEqual(151 * PHONE_TERMINAL_FONT * PHONE_CELL_WIDTH_RATIO);
  });

  it('answers nothing for unmeasured values', () => {
    expect(needsReadablePan(0, 390)).toBe(false);
    expect(needsReadablePan(151, 0)).toBe(false);
  });
});
