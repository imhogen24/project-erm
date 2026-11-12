import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { ACCOUNTS_DOC, accountsDoc } from "./accounts-doc"

await mkdir(dirname(ACCOUNTS_DOC), { recursive: true })

await writeFile(ACCOUNTS_DOC, await accountsDoc())
