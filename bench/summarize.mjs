import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = process.argv[2] ?? 'bench/results.json';
const report = JSON.parse(readFileSync(source, 'utf8'));
const kinds = [...new Set(report.results.map(result => result.kind))];
assert.ok(kinds.length > 0, 'No benchmark trials');
const baseline = process.argv[3];
if (baseline) assert.ok(kinds.includes(baseline), `Unknown baseline: ${baseline}`);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const format = (value, digits) => value.toLocaleString('en-US', {
  maximumFractionDigits: digits, minimumFractionDigits: digits,
});
const samples = kinds.map(kind => report.results.filter(result => result.kind === kind));
const row = (label, key, digits = 3, scale = 1) =>
  '| ' + label + ' | ' + samples.map(values =>
    format(median(values.map(value => value[key])) / scale, digits)).join(' | ') + ' |';
const ranges = samples.map(values =>
  [Math.min(...values.map(v => v.messagesPerSecond)), Math.max(...values.map(v => v.messagesPerSecond))]
    .map(value => format(value, 0)).join('–'));

console.log([
  '# Signaling benchmark',
  '',
  'Source: ' + source,
  'Measured at: ' + report.measuredAt,
  'Environment: ' + [report.cpu, report.os, report.node, report.go, report.moon].join('; '),
  'Trials (' + kinds.join(' / ') + '): ' + samples.map(values => values.length).join(' / '),
  ...(report.profiled ? ['Profiled run: timings are diagnostic, not a throughput comparison.'] : []),
  '',
  report.methodology,
  '',
  '| Median | ' + kinds.join(' | ') + ' |',
  '| --- | ' + kinds.map(() => '---:').join(' | ') + ' |',
  row('forwarded messages/sec', 'messagesPerSecond', 0),
  '| throughput trial range | ' + ranges.join(' | ') + ' |',
  row('p50 relay latency (ms)', 'p50Ms'),
  row('p95 relay latency (ms)', 'p95Ms'),
  row('p99 relay latency (ms)', 'p99Ms'),
  row('server RSS (MiB)', 'serverRssBytes', 2, 1048576),
  row('server CPU time / trial (s)', 'serverCpuSeconds', 2),
  ...(report.results.every(r => Number.isFinite(r.clientCpuSeconds)) ? [row('client CPU time / trial (s)', 'clientCpuSeconds', 2)] : []),
].join('\n'));

if (baseline) {
  const reference = new Map(report.results.filter(r => r.kind === baseline).map(r => [r.round, r.messagesPerSecond]));
  console.log(`\nThroughput ratios paired by round, relative to ${baseline}. Ranges are observed ratios, not confidence intervals.\n`);
  console.log('| Variant | Geometric mean | Round ratio range |\n| --- | ---: | ---: |');
  for (const kind of kinds.filter(kind => kind !== baseline)) {
    const rows = report.results.filter(r => r.kind === kind);
    assert.equal(rows.length, reference.size, `Unpaired trials: ${kind}`);
    assert.equal(new Set(rows.map(r => r.round)).size, reference.size, `Duplicate rounds: ${kind}`);
    const ratios = rows.map(r => r.messagesPerSecond / reference.get(r.round));
    assert.ok(ratios.every(r => Number.isFinite(r) && r > 0), `Invalid ratio: ${kind}`);
    const mean = Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length);
    console.log(`| ${kind} | ${format(mean, 3)} | ${format(Math.min(...ratios), 3)}–${format(Math.max(...ratios), 3)} |`);
  }
}
