/**
 * Browser-build stand-in for `@xterm/addon-webgl` (vite.web.config.ts).
 *
 * The WebGL renderer painted an empty canvas in the browser build: at phone
 * widths, and at any device pixel ratio above 1, the pane kept its background
 * but no glyphs ever appeared. xterm's DOM renderer draws the same buffer
 * correctly in those conditions and is what the web page can rely on; it is
 * slower, but the page holds at most WEB_LIVE_STREAM_CAP live streams.
 *
 * Throwing from the constructor is the failure path useTerminal already
 * handles: it keeps the DOM renderer and stops the first-resize gate from
 * waiting for a renderer that is never coming. The desktop build imports the
 * real addon and is untouched.
 */
export class WebglAddon {
  constructor() {
    throw new Error('WebGL renderer is disabled in the browser build');
  }
}
