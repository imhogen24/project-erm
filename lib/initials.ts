// "Ama Owusu" becomes "AO". A blank name becomes "?".
export function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())

  return letters.join("") || "?"
}
