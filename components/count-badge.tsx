// A small count after a link's name, such as the projects waiting for a team.
// Nothing at zero. Screen readers hear the number with what it counts:
// "3 projects need a team".
export function CountBadge({
  count,
  one,
  many,
}: {
  count: number
  // What one of it is, and what several are: "project needs a team".
  one: string
  many: string
}) {
  if (count === 0) {
    return null
  }

  return (
    <span className="nav-count">
      {count}
      <span className="sr-only"> {count === 1 ? one : many}</span>
    </span>
  )
}
