export function echo(value, done) {
  queueMicrotask(() => { done(value === 'fail' ? 'example_failure' : '', value); done('', 'ignored duplicate'); });
}
