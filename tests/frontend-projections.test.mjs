import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  projectNotification,
  projectLevels,
  projectSpeaking,
  httpErrorMessage,
} from '../dist/presenter.js';
const fixtures = JSON.parse(
  readFileSync(
    new URL('../contract/frontend/fixtures.json', import.meta.url),
    'utf8',
  ),
);
for (const [index, item] of fixtures.notifications.entries())
  test(`source notification projection ${index}`, () => {
    const view = projectNotification(item.input);
    assert.deepEqual(
      { description: view.description, destination: view.destination },
      item.expected,
    );
  });
for (const [index, item] of fixtures.audio.entries())
  test(`source audio projection ${index}`, () => {
    assert.deepEqual(projectLevels(item.input), item.levels);
    assert.equal(projectSpeaking(item.input), item.speaking);
  });
for (const [index, item] of fixtures.errors.entries())
  test(`source HTTP error projection ${index}`, () => {
    assert.equal(httpErrorMessage(422, item.input), item.expected);
  });
