#!/usr/bin/env node
// Registers the dotenvx protect filter in LOCAL git config only (.git/config),
// never --global. Global registration affects every other repo on the machine
// and hardcodes a path into this repo's node_modules — see docs/STACK/_.md.
import { execFileSync } from "node:child_process"
import path from "node:path"

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function quote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

const repoRoot = git("rev-parse", "--show-toplevel")

const dotenvxCli = path.join(
  repoRoot,
  "node_modules/@dotenvx/dotenvx/src/cli/dotenvx.js",
)

const executable = `${quote(process.execPath)} ${quote(dotenvxCli)}`

git("config", "filter.dotenvx.protect.clean", `${executable} protect --git-file %f`)

git("config", "filter.dotenvx.protect.process", `${executable} protect --git-process`)

git("config", "filter.dotenvx.protect.required", "true")

console.log("dotenvx protect filter registered in local git config (this repo only)")
