/**
 * Adapted from vgpu “Triangle LED Hero”
 * https://vgpu.sh/examples/triangle-led-front (MIT — vercel-labs/vgpu)
 *
 * Demo lil-gui stripped; softFail for marketing embed.
 */
import { clock, frameLoop, surface, type Gpu, type Surface } from "vgpu";
import { createHeroRenderer, type HeroRenderer } from "./scene-renderer";
import { type RenderSize } from "./settings";
import { heroStateForActiveClick } from "./sim-sizing";
import {
  DEFAULT_TRIANGLE_LED_CONTROLS,
  isTriangleLedMode,
  type TriangleLedControls,
} from "./types";

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly initialControls?: Readonly<TriangleLedControls>;
  /** Dispose quietly instead of throwing (page background). */
  readonly softFail?: boolean;
}

export function createRenderer(options: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let canvasSurface: Surface | undefined;
  let scene: HeroRenderer | undefined;
  let loop: { stop(): void } | undefined;
  let observer: ResizeObserver | undefined;
  let resizeFrame = 0;
  let resizeGeneration = 0;
  let pendingSize: RenderSize | undefined;
  let lastDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const initialMode = options.initialControls?.mode ?? DEFAULT_TRIANGLE_LED_CONTROLS.mode;
  let mode = isTriangleLedMode(initialMode) ? initialMode : DEFAULT_TRIANGLE_LED_CONTROLS.mode;
  const softFail = options.softFail ?? false;

  const fail = (error: unknown): never | void => {
    dispose();
    if (softFail) return;
    throw error;
  };

  const applyResize = () => {
    resizeFrame = 0;
    const size = pendingSize;
    pendingSize = undefined;
    if (disposed || !size || !scene || !canvasSurface) return;
    const generation = ++resizeGeneration;
    try {
      scene.rebuild({ width: size.width, height: size.height, dpr: canvasSurface.dpr });
      scene.setOutputTarget(canvasSurface);
      void scene.prewarm().catch((error: unknown) => {
        if (disposed || generation !== resizeGeneration) return;
        fail(error);
      });
    } catch (error) {
      if (disposed || generation !== resizeGeneration) return;
      fail(error);
    }
  };

  const resize = (size: RenderSize) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    pendingSize = size;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
  };

  const measure = () => {
    const rect = options.canvas.getBoundingClientRect();
    resize({ width: rect.width, height: rect.height });
  };

  const onWindowResize = () => {
    if (window.devicePixelRatio === lastDpr) return;
    lastDpr = window.devicePixelRatio;
    measure();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    resizeGeneration++;
    loop?.stop();
    loop = undefined;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    pendingSize = undefined;
    observer?.disconnect();
    observer = undefined;
    if (typeof window !== "undefined") window.removeEventListener("resize", onWindowResize);
    scene?.destroy();
    scene = undefined;
    canvasSurface?.dispose();
    canvasSurface = undefined;
    gpu?.dispose();
    gpu = undefined;
  };

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    canvasSurface = surface(gpu, options.canvas, { dpr: [1, 2] });
    const nextScene = createHeroRenderer(gpu, {
      theme: "dark",
      css: cssSizeOf(options.canvas, canvasSurface.dpr),
    });
    scene = nextScene;
    nextScene.setOutputTarget(canvasSurface);
    nextScene.setHero(heroStateForActiveClick(mode));
    await nextScene.prewarm();
    if (disposed) {
      nextScene.destroy();
      return;
    }
    observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(options.canvas);
    window.addEventListener("resize", onWindowResize);
    measure();
    const time = clock(gpu);
    loop = frameLoop(gpu, (currentFrame) => {
      if (disposed || !scene || !gpu) return;
      scene.setRgbDeployActive(false);
      scene.renderFrame(currentFrame, { time: time.time, dt: time.deltaTime });
    });
  };

  const ready = initialize().catch((error: unknown) => {
    if (!disposed) fail(error);
    throw error;
  });

  return {
    ready,
    setControls: (next: Readonly<TriangleLedControls>) => {
      if (disposed || !isTriangleLedMode(next.mode) || next.mode === mode) return;
      mode = next.mode;
      scene?.setHero(heroStateForActiveClick(mode));
    },
    resize,
    dispose,
  };
}

function cssSizeOf(canvas: HTMLCanvasElement, dpr: Surface["dpr"]) {
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || canvas.clientWidth || canvas.width / dpr),
    height: Math.max(1, rect.height || canvas.clientHeight || canvas.height / dpr),
    dpr,
  };
}
