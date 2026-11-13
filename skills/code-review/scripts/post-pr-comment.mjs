#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const USAGE = [
  "Helper: post-pr-comment.mjs --review-mode pr --pr-url <url> --review-dir <dir> [--translation-language-code <code>]",
  "Helper: post-pr-comment.mjs --review-mode branch|local-changes --current-branch <branch> --target-branch <branch> --review-dir <dir> [--translation-language-code <code>]",
].join("\n");

function fail(message, includeUsage = false) {
  console.error(message);
  if (includeUsage) {
    console.error(USAGE);
  }
  process.exit(1);
}

function skip(reason, details = {}) {
  process.stdout.write(
    `${JSON.stringify({ status: "skipped", reason, ...details }, null, 2)}\n`,
  );
  process.exit(0);
}

function run(command, args, options = {}) {
  try {
    return childProcess
      .execFileSync(command, args, {
        cwd: options.cwd || process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      .trimEnd();
  } catch (error) {
    if (options.allowFailure) {
      return null;
    }

    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const suffix = stderr ? `\n${stderr}` : "";
    fail(`${command} ${args.join(" ")} failed.${suffix}`);
  }
}

function parseJson(value, context) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`${context} returned invalid JSON.`);
  }
}

function readArgs() {
  const args = process.argv.slice(2);
  const options = {
    currentBranch: null,
    prUrl: null,
    reviewDir: null,
    reviewMode: null,
    targetBranch: null,
    translationLanguageCode: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--review-mode") {
      options.reviewMode = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--current-branch") {
      options.currentBranch = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--target-branch") {
      options.targetBranch = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--pr-url") {
      options.prUrl = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--review-dir") {
      options.reviewDir = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--translation-language-code") {
      options.translationLanguageCode = args[index + 1] || null;
      index += 1;
      continue;
    }

    fail(`Unknown helper option: ${arg}`, true);
  }

  if (!["pr", "branch", "local-changes"].includes(options.reviewMode)) {
    fail("--review-mode must be pr, branch, or local-changes.", true);
  }
  if (!options.reviewDir) {
    fail("--review-dir is required.", true);
  }
  if (options.reviewMode === "pr" && !options.prUrl) {
    fail("--pr-url is required for PR review.", true);
  }
  if (options.reviewMode === "branch" && (!options.currentBranch || !options.targetBranch)) {
    fail("--current-branch and --target-branch are required for branch review.", true);
  }
  if (
    options.translationLanguageCode &&
    !/^[a-z]{2}$/.test(options.translationLanguageCode)
  ) {
    fail("--translation-language-code must be a two-letter ISO 639-1 code.", true);
  }

  return options;
}

function selectedSourceFile(options) {
  const fileName = options.translationLanguageCode
    ? `index-${options.translationLanguageCode}.md`
    : "index.md";
  return path.join(options.reviewDir, fileName);
}

function exactSameRepositoryPr(pr, options) {
  return (
    pr.headRefName === options.currentBranch &&
    pr.baseRefName === options.targetBranch &&
    pr.state === "OPEN" &&
    pr.isCrossRepository === false
  );
}

function findBranchPr(repo, options) {
  const candidates = parseJson(
    run("gh", [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--base",
      options.targetBranch,
      "--head",
      options.currentBranch,
      "--json",
      "number,url,headRefName,baseRefName,isCrossRepository,state",
      "--limit",
      "20",
    ]),
    "gh pr list",
  );

  // --head matches fork branches with the same name too, so filter again.
  const exactCandidates = candidates.filter((pr) =>
    exactSameRepositoryPr(pr, options),
  );

  if (exactCandidates.length > 1) {
    skip("PR lookup was ambiguous.", {
      candidate_count: exactCandidates.length,
      repo,
    });
  }
  if (exactCandidates.length === 0) {
    skip("No open same-repository PR was found for the reviewed branches.", {
      repo,
      current_branch: options.currentBranch,
      target_branch: options.targetBranch,
    });
  }

  return exactCandidates[0];
}

function requestedPr(options) {
  const pr = parseJson(
    run("gh", ["pr", "view", options.prUrl, "--json", "number,url"]),
    "gh pr view",
  );
  return { repo: pr.url.split("/").slice(3, 5).join("/"), pr };
}

function branchPr(options) {
  const originUrl = run("git", ["remote", "get-url", "origin"], {
    allowFailure: true,
  });
  if (originUrl === null) {
    skip("Origin GitHub repository could not be resolved.");
  }

  const repoOutput = run(
    "gh",
    ["repo", "view", originUrl, "--json", "nameWithOwner,url"],
    { allowFailure: true },
  );
  if (repoOutput === null) {
    skip("Origin GitHub repository could not be resolved.");
  }

  const repoInfo = parseJson(repoOutput, "gh repo view");
  if (!repoInfo.nameWithOwner) {
    skip("Origin GitHub repository could not be resolved.");
  }

  return {
    repo: repoInfo.nameWithOwner,
    pr: findBranchPr(repoInfo.nameWithOwner, options),
  };
}

function main() {
  const options = readArgs();

  if (options.reviewMode === "local-changes") {
    skip("Local changes reviews must never be posted to a PR.");
  }

  const sourceFile = selectedSourceFile(options);
  if (!fs.existsSync(sourceFile)) {
    fail(`Selected PR comment source file does not exist: ${sourceFile}`);
  }

  const body = fs.readFileSync(sourceFile, "utf8");
  if (body.length === 0) {
    fail(`Selected PR comment source file is empty: ${sourceFile}`);
  }

  const { repo, pr } =
    options.reviewMode === "pr" ? requestedPr(options) : branchPr(options);

  run("gh", [
    "pr",
    "comment",
    String(pr.number),
    "--repo",
    repo,
    "--body-file",
    sourceFile,
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "posted",
        repo,
        pr_number: pr.number,
        pr_url: pr.url,
        selected_source_file: sourceFile,
      },
      null,
      2,
    )}\n`,
  );
}

main();
