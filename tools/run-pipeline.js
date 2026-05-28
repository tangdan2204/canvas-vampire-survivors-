#!/usr/bin/env node
/**
 * run-pipeline.js — One-command art generation pipeline orchestrator.
 *
 * Usage:
 *   node tools/run-pipeline.js              # Full pipeline: prompts → generate → post-process
 *   node tools/run-pipeline.js --step prompts    # Only regenerate prompts
 *   node tools/run-pipeline.js --step generate   # Only run generation queue
 *   node tools/run-pipeline.js --step process    # Only run post-processing
 *   node tools/run-pipeline.js --status          # Show current queue status
 */

const { execSync } = require('child_process');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const args = process.argv.slice(2);

function run(cmd, label) {
    console.log(`\n▶ ${label}`);
    console.log(`  $ ${cmd}\n`);
    try {
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    } catch (err) {
        console.error(`\n✖ Step failed: ${label}`);
        process.exit(1);
    }
}

if (args.includes('--status')) {
    run('node tools/generation-queue.js --status', 'Queue Status');
    process.exit(0);
}

const step = args.includes('--step') ? args[args.indexOf('--step') + 1] : 'all';

if (step === 'all' || step === 'prompts') {
    run('node tools/prompt-builder.js', 'Step 1: Generate Prompts');
}

if (step === 'all' || step === 'generate') {
    run('node tools/generation-queue.js --resume', 'Step 2: Generate Images (AIGW)');
}

if (step === 'all' || step === 'process') {
    run('node tools/post-process.js', 'Step 3: Post-Process Images');
}

console.log('\n✅ Pipeline complete!\n');
