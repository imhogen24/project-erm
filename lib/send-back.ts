import type { JsonObject } from "@/db/schema"
import type { FormValues, ToolDefinition } from "@/lib/tool-definition"

// Whether a review with an approver holds the answer that sends earlier
// work back (`sendsBackTo`), such as D3.8 with the funds not fully
// accounted for. It cannot be approved then: the approver's Send back locks
// it and reopens that work instead.
export function answersSendBack(
  tool: Pick<ToolDefinition, "sendsBackTo" | "locksOnSubmit">,
  payload: JsonObject | FormValues
): boolean {
  const back = tool.sendsBackTo

  return (
    !tool.locksOnSubmit && back !== undefined && payload[back.field] === back.is
  )
}
