import turnoutCrowdWgsl from "./turnout-crowd.wgsl";
import { GPU_DANCE_MAX } from "./turnout-layout";

type CrowdRendererOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly softFail?: boolean;
};

export type CrowdRenderState = {
  count: number;
  energy: number;
  animate: boolean;
  height: number;
};

const DEFAULT_WIDTH = 320;
const TRANSPARENT_CLEAR = [0, 0, 0, 0] as const;

export function createCrowdRenderer({ canvas, softFail = false }: CrowdRendererOptions) {
  let disposed = false;
  let failed = false;
  let mode: "webgpu" | "none" = "none";
  let state: CrowdRenderState = { count: 0, energy: 1, animate: true, height: 120 };
  let width = DEFAULT_WIDTH;
  let disposeGpu: (() => void) | undefined;
  let webGpuInstances = 0;

  const applyCanvasSize = () => {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${state.height}px`;
  };

  const crowdUniforms = (next: CrowdRenderState, time: number) => ({
    resolution: [width, next.height] as [number, number],
    time,
    energy: next.energy,
    animate: next.animate ? 1 : 0,
    count: next.count,
    danceMax: GPU_DANCE_MAX,
  });

  const setState = (next: CrowdRenderState) => {
    state = next;
    applyCanvasSize();
    webGpuInstances = Math.max(0, next.count);
  };

  const initializeWebGpu = async () => {
    const { clock, draw, frameLoop: gpuFrameLoop, init, surface } = await import("vgpu");
    if (disposed) return;
    const gpu = await init({ label: "turnout-crowd" });
    if (disposed) {
      gpu.dispose();
      return;
    }

    const output = surface(gpu, canvas, {
      dpr: [1, 2],
      alphaMode: "premultiplied",
      clearColor: TRANSPARENT_CLEAR,
    });
    const crowd = draw(gpu, {
      shader: turnoutCrowdWgsl,
      vertices: 6,
      instances: 1,
      blend: "alpha",
      label: "turnout-crowd",
    });
    const time = clock(gpu);

    const loop = gpuFrameLoop(gpu, (frame) => {
      if (disposed) return;
      crowd.set({ u: crowdUniforms(state, time.time) });

      frame.pass({ target: output, clear: TRANSPARENT_CLEAR }, (pass) => {
        if (webGpuInstances > 0) {
          pass.draw(crowd, { instances: webGpuInstances });
        }
      });
    });

    disposeGpu = () => {
      loop.stop();
      output.dispose();
      gpu.dispose();
    };
    mode = "webgpu";
  };

  const initialize = async () => {
    applyCanvasSize();
    const canWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    if (!canWebGpu) return;

    try {
      await initializeWebGpu();
    } catch {
      disposeGpu?.();
      disposeGpu = undefined;
      mode = "none";
    }
  };

  const ready = initialize().catch((error: unknown) => {
    if (disposed && !failed) return;
    failed = true;
    if (softFail) return;
    throw error;
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeGpu?.();
    disposeGpu = undefined;
  };

  return {
    ready,
    dispose,
    setState,
    isWebGpu: () => mode === "webgpu",
    setWidth(nextWidth: number) {
      width = nextWidth;
      applyCanvasSize();
    },
  };
}

export type CrowdRenderer = ReturnType<typeof createCrowdRenderer>;
