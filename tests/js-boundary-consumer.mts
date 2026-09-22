import { decodeNote, echo, type Note } from '../dist/js-boundary.js';
const note: Note = decodeNote('{"id":1,"created_at":1,"text":"ok"}');
const id: number = note.id;
echo(String(id), (error: string, value: string) => console.log(error, value));
// @ts-expect-error generated concrete fields reject a string identifier
const invalid: Note = { id: 'one', created_at: 1, text: 'bad' };
void invalid;

import { createSettings, type AppPorts, type ActivityController, type StreamPort } from '../dist/presenter.js';
import { createActivityLoader, type ActivityLoaderPorts } from '../dist/shell.js';
import type { UserProfile } from '../dist/shared.js';
// The shell, controller and shared DTO declarations must agree without React.
declare const ports: AppPorts;
declare const lazyActivity: ActivityLoaderPorts;
const profile: UserProfile = createSettings(ports).get_snapshot().user;
const activity: ActivityController = createActivityLoader(lazyActivity);
const unread: number = activity.get_snapshot().inbox.unread;
void profile;
void unread;
declare const stream: StreamPort;
// @ts-expect-error native handles cannot stand in for a typed port
const invalidStream: StreamPort = { close() {}, raw: {} };
// @ts-expect-error callback receives a concrete numeric sample array
const invalidSample: string = stream.meter(256).sample();
void invalidStream;
void invalidSample;
