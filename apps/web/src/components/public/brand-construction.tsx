/**
 * Construction drawings for /brand: the logomark and wordmark drawn from their
 * real SVG paths (`public/brand/*.svg`), annotated like a spec sketch. Every
 * number is measured from those paths, in the files' own units.
 */

import { cn } from "@/lib/utils";

const INK = "var(--color-brand-ink)";
const LINE = "var(--color-brand-green)";
const LABEL = "var(--color-brand-sketch-label)";
const GUIDE = "var(--color-brand-sketch-guide)";
const SHAPE = "var(--color-brand-sketch-shape)";
const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";

const LOGOMARK_PATH =
  "M388.886 358.362L295.506 181.957L202.125 5.55219C198.207 -1.85077 191.794 -1.85077 187.874 5.55219L94.4948 181.957L1.11521 358.362C-2.0528 364.345 1.90583 371.823 8.24052 371.823H158.172C166.192 371.823 171.736 377.288 168.903 382.4L144.7 426.054L100.944 504.981C97.7356 510.768 101.746 518 108.161 518H195.674H279.988C287.826 518 292.725 509.165 288.806 502.096L246.649 426.054L221.979 381.554C219.371 376.851 224.472 371.823 231.851 371.823H381.76C388.094 371.823 392.052 364.345 388.886 358.362Z";

const WORDMARK_PATHS = [
  "M132.633 122.452L100.786 62.1746L68.937 1.89718C67.6007 -0.632394 65.4134 -0.632394 64.0766 1.89718L32.2285 62.1746L0.380356 122.452C-0.700131 124.496 0.650006 127.052 2.81052 127.052H53.9464C56.6816 127.052 58.5725 128.918 57.6061 130.665L49.3515 145.583L34.4281 172.552C33.3339 174.529 34.7014 177 36.8896 177H66.7369H95.4928C98.1664 177 99.8369 173.981 98.5001 171.566L84.1219 145.583L75.7086 130.377C74.8192 128.77 76.5587 127.052 79.0756 127.052H130.203C132.364 127.052 133.714 124.496 132.633 122.452Z",
  "M220.147 35.5439C220.147 15.8967 204.54 0 185.252 0H144.903C141.62 0 138.958 2.66372 138.958 5.94958V121.223C138.958 124.508 141.62 127.172 144.903 127.172H217.352C222.318 127.172 225.095 121.439 222.019 117.537L190 76.931C188.077 74.4925 189.828 70.7507 192.858 70.0733C208.482 66.5788 220.147 52.53 220.147 35.5439Z",
  "M296.524 63.9755C293.859 62.0148 293.28 57.8307 295.335 55.2361C299.945 49.4145 302.741 42.0323 302.741 33.9365C302.741 15.1821 287.87 0 269.5 0H240.019C237.557 0 235.561 1.99779 235.561 4.46218V122.71C235.561 125.175 237.557 127.172 240.019 127.172H276.499C295.392 127.172 310.613 111.633 310.613 92.3427C310.613 80.6644 305.121 70.2987 296.524 63.9755Z",
  "M379.066 0C344.573 0 316.558 28.3381 316.558 63.4985C316.558 98.6589 344.573 127.172 379.066 127.172C413.383 127.172 441.398 98.6589 441.398 63.4985C441.398 28.3381 413.383 0 379.066 0Z",
  "M499.334 78.1358C497.027 75.2094 499.135 70.6797 502.73 69.7057C517.601 65.6766 528.531 51.9864 528.531 35.544C528.531 15.8968 512.925 0 493.636 0H451.801C449.338 0 447.343 1.99779 447.343 4.46218V122.71C447.343 125.175 449.338 127.172 451.801 127.172H528.802C532.526 127.172 534.609 122.872 532.302 119.946L499.334 78.1358Z",
  "M270.552 242V154.96H293.848V222.416H330.84V242H270.552ZM342.064 242V154.96H365.36V242H342.064ZM457.471 154.96L416.383 242.896C415.999 243.664 415.231 243.664 414.847 242.896L373.887 154.96H398.719L416.511 195.536L433.791 154.96H457.471ZM465.552 242V154.96H526.608V174.544H488.848V194.768H520.336V213.328H488.848V222.416H528.4V242H465.552Z",
];

/* ------------------------------------------------------------ primitives */

/** A faint 20-unit grid, like drafting paper. */
function GridPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="var(--color-brand-sketch-grid)" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

/** Horizontal dimension: a bar with end ticks. */
function HDim({ x1, x2, y, tick = 9 }: { x1: number; x2: number; y: number; tick?: number }) {
  return (
    <g stroke={LINE} strokeWidth="2">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} />
    </g>
  );
}

/** Vertical dimension: a bar with end ticks. */
function VDim({ y1, y2, x, tick = 9 }: { y1: number; y2: number; x: number; tick?: number }) {
  return (
    <g stroke={LINE} strokeWidth="2">
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - tick} y1={y1} x2={x + tick} y2={y1} />
      <line x1={x - tick} y1={y2} x2={x + tick} y2={y2} />
    </g>
  );
}

/** A dashed construction guide line. */
function Guide(props: { x1: number; y1: number; x2: number; y2: number }) {
  return <line {...props} stroke={GUIDE} strokeWidth="1.5" strokeDasharray="5 5" />;
}

/** A monospace annotation label. */
function Label({
  x,
  y,
  children,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fill={LABEL} fontFamily={MONO} fontSize="17" textAnchor={anchor}>
      {children}
    </text>
  );
}

/** A dark drawing panel with a caption; scrolls sideways on narrow screens. */
function Panel({
  label,
  caption,
  viewBox,
  className,
  children,
}: {
  className?: string;
  label: string;
  caption: string;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn("mt-12", className)}>
      <div className="overflow-x-auto border border-transparent dark:border-border">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={label}
          className="block h-auto w-full min-w-table-sm"
        >
          {children}
        </svg>
      </div>
      <figcaption className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/* --------------------------------------------------------------- figures */

/** The logomark annotated with its crown, trunk, neck and overall dimensions. */
export function LogomarkConstruction() {
  // Mark drawn at 1:1 in its own units, offset into the canvas.
  const ox = 205;
  const oy = 96;
  const crownBase = oy + 371.8;
  const bottom = oy + 518;
  return (
    <Panel
      label="Logomark construction: a 390 wide crown triangle, 372 tall, over a trunk 146 tall whose base is 192 wide, about half the crown. 518 tall overall, with rounded tips."
      caption="fig. 2 — logomark construction, in the SVG's own units"
      className="mx-auto max-w-2xl"
      viewBox="0 0 800 720"
    >
      <GridPattern id="grid-logomark" />
      <rect width="800" height="720" rx="18" fill={INK} />
      <rect width="800" height="720" rx="18" fill="url(#grid-logomark)" />

      {/* Crown triangle, extended to its sharp apex. */}
      <Guide x1={ox} y1={crownBase} x2={ox + 195} y2={oy - 8} />
      <Guide x1={ox + 390} y1={crownBase} x2={ox + 195} y2={oy - 8} />
      <Guide x1={60} y1={crownBase} x2={740} y2={crownBase} />

      <path d={LOGOMARK_PATH} fill={SHAPE} transform={`translate(${ox} ${oy})`} />

      {/* width */}
      <HDim x1={ox} x2={ox + 390} y={46} />
      <Label x={ox + 195} y={30} anchor="middle">
        390 · crown width
      </Label>

      {/* overall height */}
      <VDim y1={oy} y2={bottom} x={680} />
      <Label x={698} y={oy + 265}>
        518
      </Label>

      {/* crown / trunk split */}
      <VDim y1={oy} y2={crownBase} x={140} />
      <Label x={124} y={oy + 192} anchor="end">
        crown
      </Label>
      <Label x={124} y={oy + 214} anchor="end">
        372
      </Label>
      <VDim y1={crownBase} y2={bottom} x={140} />
      <Label x={124} y={crownBase + 70} anchor="end">
        trunk
      </Label>
      <Label x={124} y={crownBase + 92} anchor="end">
        146
      </Label>

      {/* trunk base */}
      <Guide x1={ox + 101} y1={bottom} x2={ox + 101} y2={bottom + 34} />
      <Guide x1={ox + 293} y1={bottom} x2={ox + 293} y2={bottom + 34} />
      <HDim x1={ox + 101} x2={ox + 293} y={bottom + 34} tick={7} />
      <Label x={ox + 197} y={bottom + 64} anchor="middle">
        trunk base 192 ≈ ½ crown
      </Label>

      {/* neck */}
      <HDim x1={ox + 170} x2={ox + 221} y={crownBase + 12} tick={5} />
      <line x1={ox + 221} y1={crownBase + 12} x2={ox + 330} y2={crownBase + 54} stroke={LINE} strokeWidth="2" />
      <Label x={ox + 336} y={crownBase + 60}>
        neck 53
      </Label>

      {/* rounded tips */}
      <circle cx={ox + 195} cy={oy + 4} r="26" fill="none" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="5 5" />
      <line x1={ox + 176} y1={oy - 14} x2={ox + 110} y2={oy - 14} stroke={LINE} strokeWidth="2" />
      <Label x={ox + 104} y={oy - 8} anchor="end">
        tips rounded
      </Label>
    </Panel>
  );
}

/** The wordmark annotated with cap height, baseline, the O circle and LIVE placement. */
export function WordmarkConstruction() {
  const ox = 170;
  const oy = 92;
  const capTop = oy;
  const baseline = oy + 127.2;
  const trunkBottom = oy + 177;
  const liveTop = oy + 155;
  const liveBottom = oy + 242;
  const right = ox + 532.3;
  return (
    <Panel
      label="Wordmark construction: the A is the logomark, its crown sitting on the ARBOR baseline with the trunk dropping 50 below. Letters are 127 tall and the O is a circle of that height. LIVE is 87 tall, about 0.7 of the cap height, set 28 below the baseline and flush right with the R."
      caption="fig. 1 — wordmark construction, in the SVG's own units"
      viewBox="0 0 900 440"
    >
      <GridPattern id="grid-wordmark" />
      <rect width="900" height="440" rx="18" fill={INK} />
      <rect width="900" height="440" rx="18" fill="url(#grid-wordmark)" />

      {/* horizontal guides */}
      <Guide x1={40} y1={capTop} x2={860} y2={capTop} />
      <Guide x1={40} y1={baseline} x2={860} y2={baseline} />
      <Guide x1={ox + 250} y1={liveTop} x2={860} y2={liveTop} />
      <Guide x1={ox + 250} y1={liveBottom} x2={860} y2={liveBottom} />
      {/* flush-right guide */}
      <Guide x1={right} y1={capTop - 16} x2={right} y2={liveBottom + 16} />

      <g transform={`translate(${ox} ${oy})`} fill={SHAPE}>
        {WORDMARK_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </g>

      {/* O is a circle */}
      <circle
        cx={ox + 379}
        cy={oy + 63.6}
        r="70"
        fill="none"
        stroke={GUIDE}
        strokeWidth="1.5"
        strokeDasharray="5 5"
      />

      {/* total width */}
      <HDim x1={ox} x2={right} y={46} />
      <Label x={ox + 266} y={30} anchor="middle">
        534 · wordmark width
      </Label>

      {/* cap height */}
      <VDim y1={capTop} y2={baseline} x={ox - 34} />
      <Label x={ox - 48} y={oy + 70} anchor="end">
        cap 127
      </Label>

      {/* trunk drop */}
      <VDim y1={baseline} y2={trunkBottom} x={ox - 34} tick={7} />
      <Label x={ox - 48} y={baseline + 32} anchor="end">
        trunk 50
      </Label>

      {/* gap to LIVE */}
      <VDim y1={baseline} y2={liveTop} x={ox + 236} tick={6} />
      <Label x={ox + 226} y={baseline + 22} anchor="end">
        28
      </Label>

      {/* LIVE height */}
      <VDim y1={liveTop} y2={liveBottom} x={836} />
      <Label x={836} y={liveBottom + 34} anchor="end">
        LIVE 87 ≈ 0.7 cap · flush right
      </Label>

      {/* O callout */}
      <line x1={ox + 432} y1={oy + 14} x2={ox + 470} y2={oy - 22} stroke={LINE} strokeWidth="2" />
      <Label x={ox + 476} y={oy - 20}>
        O = circle, ⌀ cap
      </Label>

      {/* crown on baseline */}
      <line x1={ox + 20} y1={baseline + 2} x2={ox + 60} y2={liveBottom + 20} stroke={LINE} strokeWidth="2" />
      <Label x={ox + 66} y={liveBottom + 26}>
        crown sits on the baseline
      </Label>
    </Panel>
  );
}
