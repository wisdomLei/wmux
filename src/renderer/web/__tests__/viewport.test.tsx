// @vitest-environment jsdom
//
// The software keyboard must not re-grid the phone terminal. The app keeps the
// layout viewport's height and shifts up by the part the keyboard covers;
// feeding visualViewport.height into the app's height (the old behaviour)
// shrank the terminal box and made the whole terminal visibly smaller on
// every keystroke.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { keyboardOverlap, useWebViewportHeight } from '../viewport';

function Probe(): null {
  useWebViewportHeight(true);
  return null;
}

const css = () => document.documentElement.style;

describe('keyboardOverlap', () => {
  it('is the part of the screen the keyboard covers', () => {
    expect(keyboardOverlap(450, 0, 844)).toBe(394);
  });

  it('subtracts a visual viewport that has scrolled down', () => {
    expect(keyboardOverlap(450, 30, 844)).toBe(364);
  });

  it('never goes negative when nothing covers the app', () => {
    expect(keyboardOverlap(844, 0, 844)).toBe(0);
    expect(keyboardOverlap(900, 0, 844)).toBe(0);
  });

  it('ignores a nonsense measurement', () => {
    expect(keyboardOverlap(0, 0, 844)).toBe(0);
    expect(keyboardOverlap(450, 0, 0)).toBe(0);
  });
});

describe('useWebViewportHeight on a phone', () => {
  let listeners: Record<string, (() => void)[]>;
  let vv: { height: number; offsetTop: number; addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void };
  let root: Root;
  let host: HTMLDivElement;
  const oldInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const oldVv = Object.getOwnPropertyDescriptor(window, 'visualViewport');

  beforeEach(async () => {
    listeners = {};
    vv = {
      height: 844,
      offsetTop: 0,
      addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
      removeEventListener: (n, f) => { listeners[n] = (listeners[n] ?? []).filter((x) => x !== f); },
    };
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (oldInnerHeight) Object.defineProperty(window, 'innerHeight', oldInnerHeight);
    if (oldVv) Object.defineProperty(window, 'visualViewport', oldVv);
    else Reflect.deleteProperty(window, 'visualViewport');
  });

  const fire = (name: string) => { for (const f of listeners[name] ?? []) f(); };

  it('uses the layout height, not the visual one', () => {
    expect(css().getPropertyValue('--web-viewport-height')).toBe('844px');
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('');
  });

  it('keeps the height and only shifts up when the keyboard opens', async () => {
    vv.height = 450;
    await act(async () => fire('resize'));
    expect(css().getPropertyValue('--web-viewport-height')).toBe('844px');
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('394px');
  });

  it('follows the keyboard as it moves and clears when it closes', async () => {
    vv.height = 450;
    await act(async () => fire('resize'));
    vv.height = 480;
    vv.offsetTop = 20;
    await act(async () => fire('scroll'));
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('344px');
    vv.height = 844;
    vv.offsetTop = 0;
    await act(async () => fire('resize'));
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('');
  });

  it('a real window resize changes the app height, unlike the keyboard', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    vv.height = 390;
    await act(async () => fire('resize'));
    expect(css().getPropertyValue('--web-viewport-height')).toBe('390px');
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('');
  });

  it('removes both variables on unmount', () => {
    act(() => root.unmount());
    expect(css().getPropertyValue('--web-viewport-height')).toBe('');
    expect(css().getPropertyValue('--web-keyboard-inset')).toBe('');
    root = createRoot(host);
  });
});
