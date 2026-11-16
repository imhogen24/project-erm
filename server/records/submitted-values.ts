import type { JsonObject } from "@/db/schema"
import { COST_ESTIMATION } from "@/lib/cost-estimation"
import type { Transaction } from "@/server/audit/audit"
import { costOnSubmit } from "@/server/cost/cost-estimation"

import type { FieldError } from "./validate"

// What a tool works out from its own answers when it is submitted, such as
// D1.14's totals, stored with the submitted copy so the workflow can read
// them; and what stops the submit while those sums are wrong.
export async function submittedValues(
  transaction: Pick<Transaction, "select">,
  record: { toolId: string; projectId: string; payload: JsonObject }
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  switch (record.toolId) {
    case COST_ESTIMATION: {
      return costOnSubmit(transaction, record.projectId, record.payload)
    }

    default: {
      return { values: {}, errors: [] }
    }
  }
}
