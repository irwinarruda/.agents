#!/usr/bin/env node

import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: council.mjs <command> [options]   (run from the project root)
  init                               create .ui-council/ with a starter config
  capture [--references]             screenshot every page into a new round, or the reference URLs
  brief [--round N | --references]   write the judge brief for a round (default: latest) or for calibration
  score [--round N | --references]   validate the verdicts, aggregate the weighted scores, decide pass or fail
  attachments [--round N | --references]   list the brief's images in batches of 8, for judges that get images as attachments
  upload                             read [{file, relativeUrl}] JSON on stdin and upload each file to the T3 server`;

const SkillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ProjectDir = process.cwd();
const CouncilDir = path.join(ProjectDir, ".ui-council");
const ReferencesDir = path.join(CouncilDir, "references");
const RoundsDir = path.join(CouncilDir, "rounds");
const ImageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const SeverityRank = { high: 0, medium: 1, low: 2 };
const AttachmentLimitBytes = 10 * 1024 * 1024;
const AttachmentsPerMessage = 8;
// How far a module's weighted score moves between rounds when nothing meaningful
// changed: fresh judges do not repeat themselves. A smaller difference is not a result.
const NoiseMargin = 0.2;
const Council = readJson(path.join(SkillDir, "council.json"));
const Criteria = Object.keys(Council.criteria);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { references: false, round: undefined };
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === "--references") {
      options.references = true;
    } else if (rest[index] === "--round") {
      options.round = Number(rest[++index]);
    } else {
      fail(`Unknown option ${rest[index]}\n${USAGE}`);
    }
  }
  return { command, options };
}

function loadConfig() {
  const file = path.join(CouncilDir, "config.json");
  if (!fs.existsSync(file)) {
    fail("No .ui-council/config.json here. Run `council.mjs init` from the project root first.");
  }
  return readJson(file);
}

function listRounds() {
  if (!fs.existsSync(RoundsDir)) {
    return [];
  }
  return fs
    .readdirSync(RoundsDir)
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .sort((a, b) => a - b);
}

function roundPath(round) {
  return path.join(RoundsDir, String(round).padStart(2, "0"));
}

function git(args) {
  return childProcess.execFileSync("git", args, { cwd: ProjectDir, encoding: "utf8" }).trim();
}

function gitLines(args) {
  return git(args).split("\n").filter(Boolean);
}

// Judges only give opinions. `brief` snapshots the working tree; `score` puts back
// any project file that changed since then, keeping the changed copy for inspection.
function snapshotTree(dir) {
  const base = git(["stash", "create"]) || git(["rev-parse", "HEAD"]);
  writeJson(path.join(dir, "guard.json"), { base, untracked: gitLines(["ls-files", "--others", "--exclude-standard"]) });
}

function revertJudgeEdits(dir) {
  const guardFile = path.join(dir, "guard.json");
  if (!fs.existsSync(guardFile)) {
    return { checked: false };
  }
  const { base, untracked } = readJson(guardFile);
  const before = new Set(untracked);
  const outsideCouncil = ["--", ".", ":(exclude).ui-council"];
  const changed = gitLines(["diff", "--name-only", base, ...outsideCouncil]);
  const added = gitLines(["ls-files", "--others", "--exclude-standard", ...outsideCouncil]).filter((file) => !before.has(file));
  const savedDir = path.join(dir, "judge-edits");
  for (const file of [...changed, ...added]) {
    const source = path.join(ProjectDir, file);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(path.join(savedDir, file)), { recursive: true });
      fs.copyFileSync(source, path.join(savedDir, file));
    }
  }
  if (changed.length > 0) {
    git(["restore", `--source=${base}`, "--worktree", "--", ...changed]);
  }
  for (const file of added) {
    fs.rmSync(path.join(ProjectDir, file), { force: true });
  }
  const reverted = [...changed, ...added];
  return { checked: true, reverted, savedTo: reverted.length > 0 ? savedDir : undefined };
}

function resolveTarget(options) {
  if (options.references) {
    return { dir: ReferencesDir, label: "calibration" };
  }
  const round = options.round ?? listRounds().at(-1);
  if (round === undefined) {
    fail("No rounds yet. Run `council.mjs capture` first.");
  }
  const dir = roundPath(round);
  if (!fs.existsSync(dir)) {
    fail(`Round ${round} does not exist.`);
  }
  return { dir, label: `round ${round}`, round };
}

function referenceGroups(config) {
  return (config.references ?? []).map((reference) => {
    const dir = path.join(ReferencesDir, reference.name);
    const images = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => ImageExtensions.includes(path.extname(file).toLowerCase()))
          .sort()
          .map((file) => path.join(dir, file))
      : [];
    if (images.length === 0) {
      fail(`Reference "${reference.name}" has no images. Run \`capture --references\` or drop screenshots into ${dir}`);
    }
    return { ...reference, images };
  });
}

function init() {
  fs.mkdirSync(ReferencesDir, { recursive: true });
  const configFile = path.join(CouncilDir, "config.json");
  const createdConfig = !fs.existsSync(configFile);
  if (createdConfig) {
    fs.copyFileSync(path.join(SkillDir, "config.example.json"), configFile);
  }
  let excludeFile;
  try {
    excludeFile = path.resolve(
      ProjectDir,
      childProcess.execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    );
    const current = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, "utf8") : "";
    const missing = [".ui-council/"].filter((line) => !current.split("\n").includes(line));
    if (missing.length > 0) {
      const separator = current === "" || current.endsWith("\n") ? "" : "\n";
      fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
      fs.appendFileSync(excludeFile, `${separator}${missing.join("\n")}\n`);
    }
  } catch {
    excludeFile = undefined;
  }
  print({ councilDir: CouncilDir, config: configFile, createdConfig, gitExcludeFile: excludeFile });
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const scriptsDir = path.join(SkillDir, "scripts");
    fail(`Playwright is not installed for this skill. Run once:\n  cd "${scriptsDir}" && npm install && npx playwright install chromium`);
  }
}

async function isUp(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function startDevServer(dev) {
  if (await isUp(dev.url)) {
    return { reused: true, stop() {} };
  }
  const log = fs.openSync(path.join(CouncilDir, "dev.log"), "w");
  const child = childProcess.spawn(dev.command, { cwd: ProjectDir, shell: true, detached: true, stdio: ["ignore", log, log] });
  function stop() {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  const deadline = Date.now() + (dev.readyTimeoutSeconds ?? 120) * 1000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`\`${dev.command}\` exited with code ${child.exitCode} before ${dev.url} answered. See .ui-council/dev.log`);
    }
    if (await isUp(dev.url)) {
      return { reused: false, stop };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  fail(`${dev.url} did not answer within ${dev.readyTimeoutSeconds ?? 120}s. See .ui-council/dev.log`);
}

async function runStep(page, step) {
  switch (step.action) {
    case "click":
      return page.locator(step.selector).first().click();
    case "fill":
      return page.locator(step.selector).first().fill(String(step.value ?? ""));
    case "hover":
      return page.locator(step.selector).first().hover();
    case "press":
      return page.keyboard.press(step.value);
    case "waitFor":
      return page.locator(step.selector).first().waitFor();
    case "wait":
      return page.waitForTimeout(Number(step.value ?? 500));
    case "scroll":
      return page.mouse.wheel(0, Number(step.value ?? 600));
    default:
      throw new Error(`Unknown step action "${step.action}"`);
  }
}

async function shoot(browser, { url, viewport, steps, file, fullPage }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "reduce",
    ...(viewport.colorScheme ? { colorScheme: viewport.colorScheme } : {}),
  });
  if (viewport.cookies?.length) {
    await context.addCookies(viewport.cookies.map((cookie) => ({ url: new URL(url).origin, ...cookie })));
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.waitForLoadState("load"));
    for (const step of steps ?? []) {
      await runStep(page, step);
    }
    await page.waitForTimeout(400);
  } catch (error) {
    errors.push(`capture: ${error.message.split("\n")[0]}`);
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage, animations: "disabled" });
  } catch (error) {
    errors.push(`screenshot failed: ${error.message.split("\n")[0]}`);
  }
  await context.close();
  return errors;
}

async function capture(options) {
  const config = loadConfig();
  const { chromium } = await importPlaywright();
  const viewports = config.viewports ?? [{ name: "desktop", width: 1440, height: 900 }];
  if (options.references) {
    const browser = await chromium.launch();
    try {
      const captured = [];
      for (const reference of (config.references ?? []).filter((entry) => entry.url)) {
        for (const viewport of viewports) {
          const file = path.join(ReferencesDir, reference.name, `captured__${viewport.name}.png`);
          const errors = await shoot(browser, { url: reference.url, viewport, file, fullPage: false });
          captured.push({ reference: reference.name, file, errors: errors.slice(0, 5) });
        }
      }
      print({ referencesDir: ReferencesDir, captured });
    } finally {
      await browser.close();
    }
    return;
  }
  if (!config.pages?.length) {
    fail("config.pages is empty. List the pages to capture first.");
  }
  const round = (listRounds().at(-1) ?? 0) + 1;
  const dir = roundPath(round);
  const server = await startDevServer(config.dev);
  const browser = await chromium.launch();
  try {
    const shots = [];
    for (const target of config.pages) {
      for (const viewport of viewports) {
        if (viewport.pages === "key" && !target.key) {
          continue;
        }
        const file = path.join(dir, "screenshots", `${target.module}__${target.name}__${viewport.name}.png`);
        const url = new URL(target.path, config.dev.url).href;
        const errors = await shoot(browser, { url, viewport, steps: target.steps, file, fullPage: target.fullPage ?? true });
        shots.push({ module: target.module, page: target.name, viewport: viewport.name, file, errors });
      }
    }
    writeJson(path.join(dir, "manifest.json"), { round, capturedAt: new Date().toISOString(), baseUrl: config.dev.url, shots });
    const byContent = Map.groupBy(
      shots.filter((shot) => fs.existsSync(shot.file)),
      (shot) => `${shot.viewport}:${crypto.createHash("sha1").update(fs.readFileSync(shot.file)).digest("hex")}`,
    );
    print({
      round,
      dir,
      reusedRunningServer: server.reused,
      shots: shots.length,
      identicalShots: [...byContent.values()]
        .filter((group) => new Set(group.map((shot) => `${shot.module}/${shot.page}`)).size > 1)
        .map((group) => group.map((shot) => path.basename(shot.file))),
      shotsWithErrors: shots.filter((shot) => shot.errors.length > 0).map((shot) => ({ file: path.basename(shot.file), errors: shot.errors.slice(0, 5) })),
    });
  } finally {
    await browser.close();
    server.stop();
  }
}

function renderReferences(config) {
  if (!config.references?.length) {
    return "The user gave no references for this project. Use the scale table alone.";
  }
  const scoreFile = path.join(ReferencesDir, "score.json");
  if (!fs.existsSync(scoreFile)) {
    fail("The references have not been calibrated yet. Run the calibration round first.");
  }
  const scores = readJson(scoreFile).modules;
  const blocks = referenceGroups(config).map((reference) => {
    const grades = Criteria.map((criterion) => `${criterion} ${scores[reference.name]?.[criterion]?.weighted ?? "?"}`).join(", ");
    const notes = reference.notes ? `\n\nWhat the user likes about it: ${reference.notes}` : "";
    return `### ${reference.name} (council score: ${grades})${notes}\n\n${reference.images.map((file) => `- ${file}`).join("\n")}`;
  });
  const summaryFile = path.join(ReferencesDir, "summary.md");
  const summary = fs.existsSync(summaryFile) ? `\n\n### What makes them work\n\n${fs.readFileSync(summaryFile, "utf8").trim()}` : "";
  return `${blocks.join("\n\n")}${summary}`;
}

function brief(options) {
  const config = loadConfig();
  const target = resolveTarget(options);
  const variables = {
    criteria: Object.entries(Council.criteria)
      .map(([criterion, description]) => `- **${criterion}**: ${description}`)
      .join("\n"),
    scoreKeys: Criteria.map((criterion) => `"${criterion}": <1-10>`).join(", "),
    criterionList: Criteria.join(", "),
    verdictPath: path.join(target.dir, "verdicts", "<your judge id>.json"),
  };
  let template;
  if (options.references) {
    template = "judge-calibrate.md";
    variables.screens = referenceGroups(config)
      .map((reference) => {
        const notes = reference.notes ? `What the user likes about it: ${reference.notes}\n\n` : "";
        return `### ${reference.name}\n\n${notes}${reference.images.map((file) => `- ${file}`).join("\n")}`;
      })
      .join("\n\n");
  } else {
    template = "judge-evaluate.md";
    const manifest = readJson(path.join(target.dir, "manifest.json"));
    const modules = Map.groupBy(manifest.shots, (shot) => shot.module);
    variables.round = String(manifest.round);
    variables.references = renderReferences(config);
    variables.screens = [...modules]
      .map(([module, shots]) => `### ${module}\n\n${shots.map((shot) => `- ${shot.file} (${shot.page}, ${shot.viewport})`).join("\n")}`)
      .join("\n\n");
  }
  const text = fs
    .readFileSync(path.join(SkillDir, "templates", template), "utf8")
    .replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
  const briefFile = path.join(target.dir, "brief.md");
  writeFile(briefFile, text);
  fs.mkdirSync(path.join(target.dir, "verdicts"), { recursive: true });
  snapshotTree(target.dir);
  print({
    brief: briefFile,
    verdictsDir: path.join(target.dir, "verdicts"),
    judges: Council.judges.map((judge) => ({
      id: judge.id,
      label: judge.label,
      weight: judge.weight,
      images: judge.images ?? "files",
      ...(judge.runtimeMode ? { runtimeMode: judge.runtimeMode } : {}),
      target: judge.target,
    })),
  });
}

function attachments(options) {
  const config = loadConfig();
  const target = resolveTarget(options);
  const referenceFiles = config.references?.length ? referenceGroups(config).flatMap((reference) => reference.images) : [];
  const roundFiles = options.references ? [] : readJson(path.join(target.dir, "manifest.json")).shots.map((shot) => shot.file);
  const files = [...referenceFiles, ...roundFiles].map((file) => {
    const sizeBytes = fs.statSync(file).size;
    if (sizeBytes > AttachmentLimitBytes) {
      fail(`${file} is ${sizeBytes} bytes, above the 10 MB attachment limit. Lower that page's height or set fullPage to false.`);
    }
    const extension = path.extname(file).slice(1).toLowerCase();
    return {
      name: path.relative(CouncilDir, file),
      file,
      mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
      sizeBytes,
    };
  });
  const batches = [];
  for (let index = 0; index < files.length; index += AttachmentsPerMessage) {
    batches.push(files.slice(index, index + AttachmentsPerMessage));
  }
  print({ brief: path.join(target.dir, "brief.md"), total: files.length, batches });
}

async function upload() {
  const uploads = JSON.parse(fs.readFileSync(0, "utf8"));
  const runtimeFile = path.join(os.homedir(), ".t3", "userdata", "server-runtime.json");
  const { origin } = readJson(runtimeFile);
  const results = [];
  for (const { file, relativeUrl } of uploads) {
    const response = await fetch(new URL(relativeUrl, origin), { method: "POST", body: fs.readFileSync(file) });
    results.push({ file: path.basename(file), status: response.status });
  }
  const failed = results.filter((result) => result.status >= 300);
  print({ uploaded: results.length - failed.length, failed });
  if (failed.length > 0) {
    process.exit(1);
  }
}

function validateVerdict(verdict, expectedModules) {
  if (typeof verdict !== "object" || verdict === null) {
    return ["not a JSON object"];
  }
  if (verdict.viewed_images !== true) {
    return ["the judge says it could not view the images"];
  }
  if (!Array.isArray(verdict.modules)) {
    return ["`modules` is not an array"];
  }
  const problems = [];
  for (const name of expectedModules) {
    const entry = verdict.modules.find((module) => module.module === name);
    if (!entry) {
      problems.push(`module "${name}" missing`);
      continue;
    }
    for (const criterion of Criteria) {
      const score = entry.scores?.[criterion];
      if (typeof score !== "number" || score < 1 || score > 10) {
        problems.push(`"${name}".${criterion} is not a number from 1 to 10`);
      }
    }
    for (const issue of entry.issues ?? []) {
      if (!(issue.severity in SeverityRank)) {
        problems.push(`"${name}" has an issue with severity "${issue.severity}"`);
      }
    }
  }
  return problems;
}

function renderReport(result, accepted, label) {
  let status = result.threshold === undefined ? "SCORED" : "NOT YET";
  if (accepted.length === 0) {
    status = "NO SCORE: no judge returned a valid verdict";
  } else if (result.passed) {
    status = "PASSED";
  }
  const absent = [...result.missing, ...result.invalid.map(({ judge }) => judge)];
  if (absent.length > 0 && accepted.length > 0) {
    status += ` (left out of the average: ${absent.join(", ")})`;
  }
  const judgeIds = accepted.map(({ judge }) => judge.id);
  const header = `| module | ${Criteria.map((criterion) => `${criterion} (weighted)`).join(" | ")} | ${Criteria.flatMap((criterion) => judgeIds.map((id) => `${criterion} ${id}`)).join(" | ")} |`;
  const divider = `|${"---|".repeat(1 + Criteria.length + Criteria.length * judgeIds.length)}`;
  const rows = Object.entries(result.modules).map(([module, scores]) => {
    const weighted = Criteria.map((criterion) => scores[criterion].weighted ?? "-");
    const perJudge = Criteria.flatMap((criterion) => judgeIds.map((id) => scores[criterion].byJudge[id]));
    return `| ${module} | ${weighted.join(" | ")} | ${perJudge.join(" | ")} |`;
  });
  const sections = Object.keys(result.modules).map((module) => {
    const strengths = [];
    const issues = [];
    for (const { judge, verdict } of accepted) {
      const entry = verdict.modules.find((candidate) => candidate.module === module);
      for (const strength of entry.strengths ?? []) {
        strengths.push(`- [${judge.id}] ${strength}`);
      }
      for (const issue of entry.issues ?? []) {
        issues.push({ ...issue, judge });
      }
    }
    issues.sort((a, b) => SeverityRank[a.severity] - SeverityRank[b.severity] || b.judge.weight - a.judge.weight);
    const scores = Criteria.map((criterion) => `${criterion} ${result.modules[module][criterion].weighted ?? "-"}`).join(", ");
    const issueLines = issues.map(
      (issue) => `- **${issue.severity}** · [${issue.judge.id}] \`${issue.screen ?? "?"}\`: ${issue.problem} → ${issue.fix}`,
    );
    return `### ${module} (${scores})\n\n**Strengths**\n\n${strengths.join("\n") || "- none listed"}\n\n**Issues**\n\n${issueLines.join("\n") || "- none listed"}`;
  });
  const overall = accepted.map(({ judge, verdict }) => `- [${judge.id}] ${verdict.overall ?? ""}`);
  const problems = [
    ...result.missing.map((id) => `- ${id}: no verdict file`),
    ...result.invalid.map(({ judge, reason }) => `- ${judge}: ${reason}`),
  ];
  return [
    `# Council report: ${label}`,
    `**Status:** ${status}${result.threshold === undefined ? "" : ` · bar ${result.threshold} overall, no module below ${result.moduleFloor}${result.thresholdCapped ? ` (asked for ${result.requestedThreshold}, capped at the references' score)` : ""}`} · overall ${result.overall ?? "-"}`,
    problems.length > 0 ? `## Judges left out of this round\n\n${problems.join("\n")}` : "",
    `## Scores\n\n${header}\n${divider}\n${rows.join("\n")}`,
    `## Findings by module\n\n${sections.join("\n\n")}`,
    `## Overall impressions\n\n${overall.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// The council's scale is its own: the user's references are what "excellent" means on it,
// whatever number they got. So the bar is the lower of what the user asked for and what
// the references scored, unless the user chose to aim above them.
//
// Judges are not equally strict, so the references are scored with the same judges that
// were counted in the round. A round one judge missed is then compared like with like.
function resolveGoal(config, judgeIds) {
  const requested = config.goal?.threshold;
  const scoreFile = path.join(ReferencesDir, "score.json");
  let references;
  let recalibrate = [];
  if (fs.existsSync(scoreFile)) {
    const modules = readJson(scoreFile).modules;
    const calibrated = judgeIds.filter((id) => overallFor(modules, [id]) !== undefined);
    recalibrate = judgeIds.filter((id) => !calibrated.includes(id));
    references = overallFor(modules, calibrated);
  }
  const capped = requested !== undefined && references !== undefined && config.goal?.capAtReferences !== false && references < requested;
  return { requested, references, capped, recalibrate, threshold: capped ? references : requested };
}

// The weighted overall score of a score.json's modules, counting only these judges at
// today's weights. Undefined when one of them did not grade every module there.
function overallFor(modules, judgeIds) {
  const weights = new Map(Council.judges.map((judge) => [judge.id, judge.weight]));
  const values = [];
  for (const scores of Object.values(modules)) {
    for (const criterion of Criteria) {
      let total = 0;
      let weight = 0;
      for (const id of judgeIds) {
        const value = scores[criterion]?.byJudge?.[id];
        if (typeof value !== "number" || !weights.has(id)) {
          return undefined;
        }
        total += value * weights.get(id);
        weight += weights.get(id);
      }
      if (weight > 0) {
        values.push(total / weight);
      }
    }
  }
  return values.length > 0 ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined;
}

function history() {
  return listRounds()
    .map((round) => path.join(roundPath(round), "score.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const score = readJson(file);
      const weighted = Object.values(score.modules)
        .flatMap((scores) => Criteria.map((criterion) => scores[criterion].weighted))
        .filter((value) => value !== undefined);
      const byJudge = Object.fromEntries(score.counted.map((id) => [id, overallFor(score.modules, [id])]));
      return { round: score.round, overall: score.overall, lowest: weighted.length > 0 ? Math.min(...weighted) : undefined, byJudge, counted: score.counted, passed: score.passed };
    });
}

function score(options) {
  const config = loadConfig();
  const target = resolveTarget(options);
  const judgeEdits = revertJudgeEdits(target.dir);
  const expectedModules = options.references
    ? referenceGroups(config).map((reference) => reference.name)
    : [...new Set(readJson(path.join(target.dir, "manifest.json")).shots.map((shot) => shot.module))];
  const accepted = [];
  const missing = [];
  const invalid = [];
  for (const judge of Council.judges) {
    const file = path.join(target.dir, "verdicts", `${judge.id}.json`);
    if (!fs.existsSync(file)) {
      missing.push(judge.id);
      continue;
    }
    let verdict;
    try {
      verdict = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      invalid.push({ judge: judge.id, reason: `not valid JSON: ${error.message}` });
      continue;
    }
    const problems = validateVerdict(verdict, expectedModules);
    if (problems.length > 0) {
      invalid.push({ judge: judge.id, reason: problems.join("; ") });
    } else {
      accepted.push({ judge, verdict });
    }
  }
  const counted = accepted.map(({ judge }) => judge.id);
  const goal = options.references ? {} : resolveGoal(config, counted);
  const threshold = goal.threshold;
  const moduleFloor = threshold === undefined ? undefined : round2(threshold - NoiseMargin);
  const modules = {};
  const failing = [];
  const allWeighted = [];
  for (const name of expectedModules) {
    modules[name] = {};
    for (const criterion of Criteria) {
      const byJudge = {};
      let total = 0;
      let weight = 0;
      for (const { judge, verdict } of accepted) {
        const value = verdict.modules.find((module) => module.module === name).scores[criterion];
        byJudge[judge.id] = value;
        total += value * judge.weight;
        weight += judge.weight;
      }
      const values = Object.values(byJudge);
      const weighted = weight > 0 ? total / weight : undefined;
      modules[name][criterion] = {
        weighted: weighted === undefined ? undefined : round2(weighted),
        spread: values.length > 0 ? round2(Math.max(...values) - Math.min(...values)) : undefined,
        byJudge,
      };
      if (weighted !== undefined) {
        allWeighted.push(weighted);
        if (threshold !== undefined && weighted < threshold) {
          failing.push({ module: name, criterion, weighted: round2(weighted) });
        }
      }
    }
  }
  const overall = allWeighted.length > 0 ? round2(allWeighted.reduce((sum, value) => sum + value, 0) / allWeighted.length) : undefined;
  const lowest = allWeighted.length > 0 ? round2(Math.min(...allWeighted)) : undefined;
  // Earlier rounds are re-read with this round's judges, so a missing judge does not fake a gain or a drop.
  const earlier = options.references
    ? []
    : listRounds()
        .filter((round) => round < target.round && fs.existsSync(path.join(roundPath(round), "score.json")))
        .map((round) => ({ round, overall: overallFor(readJson(path.join(roundPath(round), "score.json")).modules, counted) }))
        .filter((entry) => entry.overall !== undefined);
  const best = earlier.reduce((top, entry) => (top === undefined || entry.overall > top.overall ? entry : top), undefined);
  const gain = best === undefined || overall === undefined ? undefined : round2(overall - best.overall);
  const result = {
    round: target.round ?? "calibration",
    counted,
    passed: overall !== undefined && threshold !== undefined && overall >= threshold && lowest >= moduleFloor && goal.recalibrate.length === 0,
    threshold,
    moduleFloor,
    requestedThreshold: goal.requested,
    referencesOverall: goal.references,
    thresholdCapped: goal.capped,
    recalibrate: goal.recalibrate,
    overall,
    best: best === undefined ? undefined : { round: best.round, overall: best.overall },
    plateau: gain === undefined ? undefined : gain < NoiseMargin,
    regressed: gain === undefined ? undefined : gain <= -NoiseMargin,
    missing,
    invalid,
    failing: failing.sort((a, b) => a.weighted - b.weighted),
    modules,
  };
  writeJson(path.join(target.dir, "score.json"), result);
  const reportFile = path.join(target.dir, "report.md");
  writeFile(reportFile, `${renderReport(result, accepted, target.label)}\n`);
  const { modules: _modules, ...summary } = result;
  print({ ...summary, judgeEdits, report: reportFile, history: options.references ? undefined : history() });
}

const { command, options } = parseArgs(process.argv.slice(2));
switch (command) {
  case "init":
    init();
    break;
  case "capture":
    await capture(options);
    break;
  case "brief":
    brief(options);
    break;
  case "score":
    score(options);
    break;
  case "attachments":
    attachments(options);
    break;
  case "upload":
    await upload();
    break;
  default:
    fail(USAGE);
}
