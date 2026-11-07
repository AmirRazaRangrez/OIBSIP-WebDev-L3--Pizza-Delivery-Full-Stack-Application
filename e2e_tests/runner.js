// e2e_tests/runner.js
import { run } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments
const args = process.argv.slice(2);
let selectedTier = 'all';
let selectedMilestone = null;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    selectedTier = arg.split('=')[1].toLowerCase();
  } else if (arg.startsWith('--milestone=')) {
    selectedMilestone = arg.split('=')[1].toLowerCase();
  }
}

console.log('='.repeat(70));
console.log('  PIZZA DELIVERY E2E OPAQUE-BOX TEST RUNNER');
console.log('='.repeat(70));
console.log(`  Target Tier:       ${selectedTier.toUpperCase()}`);
if (selectedMilestone) {
  console.log(`  Target Milestone:  ${selectedMilestone.toUpperCase()}`);
}
console.log(`  Environment Mode:  ${process.env.TEST_MODE || 'auto'}`);
console.log(`  Base API URL:      ${process.env.BASE_URL || 'http://localhost:5000'}`);
console.log('='.repeat(70));

// Determine test files to execute
const testFiles = [];

const tier1Files = [
  path.join(__dirname, 'tier1_features/f01_f06_m1.test.js'),
  path.join(__dirname, 'tier1_features/f07_f12_m2.test.js'),
  path.join(__dirname, 'tier1_features/f13_f14_m3.test.js'),
  path.join(__dirname, 'tier1_features/f15_f19_m4.test.js'),
  path.join(__dirname, 'tier1_features/f20_f23_m5.test.js'),
  path.join(__dirname, 'tier1_features/f24_m6.test.js')
];

const tier2Files = [
  path.join(__dirname, 'tier2_boundaries/f01_f06_m1_boundaries.test.js'),
  path.join(__dirname, 'tier2_boundaries/f07_f12_m2_boundaries.test.js'),
  path.join(__dirname, 'tier2_boundaries/f13_f14_m3_boundaries.test.js'),
  path.join(__dirname, 'tier2_boundaries/f15_f19_m4_boundaries.test.js'),
  path.join(__dirname, 'tier2_boundaries/f20_f23_m5_boundaries.test.js'),
  path.join(__dirname, 'tier2_boundaries/f24_m6_boundaries.test.js')
];

const tier3Files = [
  path.join(__dirname, 'tier3_pairwise/pairwise_combinations.test.js')
];

const tier4Files = [
  path.join(__dirname, 'tier4_scenarios/realworld_scenarios.test.js')
];

if (selectedMilestone) {
  const m = selectedMilestone;
  if (m === 'm1') {
    testFiles.push(tier1Files[0], tier2Files[0]);
  } else if (m === 'm2') {
    testFiles.push(tier1Files[1], tier2Files[1]);
  } else if (m === 'm3') {
    testFiles.push(tier1Files[2], tier2Files[2]);
  } else if (m === 'm4') {
    testFiles.push(tier1Files[3], tier2Files[3]);
  } else if (m === 'm5') {
    testFiles.push(tier1Files[4], tier2Files[4]);
  } else if (m === 'm6') {
    testFiles.push(tier1Files[5], tier2Files[5], ...tier3Files, ...tier4Files);
  }
} else {
  if (selectedTier === 'all' || selectedTier === '1') testFiles.push(...tier1Files);
  if (selectedTier === 'all' || selectedTier === '2') testFiles.push(...tier2Files);
  if (selectedTier === 'all' || selectedTier === '3') testFiles.push(...tier3Files);
  if (selectedTier === 'all' || selectedTier === '4') testFiles.push(...tier4Files);
}

console.log(`\nDiscovered ${testFiles.length} test suite file(s) for execution:\n`);
for (const f of testFiles) {
  console.log(` - ${path.relative(__dirname, f)}`);
}
console.log('\nExecuting tests...\n');

const startTime = Date.now();
let passCount = 0;
let failCount = 0;
let skipCount = 0;
const failureDetails = [];

const testStream = run({
  files: testFiles,
  concurrency: 1
});

testStream.on('test:pass', (t) => {
  if (t.name.startsWith('T1_') || t.name.startsWith('T2_') || t.name.startsWith('T3_') || t.name.startsWith('T4_')) {
    passCount++;
    console.log(`  ✓ [PASS] ${t.name}`);
  }
});

testStream.on('test:fail', (t) => {
  failCount++;
  console.error(`  ✗ [FAIL] ${t.name}`);
  failureDetails.push({ name: t.name, details: t.details });
});

testStream.on('test:skip', (t) => {
  skipCount++;
  console.log(`  - [SKIP] ${t.name}`);
});

testStream.on('error', (err) => {
  console.error('Test Runner Error:', err);
});

testStream.resume();

testStream.on('end', () => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = passCount + failCount + skipCount;

  console.log('\n' + '='.repeat(70));
  console.log('  TEST EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total Test Cases:  ${total}`);
  console.log(`  Passed:            ${passCount}`);
  console.log(`  Failed:            ${failCount}`);
  console.log(`  Skipped:           ${skipCount}`);
  console.log(`  Duration:          ${duration}s`);
  console.log('='.repeat(70));

  if (failureDetails.length > 0) {
    console.log('\nFailures:');
    for (const fail of failureDetails) {
      console.log(` - ${fail.name}:`, fail.details);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! (100% PASS RATE)\n');
    process.exit(0);
  }
});
