import { requireSession } from "@/lib/session"

// Each page draws its own bar or sidebar and its own drafting table, since the
// list and a project are laid out differently.
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSession()

  return children
}
