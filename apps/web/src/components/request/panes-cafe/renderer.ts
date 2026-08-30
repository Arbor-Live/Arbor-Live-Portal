import {
  effect,
  frameLoop,
  init,
  surface,
  type Effect,
  type Gpu,
  type Surface,
} from "vgpu";

import panesCafeWgsl from "./panes-cafe.wgsl";

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** When true, dispose quietly instead of throwing (used as page background). */
  readonly softFail?: boolean;
  /** Called when a runtime failure disposes the renderer after ready resolved. */
  readonly onFail?: () => void;
}

export function createRenderer({
  canvas,
  softFail = false,
  onFail,
}: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let scene: Effect | undefined;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    try {
      gpu?.dispose();
    } catch {
      // Teardown must not mask the original failure.
    }
  }

  function fail(error: unknown): void {
    try {
      dispose();
    } catch {
      // Teardown must not mask the original failure.
    }
    if (!softFail) {
      throw error;
    }
    onFail?.();
  }

  const initialize = async () => {
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    gpu = nextGpu;
    output = surface(gpu, canvas, { dpr: [1, 1.6] });
    scene = effect(gpu, panesCafeWgsl, {
      label: "panes-cafe",
      set: { u: { time: 0, w: 1, h: 1, aspect: 1 } },
    });

    // Wall-clock from the first rendered frame — avoids a large vgpu clock delta
    // after async init, which made early bokeh wraps pop on screen.
    let startMs: number | undefined;
    frameLoop(gpu, (currentFrame) => {
      if (disposed || !output || !scene) return;
      try {
        const [w, h] = output.size;
        if (w < 2 || h < 2) return;

        const nowMs = performance.now();
        if (startMs === undefined) startMs = nowMs;
        const elapsed = (nowMs - startMs) / 1000;

        scene.set({ u: { time: elapsed, w, h, aspect: w / h } });
        currentFrame.pass(output, scene);
      } catch (error) {
        fail(error);
      }
    });
  };

  const ready = initialize().catch((error: unknown) => {
    if (!disposed) fail(error);
    throw error;
  });

  return { ready, dispose };
}
