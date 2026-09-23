import { readFileSync } from 'node:fs';

const source = process.argv[2] ?? 'bench/results.json';
const report = JSON.parse(readFileSync(source, 'utf8'));
const kinds = ['go-corrected', 'moonbit-js', 'moonbit-native'];
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
  'Trials (Go / JS / native): ' + samples.map(values => values.length).join(' / '),
  '',
  report.methodology,
  '',
  '| Median | Go reference | MoonBit JS / Node | MoonBit native |',
  '| --- | ---: | ---: | ---: |',
  row('forwarded messages/sec', 'messagesPerSecond', 0),
  '| throughput trial range | ' + ranges.join(' | ') + ' |',
  row('p50 relay latency (ms)', 'p50Ms'),
  row('p95 relay latency (ms)', 'p95Ms'),
  row('p99 relay latency (ms)', 'p99Ms'),
  row('server RSS (MiB)', 'serverRssBytes', 2, 1048576),
  row('server CPU time / trial (s)', 'serverCpuSeconds', 2),
].join('\n'));
