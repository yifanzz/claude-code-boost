#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Script to generate changelog entries for new releases
 * Usage: tsx scripts/generate-changelog-entry.ts [version]
 *
 * If no version is provided, it will read from package.json
 */

interface CommitCategory {
  [key: string]: string[];
}

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getVersionFromPackageJson(): string {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function getCommitsSinceLastTag(): string[] {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 HEAD~1', {
      encoding: 'utf8',
    }).trim();
    const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.trim())
      .filter(
        (line) =>
          !line.startsWith('chore:') &&
          !line.startsWith('docs:') &&
          !line.includes('version')
      );

    return commits;
  } catch {
    console.warn(
      'Could not get commits since last tag, getting recent commits instead'
    );
    const commits = execSync('git log --pretty=format:"%s" -5', {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.trim())
      .filter(
        (line) =>
          !line.startsWith('chore:') &&
          !line.startsWith('docs:') &&
          !line.includes('version')
      );

    return commits;
  }
}

function categorizeCommit(commit: string): string {
  const lower = commit.toLowerCase();

  if (lower.startsWith('feat:') || lower.includes('add')) {
    return 'Added';
  } else if (lower.startsWith('fix:') || lower.includes('fix')) {
    return 'Fixed';
  } else if (lower.startsWith('break:') || lower.includes('breaking')) {
    return 'Changed';
  } else if (lower.includes('security') || lower.includes('vulnerable')) {
    return 'Security';
  } else if (lower.includes('deprecat')) {
    return 'Deprecated';
  } else if (lower.includes('remov')) {
    return 'Removed';
  } else {
    return 'Changed';
  }
}

function formatCommitForChangelog(commit: string): string {
  // Remove conventional commit prefixes and clean up
  return commit
    .replace(/^(feat|fix|docs|style|refactor|test|chore):\s*/, '')
    .replace(/^\w+\s*/, '') // Remove any remaining prefixes
    .trim();
}

function generateChangelogEntry(
  version: string,
  date: string,
  commits: string[]
): string {
  const categories: CommitCategory = {};

  commits.forEach((commit) => {
    const category = categorizeCommit(commit);
    const formatted = formatCommitForChangelog(commit);

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(
      `- ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}`
    );
  });

  let entry = `## [${version}] - ${date}\n\n`;

  // Order categories by importance
  const categoryOrder = [
    'Added',
    'Changed',
    'Deprecated',
    'Removed',
    'Fixed',
    'Security',
  ];

  categoryOrder.forEach((category) => {
    if (categories[category] && categories[category].length > 0) {
      entry += `### ${category}\n`;
      categories[category].forEach((item) => {
        entry += `${item}\n`;
      });
      entry += '\n';
    }
  });

  return entry;
}

function updateChangelog(version: string, entry: string): void {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  // Find the [Unreleased] section and add the new entry after it
  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex === -1) {
    throw new Error('Could not find [Unreleased] section in CHANGELOG.md');
  }

  const afterUnreleased = changelog.indexOf('\n\n', unreleasedIndex) + 2;

  const updatedChangelog =
    changelog.slice(0, afterUnreleased) +
    entry +
    changelog.slice(afterUnreleased);

  fs.writeFileSync(changelogPath, updatedChangelog);

  // Also update the comparison links at the bottom
  updateComparisonLinks(changelog, version);
}

function updateComparisonLinks(changelog: string, version: string): void {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  let content = fs.readFileSync(changelogPath, 'utf8');

  try {
    // Get the previous version from git tags
    const tags = execSync('git tag --sort=-version:refname', {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((tag) => tag.trim() && tag.startsWith('v'))
      .map((tag) => tag.trim());

    const currentVersionTag = `v${version}`;
    const previousVersionTag = tags.find((tag) => tag !== currentVersionTag);

    if (previousVersionTag) {
      // Update the [Unreleased] link
      const unreleasedLinkRegex = /\[Unreleased\]: .*/;
      const newUnreleasedLink = `[Unreleased]: https://github.com/yifanzz/claude-code-boost/compare/${currentVersionTag}...HEAD`;

      // Add the new version link
      const newVersionLink = `[${version}]: https://github.com/yifanzz/claude-code-boost/compare/${previousVersionTag}...${currentVersionTag}`;

      content = content.replace(unreleasedLinkRegex, newUnreleasedLink);

      // Add the new version link before the last link
      const lastLinkIndex = content.lastIndexOf('[');
      const insertPoint = content.lastIndexOf('\n', lastLinkIndex);

      content =
        content.slice(0, insertPoint + 1) +
        newVersionLink +
        '\n' +
        content.slice(insertPoint + 1);
    }

    fs.writeFileSync(changelogPath, content);
  } catch (error) {
    console.warn(
      'Could not update comparison links:',
      (error as Error).message
    );
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const version = args[0] || getVersionFromPackageJson();
  const date = getCurrentDate();

  console.log(`Generating changelog entry for version ${version}...`);

  const commits = getCommitsSinceLastTag();

  if (commits.length === 0) {
    console.log('No new commits found since last release.');
    return;
  }

  const entry = generateChangelogEntry(version, date, commits);

  console.log('\nGenerated changelog entry:');
  console.log('---');
  console.log(entry);
  console.log('---');

  updateChangelog(version, entry);

  console.log(`✅ Changelog updated for version ${version}`);
  console.log(
    '💡 Review the generated entry and make any necessary adjustments'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  generateChangelogEntry,
  updateChangelog,
  getCurrentDate,
  getVersionFromPackageJson,
};
