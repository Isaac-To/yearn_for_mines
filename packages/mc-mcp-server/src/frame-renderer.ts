import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';

export interface FrameRenderer {
  capture(width: number, height: number): Promise<Buffer>;
  dispose(): void;
}
interface Canvas { toBuffer(type: string): Buffer }
interface Renderer { render(scene: unknown, camera: unknown): void; setSize(w: number, h: number): void; dispose(): void; forceContextLoss(): void }
interface Viewer {
  scene: unknown;
  camera: { aspect: number; updateProjectionMatrix(): void; position: { set(x: number, y: number, z: number): void } };
  world: { workers: Array<{ terminate(): Promise<number> }>; material: { dispose(): void }; sectionMeshs: Record<string, { geometry: { dispose(): void } }> };
  setVersion(version: string): boolean;
  setFirstPersonCamera(position: Vec3, yaw: number, pitch: number): void;
  listen(world: WorldView): void;
  waitForChunksToRender(): Promise<void>;
  resetAll(): void;
  update(): void;
}
interface WorldView {
  init(position: Vec3): Promise<void>;
  updatePosition(position: Vec3): Promise<void>;
  listenToBot(bot: Bot): void;
  removeListenersFromBot(bot: Bot): void;
  removeAllListeners(): void;
}

/** Native dependencies are loaded only for the first requested vision frame. */
export function createFrameRenderer(bot: Bot): FrameRenderer {
  const require = createRequire(import.meta.url);
  const pv = createRequire(require.resolve('prismarine-viewer'));
  const { createCanvas } = pv('node-canvas-webgl/lib') as { createCanvas(w: number, h: number): Canvas };
  const THREE = pv('three') as { WebGLRenderer: new (options: { canvas: Canvas }) => Renderer };
  Object.assign(globalThis, { Worker, THREE });
  const { Viewer: ViewerClass, WorldView: WorldViewClass } = pv('./viewer') as {
    Viewer: new (renderer: Renderer) => Viewer;
    WorldView: new (world: Bot['world'], distance: number, position: Vec3) => WorldView;
  };
  const canvas = createCanvas(640, 480);
  const renderer = new THREE.WebGLRenderer({ canvas });
  let viewer: Viewer | undefined;
  let world: WorldView | undefined;
  let listening = false;
  let initialized = false;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (listening) world?.removeListenersFromBot(bot);
    world?.removeAllListeners();
    if (viewer) {
      Object.values(viewer.world.sectionMeshs).forEach(mesh => mesh.geometry.dispose());
      viewer.world.material.dispose();
      viewer.resetAll();
      for (const worker of viewer.world.workers) void worker.terminate();
    }
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    viewer = new ViewerClass(renderer);
    if (!viewer.setVersion(bot.version)) throw new Error(`Viewer does not support Minecraft ${bot.version}`);
    world = new WorldViewClass(bot.world, 3, bot.entity.position);
    viewer.listen(world);
    world.listenToBot(bot);
    listening = true;
  } catch (error) { dispose(); throw error; }
  const readyViewer = viewer;
  const readyWorld = world;
  return {
    dispose,
    async capture(width, height) {
      if (disposed) throw new Error('Renderer detached');
      if (!initialized) { await readyWorld.init(bot.entity.position); initialized = true; }
      else await readyWorld.updatePosition(bot.entity.position);
      await readyViewer.waitForChunksToRender();
      if (disposed) throw new Error('Renderer detached');
      renderer.setSize(width, height);
      readyViewer.camera.aspect = width / height;
      readyViewer.camera.updateProjectionMatrix();
      readyViewer.setFirstPersonCamera(bot.entity.position, bot.entity.yaw, bot.entity.pitch);
      readyViewer.update();
      readyViewer.camera.position.set(bot.entity.position.x, bot.entity.position.y + 1.62, bot.entity.position.z);
      renderer.render(readyViewer.scene, readyViewer.camera);
      return canvas.toBuffer('image/png');
    },
  };
}
