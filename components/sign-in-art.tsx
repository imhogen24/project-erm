import { NoiseTexture } from "@/components/ui/noise-texture"

// The facets of the logo's mark, drawn as a technical drawing: outlines only,
// with a ground line and a centre line. The strokes draw in once on load.
const outlines = [
  "M206 97 L180 420 L302 420 L277 97 Z",
  "M195 117 L57 357 L172 420 Z",
  "M287 117 L427 357 L312 420 Z",
  "M206 97 L241 36 L277 97",
]

export function SignInArt() {
  return (
    <div className="relative hidden h-full overflow-hidden border-r bg-muted/40 md:block">
      <NoiseTexture />
      <svg
        viewBox="0 0 484 484"
        aria-hidden
        className="absolute -top-8 -right-16 h-[70%] w-auto text-primary"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
      >
        <line
          x1="0"
          y1="420"
          x2="484"
          y2="420"
          strokeWidth="1"
          opacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="241"
          y1="0"
          x2="241"
          y2="484"
          strokeWidth="1"
          strokeDasharray="4 6"
          opacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
        {outlines.map((path) => (
          <path
            key={path}
            d={path}
            pathLength={1}
            strokeWidth="1.4"
            className="[stroke-dasharray:1] motion-safe:animate-[draw-in_1.6s_ease-out_both]"
          />
        ))}
      </svg>
      <div className="relative z-10 flex h-full flex-col justify-end p-12 lg:p-16">
        <h2 className="max-w-lg text-4xl leading-[1.1] font-medium tracking-tight text-balance lg:text-5xl">
          Every project, from onboarding to handover, in one record.
        </h2>
        <p className="mt-5 max-w-md text-base text-muted-foreground">
          Thirteen workbooks, one place, and a record of every change.
        </p>
      </div>
    </div>
  )
}
