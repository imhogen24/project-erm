// How one save went. `retry` is a save that may work if tried again, such as
// a dropped connection. `refused` will not, such as someone else's newer save.
export type SaveOutcome =
  | { status: "saved" }
  | { status: "retry"; message?: string }
  | { status: "refused"; message: string }

// About a second after the last edit, a save goes. A failed save is tried
// again a few seconds later, then twice as long after each failure, up to
// half a minute.
export const AUTOSAVE_DELAY = 800

export const RETRY_DELAY = 3000

export const MAX_RETRY_DELAY = 30_000

export type AutosaveState =
  | { status: "saving" }
  | { status: "saved" }
  | { status: "retrying"; message?: string }
  | { status: "refused"; message: string }

type Options<V> = {
  send: (values: V) => Promise<SaveOutcome>
  // How long after the last edit a save goes, and how long after a failed
  // save it is tried again: `retryDelay` at first, doubling with each
  // failure in a row up to `maxRetryDelay`.
  delay: number
  retryDelay: number
  maxRetryDelay?: number
  onState: (state: AutosaveState) => void
}

// Saves a sheet as it is edited. Each edit restarts the wait, so a save goes
// once editing stops. An edit made while a save is on its way is saved right
// after it, so the newest values always win and an older copy is never saved
// over a newer one. A save that fails keeps its values and is tried again,
// unless the server refused it.
export function createAutosave<V>({
  send,
  delay,
  retryDelay,
  maxRetryDelay = MAX_RETRY_DELAY,
  onState,
}: Options<V>) {
  // Values edited but not yet saved, boxed so any value can be held.
  let pending: { values: V } | null = null
  let running: Promise<boolean> | null = null
  let failed = false
  // Failures in a row, so a save that keeps failing is tried less often.
  let failures = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  function tell(state: AutosaveState) {
    if (!disposed) {
      onState(state)
    }
  }

  async function sendAll(): Promise<boolean> {
    while (pending && !disposed) {
      const { values } = pending

      pending = null
      tell({ status: "saving" })

      let outcome: SaveOutcome

      try {
        outcome = await send(values)
      } catch {
        outcome = { status: "retry" }
      }

      if (outcome.status === "saved") {
        failed = false
        failures = 0
        continue
      }

      // What failed is still unsaved, unless something newer came since.
      pending ??= { values }
      failed = true

      if (outcome.status === "refused") {
        tell({ status: "refused", message: outcome.message })

        return false
      }

      tell({ status: "retrying", message: outcome.message })
      failures += 1
      retryTimer = setTimeout(
        () => void save(),
        Math.min(retryDelay * 2 ** (failures - 1), maxRetryDelay)
      )

      return false
    }

    if (!disposed) {
      tell({ status: "saved" })
    }

    return !disposed
  }

  // Saves what is waiting now. A save already on its way finishes first.
  async function save(): Promise<boolean> {
    clearTimeout(timer)
    clearTimeout(retryTimer)

    if (running) {
      return running.then(save)
    }

    if (!pending || disposed) {
      return !failed || disposed
    }

    running = sendAll()

    try {
      return await running
    } finally {
      running = null
    }
  }

  return {
    edit(values: V) {
      if (disposed) {
        return
      }

      pending = { values }
      clearTimeout(timer)
      timer = setTimeout(() => void save(), delay)
    },
    // Saves at once, without waiting for editing to stop. Says whether
    // everything edited is saved.
    flush: save,
    // True while an edit waits to be saved, is on its way, or failed.
    unsaved() {
      return !disposed && (pending !== null || running !== null || failed)
    },
    // Stops for good: nothing more is sent, and nothing counts as unsaved.
    dispose() {
      disposed = true
      clearTimeout(timer)
      clearTimeout(retryTimer)
    },
  }
}

export type Autosave<V> = ReturnType<typeof createAutosave<V>>
