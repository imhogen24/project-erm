# Vendored anti-slop Oxlint plugin

Source repository: [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop), distributed via the `install-anti-slop` Claude Code skill.

Exact upstream commit is unknown — the skill package carries no commit SHA, only the skill's own content hash (`4031728fbe75bdcad6ee3208fd52b5d66e167b056fefee1fa9758e9a6cb9c0c8`, recorded in `skills-lock.json`). Recorded as unknown rather than guessed, per the skill's own instructions.

Installed via `.agents/skills/install-anti-slop/scripts/install.mjs`, which copies `.agents/skills/install-anti-slop/assets/anti-slop/` to this directory verbatim.

Installed paths:

- `tools/oxlint/anti-slop/index.ts` — generic plugin entry point, registered in `.oxlintrc.json` under `jsPlugins`
- `tools/oxlint/anti-slop/rules/` — generic rules (see `.oxlintrc.json` for the enabled set)
- `tools/oxlint/anti-slop/shared/` — shared helpers used by the rules above
- `tools/oxlint/anti-slop/vendor/eslint-stylistic/` — vendored `padding-line-between-statements` rule from ESLint Stylistic; provenance recorded separately in `vendor/eslint-stylistic/UPSTREAM.md`
- `tools/oxlint/anti-slop/effect/` — opt-in Effect-specific rules, copied but **not registered** (this repo has no `effect` dependency)

No intentional deviations from the copied assets.
