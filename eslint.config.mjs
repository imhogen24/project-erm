import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const workbooks = ["wb01", "wb02", "wb03", "wb04", "wb05"]

const forbid = (...groups) => [
  "error",
  {
    patterns: groups.map(([group, message]) => ({
      // "@/db" has no trailing path, so each folder is also matched on its own.
      group: group.flatMap((pattern) => [
        pattern,
        pattern.replace(/\/\*\*$/, ""),
      ]),
      message,
    })),
  },
]

// Who may use whom: see docs/ARCHITECTURE/_.md.
const importDirections = [
  {
    files: ["db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": forbid([
        [
          "**/server/**",
          "**/workbooks/**",
          "**/components/**",
          "**/app/**",
          "**/lib/**",
        ],
        "db/ uses nothing else in the project.",
      ]),
    },
  },
  {
    files: ["server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": forbid([
        ["**/workbooks/**", "**/app/**", "**/components/**"],
        "server/ may only use db/ and lib/.",
      ]),
    },
  },
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": forbid([
        ["**/db/**", "**/server/**", "**/workbooks/**", "**/app/**"],
        "components/ may only use lib/.",
      ]),
    },
  },
  ...workbooks.map((workbook) => ({
    files: [`workbooks/${workbook}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": forbid(
        [
          workbooks.flatMap((other) =>
            other === workbook ? [] : [`**/workbooks/${other}/**`]
          ),
          "A workbook never uses another workbook. Move shared code to server/ or components/.",
        ],
        [["**/app/**"], "workbooks/ never uses app/."]
      ),
    },
  })),
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent/skill tooling, not app source:
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ]),
  ...importDirections,
])

export default eslintConfig
