import { deliveryRun } from "./delivery-run"
import { intakeRun } from "./intake-run"

// Every function /api/inngest serves.
export const functions = [intakeRun, deliveryRun]
