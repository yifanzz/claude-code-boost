#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline';

/**
 * Release automation script
 * Usage: tsx scripts/release.ts [patch|minor|major|version]
 *
 * This script will:
 * 1. Update the version in package.json
 * 2. Generate a changelog entry
 * 3. Create a git commit and tag
 * 4. Optionally push to remote
 */

type VersionType = 'patch' | 'minor' | 'major' | string;

function getCurrentVersion(): string {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function updateVersion(versionOrType: VersionType): string {
  console.log(`Updating version to ${versionOrType}...`);

  try {
    execSync(`npm version ${versionOrType} --no-git-tag-version`, {
      stdio: 'inherit',
    });
    return getCurrentVersion();
  } catch (error) {
    console.error('Failed to update version:', (error as Error).message);
    process.exit(1);
  }
}

function runTests(): void {
  console.log('Running tests...');
  try {
    execSync('npm test', { stdio: 'inherit' });
  } catch {
    console.error('Tests failed. Aborting release.');
    process.exit(1);
  }
}

function runLinting(): void {
  console.log('Running linting...');
  try {
    execSync('npm run lint', { stdio: 'inherit' });
  } catch {
    console.error('Linting failed. Aborting release.');
    process.exit(1);
  }
}

function buildProject(): void {
  console.log('Building project...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch {
    console.error('Build failed. Aborting release.');
    process.exit(1);
  }
}

function createGitCommitAndTag(version: string): void {
  console.log(`Creating git commit and tag for v${version}...`);

  try {
    execSync('git add CHANGELOG.md package.json package-lock.json', {
      stdio: 'inherit',
    });
    execSync(`git commit -m "chore: release v${version}"`, {
      stdio: 'inherit',
    });
    execSync(`git tag v${version}`, { stdio: 'inherit' });

    console.log(`✅ Created commit and tag v${version}`);
  } catch (error) {
    console.error('Failed to create commit and tag:', (error as Error).message);
    process.exit(1);
  }
}

function askForConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: tsx scripts/release.ts [patch|minor|major|version]');
    console.log('Example: tsx scripts/release.ts patch');
    console.log('Example: tsx scripts/release.ts 1.0.0');
    process.exit(1);
  }

  const versionOrType = args[0] as VersionType;
  const currentVersion = getCurrentVersion();

  console.log(`Current version: ${currentVersion}`);
  console.log(`Requested version update: ${versionOrType}`);

  // Confirm the release
  const shouldContinue = await askForConfirmation('Continue with release?');
  if (!shouldContinue) {
    console.log('Release cancelled.');
    process.exit(0);
  }

  // Check git status
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    if (gitStatus.trim()) {
      console.error(
        'Working directory is not clean. Please commit or stash changes first.'
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to check git status:', (error as Error).message);
    process.exit(1);
  }

  // Run quality checks
  runTests();
  runLinting();
  buildProject();

  // Update version
  const newVersion = updateVersion(versionOrType);
  console.log(`✅ Updated version to ${newVersion}`);

  // Generate changelog entry
  console.log('Generating changelog entry...');
  try {
    execSync(`npm run changelog ${newVersion}`, { stdio: 'inherit' });
    console.log('✅ Changelog updated');
  } catch (error) {
    console.warn(
      'Failed to update changelog automatically:',
      (error as Error).message
    );
    console.log('Please update CHANGELOG.md manually before proceeding.');

    const shouldContinueWithoutChangelog = await askForConfirmation(
      'Continue without automatic changelog update?'
    );
    if (!shouldContinueWithoutChangelog) {
      console.log('Release cancelled.');
      process.exit(0);
    }
  }

  // Create commit and tag
  createGitCommitAndTag(newVersion);

  // Ask about pushing
  const shouldPush = await askForConfirmation('Push commit and tag to remote?');
  if (shouldPush) {
    try {
      execSync('git push', { stdio: 'inherit' });
      execSync('git push --tags', { stdio: 'inherit' });
      console.log('✅ Pushed to remote');
    } catch (error) {
      console.error('Failed to push to remote:', (error as Error).message);
      console.log(
        'You can push manually later with: git push && git push --tags'
      );
    }
  }

  console.log(`🎉 Release v${newVersion} completed!`);

  // Ask about npm publish
  const shouldPublish = await askForConfirmation('Publish to npm?');
  if (shouldPublish) {
    try {
      execSync('npm publish', { stdio: 'inherit' });
      console.log('✅ Published to npm');
    } catch (error) {
      console.error('Failed to publish to npm:', (error as Error).message);
      console.log('You can publish manually later with: npm publish');
    }
  }

  console.log('Release process completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { getCurrentVersion, updateVersion, createGitCommitAndTag };
