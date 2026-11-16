import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAutosave,
  type AutosaveState,
  type SaveOutcome,
} from "@/lib/autosave"

const DELAY = 800

const RETRY = 2000

// A save the test answers by hand, so it can be left on its way.
function deferred() {
  let answer!: (outcome: SaveOutcome) => void
  let fail!: (error: Error) => void

  const promise = new Promise<SaveOutcome>((resolve, reject) => {
    answer = resolve
    fail = reject
  })

  return { promise, answer, fail }
}

function setUp(send: (values: string) => Promise<SaveOutcome>) {
  const states: AutosaveState[] = []

  const saver = createAutosave<string>({
    send,
    delay: DELAY,
    retryDelay: RETRY,
    maxRetryDelay: RETRY * 4,
    onState: (state) => states.push(state),
  })

  return { saver, states, last: () => states.at(-1) }
}

const saved: SaveOutcome = { status: "saved" }

describe("createAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("saves the newest values once typing has stopped for the delay", async () => {
    const send = vi.fn(async () => saved)
    const { saver } = setUp(send)

    saver.edit("L")
    await vi.advanceTimersByTimeAsync(DELAY - 100)
    saver.edit("Le")
    await vi.advanceTimersByTimeAsync(DELAY - 100)
    saver.edit("Lea")

    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DELAY)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith("Lea")
  })

  it("says saving while the save is on its way, then saved", async () => {
    const save = deferred()
    const { saver, last } = setUp(() => save.promise)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(last()?.status).toBe("saving")

    save.answer(saved)
    await vi.advanceTimersByTimeAsync(0)

    expect(last()?.status).toBe("saved")
  })

  it("saves an edit made during a save right after it, never an older copy", async () => {
    const first = deferred()

    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(saved)

    const { saver, last } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)
    saver.edit("Leah")
    saver.edit("Leah M")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(send).toHaveBeenCalledTimes(1)

    first.answer(saved)
    await vi.advanceTimersByTimeAsync(0)

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith("Leah M")
    expect(last()?.status).toBe("saved")
  })

  it("retries a save the connection dropped, with the newest values", async () => {
    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(saved)

    const { saver, last } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(last()?.status).toBe("retrying")
    expect(saver.unsaved()).toBe(true)

    saver.edit("Leah")
    await vi.advanceTimersByTimeAsync(RETRY)

    expect(send).toHaveBeenLastCalledWith("Leah")
    expect(last()?.status).toBe("saved")
    expect(saver.unsaved()).toBe(false)
  })

  it("retries a save the server could not finish", async () => {
    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockResolvedValueOnce({ status: "retry", message: "Database busy." })
      .mockResolvedValue(saved)

    const { saver, last } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(last()?.status).toBe("retrying")

    await vi.advanceTimersByTimeAsync(RETRY)

    expect(send).toHaveBeenCalledTimes(2)
    expect(last()?.status).toBe("saved")
  })

  it("keeps retrying while the connection stays down", async () => {
    const send = vi.fn(async (): Promise<SaveOutcome> => {
      throw new TypeError("Failed to fetch")
    })

    const { saver, last } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)
    await vi.advanceTimersByTimeAsync(RETRY * 3)

    expect(send.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(last()?.status).toBe("retrying")
  })

  it("waits twice as long before each retry, up to a limit", async () => {
    const send = vi.fn(async (): Promise<SaveOutcome> => {
      throw new Error("Internal server error")
    })

    const { saver } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(send).toHaveBeenCalledTimes(1)

    // Waits of RETRY, then 2, 4 and 4 times RETRY: the limit.
    for (const [wait, calls] of [
      [RETRY, 2],
      [RETRY * 2, 3],
      [RETRY * 4, 4],
      [RETRY * 4, 5],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1)

      expect(send).toHaveBeenCalledTimes(calls - 1)

      await vi.advanceTimersByTimeAsync(1)

      expect(send).toHaveBeenCalledTimes(calls)
    }
  })

  it("starts the waits over once a save goes through", async () => {
    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(saved)

    const { saver } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY + RETRY + RETRY * 2)

    expect(send).toHaveBeenCalledTimes(3)

    saver.edit("Leah")
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(send).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(RETRY)

    expect(send).toHaveBeenCalledTimes(5)
  })

  it("stops on a refused save, such as someone else's newer save, and keeps it unsaved", async () => {
    const send = vi.fn(async (): Promise<SaveOutcome> => ({
      status: "refused",
      message: "Someone else saved this record.",
    }))

    const { saver, last } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)
    await vi.advanceTimersByTimeAsync(RETRY * 3)

    expect(send).toHaveBeenCalledTimes(1)
    expect(last()).toEqual({
      status: "refused",
      message: "Someone else saved this record.",
    })
    expect(saver.unsaved()).toBe(true)
  })

  it("is unsaved while it waits, while it saves, and not once saved", async () => {
    const save = deferred()
    const { saver } = setUp(() => save.promise)

    expect(saver.unsaved()).toBe(false)

    saver.edit("Lea")

    expect(saver.unsaved()).toBe(true)

    await vi.advanceTimersByTimeAsync(DELAY)

    expect(saver.unsaved()).toBe(true)

    save.answer(saved)
    await vi.advanceTimersByTimeAsync(0)

    expect(saver.unsaved()).toBe(false)
  })

  it("flush saves at once without waiting, and says it worked", async () => {
    const send = vi.fn(async () => saved)
    const { saver } = setUp(send)

    saver.edit("Lea")

    const done = saver.flush()

    await vi.advanceTimersByTimeAsync(0)

    await expect(done).resolves.toBe(true)
    expect(send).toHaveBeenCalledWith("Lea")
    expect(saver.unsaved()).toBe(false)

    await vi.advanceTimersByTimeAsync(DELAY)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it("flush waits for a save on its way, then saves what came after it", async () => {
    const first = deferred()

    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(saved)

    const { saver } = setUp(send)

    saver.edit("Lea")
    await vi.advanceTimersByTimeAsync(DELAY)
    saver.edit("Leah")

    const done = saver.flush()

    first.answer(saved)
    await vi.advanceTimersByTimeAsync(0)

    await expect(done).resolves.toBe(true)
    expect(send).toHaveBeenLastCalledWith("Leah")
  })

  it("flush says it failed when the save cannot go, and keeps retrying", async () => {
    const send = vi
      .fn<(values: string) => Promise<SaveOutcome>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(saved)

    const { saver, last } = setUp(send)

    saver.edit("Lea")

    const done = saver.flush()

    await vi.advanceTimersByTimeAsync(0)

    await expect(done).resolves.toBe(false)
    expect(last()?.status).toBe("retrying")

    await vi.advanceTimersByTimeAsync(RETRY)

    expect(last()?.status).toBe("saved")
  })

  it("flush with nothing to save sends nothing and says it worked", async () => {
    const send = vi.fn(async () => saved)
    const { saver } = setUp(send)

    await expect(saver.flush()).resolves.toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it("sends nothing once disposed", async () => {
    const send = vi.fn(async () => saved)
    const { saver } = setUp(send)

    saver.edit("Lea")
    saver.dispose()
    await vi.advanceTimersByTimeAsync(DELAY * 2)

    expect(send).not.toHaveBeenCalled()
  })
})
