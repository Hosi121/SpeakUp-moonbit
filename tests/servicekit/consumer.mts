import { decodeNote, echo, type Note } from '../../dist/servicekit-example.js';
const note: Note = decodeNote('{"id":1,"created_at":1,"text":"ok"}');
const id: number = note.id;
echo(String(id), (error: string, value: string) => console.log(error, value));
// @ts-expect-error generated concrete fields reject a string identifier
const invalid: Note = { id: 'one', created_at: 1, text: 'bad' };
void invalid;
