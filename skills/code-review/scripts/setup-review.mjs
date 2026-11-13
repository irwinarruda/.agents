#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const USAGE =
  "Usage: setup-review.mjs [--fetch] [--pr <url|number>] [--mode branch|local-changes] [--target-branch <branch>] [--translation-language-code <code>] [--pr-comment-requested]";

const PR_FIELDS = [
  "number",
  "url",
  "title",
  "body",
  "state",
  "baseRefName",
  "baseRefOid",
  "headRefName",
  "isCrossRepository",
].join(",");

function fail(message, includeUsage = false) {
  console.error(message);
  if (includeUsage) {
    console.error(USAGE);
  }
  process.exit(1);
}

function run(command, args, options = {}) {
  try {
    return childProcess
      .execFileSync(command, args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
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
    fetch: false,
    mode: null,
    pr: null,
    prCommentRequested: false,
    targetBranch: null,
    translationLanguageCode: null,
  };

  function valueAt(index) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${args[index]} requires a value.`, true);
    }
    return value;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--" && index === args.length - 1) {
      continue;
    }
    if (arg === "--fetch") {
      options.fetch = true;
      continue;
    }
    if (arg === "--pr-comment-requested") {
      options.prCommentRequested = true;
      continue;
    }
    if (arg === "--pr") {
      options.pr = valueAt(index);
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      options.mode = valueAt(index);
      index += 1;
      continue;
    }
    if (arg === "--target-branch") {
      options.targetBranch = valueAt(index).replace(/^origin\//, "");
      index += 1;
      continue;
    }
    if (arg === "--translation-language-code") {
      options.translationLanguageCode = valueAt(index).toLowerCase();
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}. The helper takes flags only; translate the request into flags.`, true);
  }

  if (options.mode && options.mode !== "branch" && options.mode !== "local-changes") {
    fail("--mode must be branch or local-changes.", true);
  }
  if (options.translationLanguageCode && !/^[a-z]{2}$/.test(options.translationLanguageCode)) {
    fail("--translation-language-code must be a two-letter ISO 639-1 code.", true);
  }
  if (options.pr && (options.mode || options.targetBranch)) {
    fail("--pr reviews the pull request's own base and head; do not combine it with --mode or --target-branch.", true);
  }

  return options;
}

function fileList(output) {
  return output.split("\0").filter(Boolean);
}

function changedFiles(...diffArgs) {
  return fileList(
    run("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRDTUXB", ...diffArgs]),
  );
}

function resolveCommit(ref) {
  const commit = run("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    allowFailure: true,
  });
  if (!commit) {
    fail(`${ref} does not exist in this repository.`);
  }
  return commit;
}

function defaultTargetBranch() {
  const ref = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
    allowFailure: true,
  });
  if (!ref) {
    fail(
      "No target branch was given and origin/HEAD is not set. Pass --target-branch, or set it once with `git remote set-head origin --auto`.",
    );
  }
  return ref.replace(/^origin\//, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function repoFromPrUrl(url) {
  const parsed = /^[a-z]+:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+/i.exec(url);
  return parsed ? parsed[1].toLowerCase() : null;
}

function remoteForRepo(repo) {
  return run("git", ["remote"])
    .split("\n")
    .filter(Boolean)
    .find((remote) => {
      const url = run("git", ["remote", "get-url", remote], { allowFailure: true }) || "";
      const parsed = /[/:]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(url);
      return parsed !== null && parsed[1].toLowerCase() === repo;
    });
}

function fetchCommit(remote, source) {
  run("git", ["fetch", "--no-tags", remote, source]);
  return run("git", ["rev-parse", "FETCH_HEAD^{commit}"]);
}

function prReview(options, headCommit, hasUncommittedChanges) {
  const pr = parseJson(run("gh", ["pr", "view", options.pr, "--json", PR_FIELDS]), "gh pr view");
  const repo = repoFromPrUrl(pr.url);
  const remote = repo && remoteForRepo(repo);
  if (!remote) {
    fail(
      `${pr.url} belongs to ${repo}, and no remote of this repository points there. Run the review from a clone of ${repo}.`,
    );
  }

  // A closed PR's base branch may already contain its changes, so pin the base GitHub recorded.
  const targetCommit = fetchCommit(
    remote,
    pr.state === "OPEN" ? `refs/heads/${pr.baseRefName}` : pr.baseRefOid,
  );
  const currentCommit = fetchCommit(remote, `refs/pull/${pr.number}/head`);

  return {
    slug: slugify(`pr-${pr.number}-${pr.headRefName}`),
    review_mode: "pr",
    target_branch: pr.baseRefName,
    defaulted_target_branch: false,
    ignored_target_branch: null,
    target_commit: targetCommit,
    current_commit: currentCommit,
    review_range: `${targetCommit}...${currentCommit}`,
    reads_worktree: currentCommit === headCommit && !hasUncommittedChanges,
    pr: {
      number: pr.number,
      url: pr.url,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      base_branch: pr.baseRefName,
      head_branch: pr.headRefName,
      is_cross_repository: pr.isCrossRepository,
    },
    changed_files: changedFiles(`${targetCommit}...${currentCommit}`),
    untracked_files: [],
  };
}

function branchReview(options, currentBranch, headCommit, hasUncommittedChanges) {
  if (options.fetch) {
    run("git", ["fetch", "--prune", "origin"]);
  }

  const targetBranch = options.targetBranch || defaultTargetBranch();
  if (targetBranch === currentBranch) {
    fail("Target branch equals the current branch; there is no branch comparison to review.");
  }
  const targetCommit = resolveCommit(`origin/${targetBranch}`);

  return {
    slug: slugify(currentBranch),
    review_mode: "branch",
    target_branch: targetBranch,
    defaulted_target_branch: !options.targetBranch,
    ignored_target_branch: null,
    target_commit: targetCommit,
    current_commit: headCommit,
    review_range: `${targetCommit}...${headCommit}`,
    reads_worktree: !hasUncommittedChanges,
    pr: null,
    changed_files: changedFiles(`${targetCommit}...${headCommit}`),
    untracked_files: [],
  };
}

function localReview(options, currentBranch, headCommit) {
  const untrackedFiles = fileList(
    run("git", ["ls-files", "--others", "--exclude-standard", "-z"]),
  );

  return {
    slug: slugify(`local-${currentBranch}`),
    review_mode: "local-changes",
    target_branch: null,
    defaulted_target_branch: false,
    ignored_target_branch: options.targetBranch,
    target_commit: headCommit,
    current_commit: null,
    review_range: "HEAD..working-tree",
    reads_worktree: true,
    pr: null,
    changed_files: [...changedFiles("HEAD", "--"), ...untrackedFiles],
    untracked_files: untrackedFiles,
  };
}

function ensureReviewsExcluded(repoRoot) {
  const gitEntry = path.join(repoRoot, ".git");
  if (!fs.existsSync(gitEntry)) {
    return;
  }

  const excludePath = run("git", ["rev-parse", "--git-path", "info/exclude"]);
  const resolvedExcludePath = path.isAbsolute(excludePath)
    ? excludePath
    : path.join(repoRoot, excludePath);

  fs.mkdirSync(path.dirname(resolvedExcludePath), { recursive: true });

  let existing = "";
  if (fs.existsSync(resolvedExcludePath)) {
    existing = fs.readFileSync(resolvedExcludePath, "utf8");
  }

  const hasStandaloneEntry = existing
    .split(/\r?\n/)
    .some((line) => line.trim() === ".reviews/");

  if (!hasStandaloneEntry) {
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(resolvedExcludePath, `${existing}${prefix}.reviews/\n`);
  }
}

function nextReviewDirectory(repoRoot, slug) {
  const reviewsAbsolute = path.join(repoRoot, ".reviews");
  fs.mkdirSync(reviewsAbsolute, { recursive: true });

  for (;;) {
    const maxExistingPrefix = fs
      .readdirSync(reviewsAbsolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{3}-/.test(entry.name))
      .reduce((max, entry) => {
        const prefix = Number.parseInt(entry.name.slice(0, 3), 10);
        return Number.isNaN(prefix) ? max : Math.max(max, prefix);
      }, 0);

    const nextPrefix = String(maxExistingPrefix + 1).padStart(3, "0");
    const reviewDirName = `${nextPrefix}-${slug || "review"}`;
    const reviewDirAbsolute = path.join(reviewsAbsolute, reviewDirName);

    try {
      fs.mkdirSync(reviewDirAbsolute);
      return {
        reviewDir: path.posix.join(".reviews", reviewDirName),
        reviewDirAbsolute,
        reviewDirName,
      };
    } catch (error) {
      if (error && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
}

function main() {
  const options = readArgs();
  const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);
  ensureReviewsExcluded(repoRoot);

  const currentBranch = run("git", ["branch", "--show-current"]);
  const headCommit = run("git", ["rev-parse", "HEAD"]);
  const hasUncommittedChanges = run("git", ["status", "--porcelain"]).length > 0;
  const defaultedToLocalChanges = !options.pr && !options.mode && hasUncommittedChanges;

  let review;
  if (options.pr) {
    review = prReview(options, headCommit, hasUncommittedChanges);
  } else if (!currentBranch) {
    fail("Repository is in detached HEAD state; branch and local reviews require a named branch.");
  } else if (options.mode === "local-changes" || defaultedToLocalChanges) {
    review = localReview(options, currentBranch, headCommit);
  } else {
    review = branchReview(options, currentBranch, headCommit, hasUncommittedChanges);
  }

  const { slug, ...reviewFields } = review;
  const reviewDirectory = nextReviewDirectory(repoRoot, slug);

  const result = {
    repo_root: repoRoot,
    current_branch: currentBranch || null,
    has_uncommitted_changes: hasUncommittedChanges,
    defaulted_to_local_changes: defaultedToLocalChanges,
    ...reviewFields,
    translation_language_code: options.translationLanguageCode,
    pr_comment_requested: options.prCommentRequested,
    review_dir_name: reviewDirectory.reviewDirName,
    review_dir: reviewDirectory.reviewDir,
    review_dir_absolute: reviewDirectory.reviewDirAbsolute,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
