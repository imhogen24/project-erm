import { NoiseTexture } from "@/components/ui/noise-texture"

// The sign-in page's noise, laid inside a box in dark mode. The box must be
// `relative isolate`: the grain then sits above its fill and under its content.
export function Grain() {
  return <NoiseTexture className="-z-10 hidden dark:block" />
}
