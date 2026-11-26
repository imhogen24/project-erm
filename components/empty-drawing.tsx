import { cn } from "@/lib/utils"

// Small engineering drawings for empty states: a part's front view with its
// centre lines, hidden edges and one dimension, in the sheet's grey. The
// outline draws in once on a page-sized empty state; everything else fades in
// after it.
export type Drawing = "gear" | "flange" | "bracket"

const centre = { x: 100, y: 68 }

function at(radius: number, degrees: number) {
  const angle = ((degrees - 90) * Math.PI) / 180
  const x = centre.x + radius * Math.cos(angle)
  const y = centre.y + radius * Math.sin(angle)

  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

// Twelve teeth, each centred on a multiple of 30 degrees, so a tooth tip sits
// on each end of the horizontal centre line.
const gearOutline =
  "M " +
  Array.from({ length: 12 }, (_, tooth) => {
    const middle = tooth * 30

    return [
      at(36, middle - 12),
      at(44, middle - 5),
      at(44, middle + 5),
      at(36, middle + 12),
    ].join(" L ")
  }).join(" L ") +
  " Z"

// The bore with its keyway cut at the top.
const keyedBore =
  "M 97 56.38 L 97 52.38 L 103 52.38 L 103 56.38 A 12 12 0 1 1 97 56.38 Z"

const boltHoles = Array.from({ length: 6 }, (_, hole) => {
  const angle = ((hole * 60 - 90) * Math.PI) / 180

  return {
    x: centre.x + 32 * Math.cos(angle),
    y: centre.y + 32 * Math.sin(angle),
  }
})

const bracketOutline =
  "M 52 22 L 72 22 L 72 84 A 8 8 0 0 0 80 92 L 148 92 L 148 112 L 52 112 Z"

type Line = [number, number, number, number]

const centreLines: Record<Drawing, Line[]> = {
  gear: [
    [46, 68, 154, 68],
    [100, 14, 100, 122],
  ],
  flange: [
    [46, 68, 154, 68],
    [100, 14, 100, 122],
  ],
  bracket: [
    [46, 52, 78, 52],
    [114, 86, 114, 118],
  ],
}

const hiddenLines: Record<Drawing, Line[]> = {
  gear: [],
  flange: [],
  bracket: [
    [52, 46, 72, 46],
    [52, 58, 72, 58],
    [108, 92, 108, 112],
    [120, 92, 120, 112],
  ],
}

// One dimension per drawing: the extension lines, the dimension line, where
// its figure sits and the figure.
type Dimension = {
  extensions: Line[]
  line: Line
  figure: { x: number; y: number; text: string; rotate?: boolean }
}

const roundDimension: Dimension = {
  extensions: [
    [56, 74, 56, 138],
    [144, 74, 144, 138],
  ],
  line: [56, 134, 144, 134],
  figure: { x: 100, y: 130, text: "Ø88" },
}

const dimensions: Record<Drawing, Dimension[]> = {
  gear: [roundDimension],
  flange: [roundDimension],
  bracket: [
    {
      extensions: [
        [52, 116, 52, 134],
        [148, 116, 148, 134],
      ],
      line: [52, 130, 148, 130],
      figure: { x: 100, y: 126, text: "96" },
    },
    {
      extensions: [
        [48, 22, 34, 22],
        [48, 112, 34, 112],
      ],
      line: [38, 22, 38, 112],
      figure: { x: 34, y: 67, text: "90", rotate: true },
    },
  ],
}

// The two arrowheads of a dimension line, pointing out to its ends.
function arrowheads([x1, y1, x2, y2]: Line) {
  if (y1 === y2) {
    return [
      `M ${x1} ${y1} L ${x1 + 6} ${y1 - 2} L ${x1 + 6} ${y1 + 2} Z`,
      `M ${x2} ${y2} L ${x2 - 6} ${y2 - 2} L ${x2 - 6} ${y2 + 2} Z`,
    ]
  }

  return [
    `M ${x1} ${y1} L ${x1 - 2} ${y1 + 6} L ${x1 + 2} ${y1 + 6} Z`,
    `M ${x2} ${y2} L ${x2 - 2} ${y2 - 6} L ${x2 + 2} ${y2 - 6} Z`,
  ]
}

// The part's visible edges. Drawn in, they are measured along the path, which
// a non-scaling stroke would break; a drawing that draws in is shown near its
// own size, so it needs no non-scaling stroke.
function Outline({ drawing, draw }: { drawing: Drawing; draw: boolean }) {
  const stroke = draw
    ? {
        pathLength: 1,
        strokeWidth: 1.5,
        className:
          "[stroke-dasharray:1] motion-safe:animate-[draw-in_1.4s_ease-out_both]",
      }
    : { strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const }

  if (drawing === "gear") {
    return (
      <>
        <path d={gearOutline} {...stroke} />
        <path d={keyedBore} {...stroke} />
      </>
    )
  }

  if (drawing === "flange") {
    return (
      <>
        <circle cx={centre.x} cy={centre.y} r={44} {...stroke} />
        <circle cx={centre.x} cy={centre.y} r={22} {...stroke} />
        <circle cx={centre.x} cy={centre.y} r={13} {...stroke} />
        {boltHoles.map((hole) => (
          <circle
            key={`${hole.x}-${hole.y}`}
            cx={hole.x}
            cy={hole.y}
            r={4.5}
            {...stroke}
          />
        ))}
      </>
    )
  }

  return <path d={bracketOutline} {...stroke} />
}

export function EmptyDrawing({
  drawing,
  animate = false,
  dimensioned = true,
  className,
}: {
  drawing: Drawing
  // Draws the outline in on load. Only on a page-sized empty state, so a
  // screen has one moment of motion at most.
  animate?: boolean
  // Shows the dimension. Left out where the drawing is too small to read it.
  dimensioned?: boolean
  className?: string
}) {
  const thin = {
    strokeWidth: 0.75,
    vectorEffect: "non-scaling-stroke" as const,
  }

  return (
    <svg
      viewBox="0 0 200 150"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn("h-auto text-muted-foreground", className)}
    >
      <Outline drawing={drawing} draw={animate} />
      <g
        opacity={0.6}
        className={cn(
          animate &&
            "motion-safe:animate-in motion-safe:delay-700 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:fade-in"
        )}
      >
        {centreLines[drawing].map(([x1, y1, x2, y2]) => (
          <line
            key={`c${x1}-${y1}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeDasharray="10 3 2 3"
            {...thin}
          />
        ))}
        {drawing === "gear" && (
          <>
            <circle
              cx={centre.x}
              cy={centre.y}
              r={40}
              strokeDasharray="10 3 2 3"
              {...thin}
            />
            <circle
              cx={centre.x}
              cy={centre.y}
              r={22}
              strokeDasharray="4 3"
              {...thin}
            />
          </>
        )}
        {drawing === "flange" && (
          <circle
            cx={centre.x}
            cy={centre.y}
            r={32}
            strokeDasharray="10 3 2 3"
            {...thin}
          />
        )}
        {hiddenLines[drawing].map(([x1, y1, x2, y2]) => (
          <line
            key={`h${x1}-${y1}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeDasharray="4 3"
            {...thin}
          />
        ))}
        {dimensioned &&
          dimensions[drawing].map(({ extensions, line, figure }) => (
            <g key={figure.text}>
              {[...extensions, line].map(([x1, y1, x2, y2]) => (
                <line
                  key={`d${x1}-${y1}-${x2}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  {...thin}
                />
              ))}
              {arrowheads(line).map((head) => (
                <path key={head} d={head} fill="currentColor" stroke="none" />
              ))}
              <text
                x={figure.x}
                y={figure.y}
                transform={
                  figure.rotate
                    ? `rotate(-90 ${figure.x} ${figure.y})`
                    : undefined
                }
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                stroke="none"
              >
                {figure.text}
              </text>
            </g>
          ))}
      </g>
    </svg>
  )
}
