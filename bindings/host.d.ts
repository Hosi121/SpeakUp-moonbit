/** Platform I/O only. Domain rules and response construction live in MoonBit. */
export function dispatch(request: string, done: (error: string, value: string) => void): void;
export function eventTimes(value: string): string;
export function now(): string;
export function publicUrl(value: string): string;
