import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { test, type Page } from "@playwright/test";
import { offFlag, TECHNIQUES, type Technique } from "../src/perf/flags";
import type { RenderSummary } from "../src/perf/renderCounts";
import { jankyFrames, median, summarize, type SampleSummary } from "../src/perf/stats";
import type { StressProbe } from "../src/stress/probe";

// The rendering benchmark: `npm run bench` (playwright.bench.config.ts) builds the
// client for production, serves it with `vite preview`, and drives the
// stress page for every size with all techniques on and with each one off.
//
// Per run it records
//   - the initial render: the page's own Performance API measure, from loading
//     the document into the store to the first frame after the visible nodes
//     were mounted;
//   - frame intervals while dragging a node, panning and zooming, sampled
//     with requestAnimationFrame (median, p95, max, frames over 25 ms);
//   - the time to handle each pointer move (from the event to the next task,
//     so it covers the React work done synchronously for the move);
//   - render counts per drag from the page's counters, and how many
//     operations the drag committed.
// Each gesture is paced at one input per frame, like a real pointer.
//
// Environment: BENCH_SIZES=500,1000 limits the sizes, BENCH_CONFIGS="all on,no-memo"
// the configurations, and BENCH_REPEATS=3 (the default) repeats each run and
// keeps the median of each metric.

const SIZES = (process.env.BENCH_SIZES ?? "500,1000,2000").split(",").map(Number);
const REPEATS = Number(process.env.BENCH_REPEATS ?? "3");
const DRAG_MOVES = 90;
const PAN_MOVES = 90;
const ZOOM_TICKS = 18;
const OUT_DIR = `${import.meta.dirname}/../../docs/benchmarks`;

interface Config {
  readonly name: string;
  readonly off: readonly Technique[];
}

const ALL_CONFIGS: readonly Config[] = [
  { name: "all on", off: [] },
  ...TECHNIQUES.map((technique) => ({ name: offFlag(technique), off: [technique] })),
];
const ONLY = process.env.BENCH_CONFIGS?.split(",");
const CONFIGS = ONLY ? ALL_CONFIGS.filter((config) => ONLY.includes(config.name)) : ALL_CONFIGS;

interface GestureResult {
  readonly frames: SampleSummary;
  readonly janky: number;
  readonly handling: SampleSummary;
}

interface DragRenders {
  readonly root: number;
  readonly flow: number;
  readonly frame: number;
  readonly frameIds: number;
  readonly content: number;
  readonly contentIds: number;
  readonly edge: number;
  readonly operations: number;
}

interface RunResult {
  readonly size: number;
  readonly config: string;
  readonly nodes: number;
  readonly edges: number;
  readonly groups: number;
  readonly mountedNodes: number;
  readonly initialRenderMs: number;
  readonly drag: GestureResult;
  readonly dragRenders: DragRenders;
  readonly pan: GestureResult;
  readonly zoom: GestureResult;
}

interface Sampler {
  start: () => void;
  stop: () => { frames: number[]; handling: number[] };
}

declare global {
  interface Window {
    __benchSampler?: Sampler;
  }
}

/** rAF frame intervals plus per-move handling time (event to the next task). */
function installSampler(): void {
  let frames: number[] = [];
  let handling: number[] = [];
  let running = false;
  /** Each start begins a new rAF chain; a chain from an earlier start ends at its next callback. */
  let generation = 0;
  let last: number | undefined;
  const channel = new MessageChannel();
  channel.port1.onmessage = (event: MessageEvent<number>) => {
    if (running) handling.push(performance.now() - event.data);
  };
  const onMove = () => {
    if (running) channel.port2.postMessage(performance.now());
  };
  const chain = (own: number) => {
    const loop = (time: number) => {
      if (!running || own !== generation) return;
      if (last !== undefined) frames.push(time - last);
      last = time;
      requestAnimationFrame(loop);
    };
    return loop;
  };
  for (const type of ["pointermove", "wheel"]) window.addEventListener(type, onMove, { capture: true, passive: true });
  window.__benchSampler = {
    start: () => {
      frames = [];
      handling = [];
      last = undefined;
      running = true;
      generation += 1;
      requestAnimationFrame(chain(generation));
    },
    stop: () => {
      running = false;
      return { frames, handling };
    },
  };
}

const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function sample(page: Page, gesture: () => Promise<void>): Promise<GestureResult> {
  await page.evaluate(() => window.__benchSampler?.start());
  await gesture();
  await nextFrame(page);
  await nextFrame(page);
  const { frames, handling } = await page.evaluate(() => window.__benchSampler?.stop() ?? { frames: [], handling: [] });
  return { frames: summarize(frames), janky: jankyFrames(frames), handling: summarize(handling) };
}

/** A top-level step fully on screen, closest to the canvas centre. */
async function dragTarget(page: Page): Promise<{ x: number; y: number; id: string }> {
  return page.evaluate(() => {
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!pane) throw new Error("No canvas");
    const centre = { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 };
    let best: { x: number; y: number; id: string; distance: number } | null = null;
    for (const element of document.querySelectorAll<HTMLElement>(".react-flow__node-step")) {
      if (element.querySelector('[data-parent-id]:not([data-parent-id=""])')) continue;
      const box = element.getBoundingClientRect();
      if (box.left < pane.left || box.right > pane.right || box.top < pane.top || box.bottom > pane.bottom) continue;
      const point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
      if (!best || distance < best.distance) best = { ...point, id: element.dataset.id ?? "", distance };
    }
    if (!best) throw new Error("No step on screen");
    return { x: best.x, y: best.y, id: best.id };
  });
}

/** A point on the empty pane, near the canvas centre. */
async function panePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!pane) throw new Error("No canvas");
    for (let dy = 0; dy < pane.height / 2; dy += 10) {
      for (let dx = 0; dx < pane.width / 2; dx += 10) {
        const x = pane.left + pane.width / 2 + dx;
        const y = pane.top + pane.height / 2 + dy;
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    throw new Error("No empty pane point");
  });
}

async function measure(page: Page, size: number, config: Config): Promise<RunResult> {
  const query = ["stress", `size=${String(size)}`, ...config.off.map(offFlag)].join("&");
  await page.goto(`/stress?${query}`);
  await page.waitForFunction(() => window.__liveCanvasStress?.ready === true, undefined, { timeout: 180_000 });
  await page.evaluate(installSampler);
  const info = await page.evaluate(() => {
    const current: StressProbe | undefined = window.__liveCanvasStress;
    if (!current) throw new Error("The stress page is not ready");
    return {
      ...current.counts,
      initialRenderMs: current.initialRenderMs ?? Number.NaN,
      mountedNodes: current.mountedNodes(),
    };
  });

  // Drag one step, one move per frame, then release (the commit is counted too).
  const target = await dragTarget(page);
  const operationsBefore = await page.evaluate(() => {
    window.__liveCanvasStress?.resetRenders();
    return window.__liveCanvasStress?.operations() ?? 0;
  });
  const drag = await sample(page, async () => {
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    for (let step = 1; step <= DRAG_MOVES; step += 1) {
      await page.mouse.move(target.x + step * 2, target.y + step);
    }
    await page.mouse.up();
  });
  const after = await page.evaluate(() => {
    const current = window.__liveCanvasStress;
    if (!current) throw new Error("The stress page is not ready");
    return { renders: current.renders(), operations: current.operations() };
  });
  const renders: RenderSummary = after.renders;
  const operations = after.operations - operationsBefore;

  // Pan by dragging the empty pane.
  const start = await panePoint(page);
  const pan = await sample(page, async () => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let step = 1; step <= PAN_MOVES; step += 1) {
      await page.mouse.move(start.x - step * 4, start.y - step * 2);
    }
    await page.mouse.up();
  });

  // Zoom out and back in with the wheel, about the canvas centre.
  const centre = await panePoint(page);
  await page.mouse.move(centre.x, centre.y);
  const zoom = await sample(page, async () => {
    for (const direction of [1, -1]) {
      for (let tick = 0; tick < ZOOM_TICKS; tick += 1) {
        await page.mouse.wheel(0, direction * 60);
      }
    }
  });

  return {
    size,
    config: config.name,
    nodes: info.nodes,
    edges: info.edges,
    groups: info.groups,
    mountedNodes: info.mountedNodes,
    initialRenderMs: info.initialRenderMs,
    drag,
    dragRenders: {
      root: renders.root.total,
      flow: renders.flow.total,
      frame: renders.frame.total,
      frameIds: Object.keys(renders.frame.ids).length,
      content: renders.content.total,
      contentIds: Object.keys(renders.content.ids).length,
      edge: renders.edge.total,
      operations,
    },
    pan,
    zoom,
  };
}

/** The median of each numeric metric over repeated runs of one configuration. */
function combine(runs: readonly RunResult[]): RunResult {
  const [first] = runs;
  if (!first) throw new Error("No runs");
  const mid = (pick: (run: RunResult) => number) => median(runs.map(pick));
  const gesture = (pick: (run: RunResult) => GestureResult): GestureResult => ({
    frames: {
      count: mid((run) => pick(run).frames.count),
      median: mid((run) => pick(run).frames.median),
      p95: mid((run) => pick(run).frames.p95),
      max: mid((run) => pick(run).frames.max),
      mean: mid((run) => pick(run).frames.mean),
    },
    janky: mid((run) => pick(run).janky),
    handling: {
      count: mid((run) => pick(run).handling.count),
      median: mid((run) => pick(run).handling.median),
      p95: mid((run) => pick(run).handling.p95),
      max: mid((run) => pick(run).handling.max),
      mean: mid((run) => pick(run).handling.mean),
    },
  });
  const renders = (pick: (value: DragRenders) => number) => mid((run) => pick(run.dragRenders));
  return {
    ...first,
    mountedNodes: mid((run) => run.mountedNodes),
    initialRenderMs: mid((run) => run.initialRenderMs),
    drag: gesture((run) => run.drag),
    pan: gesture((run) => run.pan),
    zoom: gesture((run) => run.zoom),
    dragRenders: {
      root: renders((value) => value.root),
      flow: renders((value) => value.flow),
      frame: renders((value) => value.frame),
      frameIds: renders((value) => value.frameIds),
      content: renders((value) => value.content),
      contentIds: renders((value) => value.contentIds),
      edge: renders((value) => value.edge),
      operations: renders((value) => value.operations),
    },
  };
}

const ms = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : "–");

/** One row of a Markdown table. */
const tableRow = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

function markdown(results: readonly RunResult[], environment: Record<string, string>): string {
  const lines = [
    "# Rendering benchmark results",
    "",
    "Generated by `npm run bench` (client/scripts/benchmark.ts). Times in milliseconds; each value is the median of the repeats.",
    "",
  ];
  for (const [key, value] of Object.entries(environment)) lines.push(`- **${key}:** ${value}`);
  for (const size of SIZES) {
    const rows = results.filter((result) => result.size === size);
    const [first] = rows;
    if (!first) continue;
    lines.push(
      "",
      `## ${size.toLocaleString("en-US")} nodes (${first.edges.toLocaleString("en-US")} connectors, ${String(first.groups)} groups)`,
      "",
      tableRow([
        "Configuration",
        "Initial render",
        "Mounted nodes",
        "Drag frame median / p95",
        "Drag move handling median / p95",
        "Pan frame median / p95",
        "Zoom frame median / p95",
        "Renders per drag: root / flow / frames / contents / connectors",
        "Operations per drag",
      ]),
      "|---|---|---|---|---|---|---|---|---|",
    );
    for (const row of rows) {
      const r = row.dragRenders;
      const renders = [
        String(r.root),
        String(r.flow),
        `${String(r.frame)} (${String(r.frameIds)} ids)`,
        `${String(r.content)} (${String(r.contentIds)} ids)`,
        String(r.edge),
      ];
      lines.push(
        tableRow([
          row.config,
          ms(row.initialRenderMs),
          String(row.mountedNodes),
          `${ms(row.drag.frames.median)} / ${ms(row.drag.frames.p95)}`,
          `${ms(row.drag.handling.median)} / ${ms(row.drag.handling.p95)}`,
          `${ms(row.pan.frames.median)} / ${ms(row.pan.frames.p95)}`,
          `${ms(row.zoom.frames.median)} / ${ms(row.zoom.frames.p95)}`,
          renders.join(" / "),
          String(r.operations),
        ]),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

test.describe.configure({ mode: "serial" });

test("benchmark", async ({ page, browser }) => {
  const results: RunResult[] = [];
  // One discarded run warms the server, the browser cache and the JIT.
  const [warmSize = 500] = SIZES;
  await measure(page, warmSize, ALL_CONFIGS[0] ?? { name: "all on", off: [] });
  for (const size of SIZES) {
    for (const config of CONFIGS) {
      const runs: RunResult[] = [];
      for (let repeat = 0; repeat < REPEATS; repeat += 1) runs.push(await measure(page, size, config));
      const result = combine(runs);
      results.push(result);
      process.stdout.write(
        `${String(size)} ${config.name}: render ${ms(result.initialRenderMs)} ms, ` +
          `drag ${ms(result.drag.frames.median)}/${ms(result.drag.frames.p95)} ms, ` +
          `pan ${ms(result.pan.frames.p95)} ms p95, zoom ${ms(result.zoom.frames.p95)} ms p95\n`,
      );
    }
  }
  const [cpu] = cpus();
  const environment = {
    Date: new Date().toISOString(),
    Machine: `${cpu?.model ?? "unknown CPU"}, ${String(cpus().length)} logical cores, ${String(Math.round(totalmem() / 2 ** 30))} GB RAM`,
    OS: `${platform()} ${release()}`,
    Browser: `Chromium ${browser.version()} (Playwright, headless), viewport 1440 × 900 at device scale 1`,
    Build: "Production build (vite build) served by vite preview",
    Repeats: String(REPEATS),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/benchmark-results.json`, `${JSON.stringify({ environment, results }, null, 2)}\n`);
  writeFileSync(`${OUT_DIR}/benchmark-results.md`, markdown(results, environment));
});
