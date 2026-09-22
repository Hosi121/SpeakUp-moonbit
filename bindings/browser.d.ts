/** Browser primitives only. Request ordering, errors and lifetimes belong to MoonBit. */
export function requestText(method: string, path: string, body: string, done: (status: number, text: string, failed: boolean) => void): () => void;
export function randomId(): string;
export function formatTime(value: string): string;
export function numberValue(value: string): number;
export function isVisible(): boolean;
export function onVisibility(listener: (visible: boolean) => void): () => void;
export function onActivity(listener: () => void): () => void;
export function now(): number;
export function dateValue(value: string): number;
export function isoDate(value: string): string;
export function encode(value: string): string;
export function token(): string;
export function storeToken(value: string): void;
export function go(path: string, replace: boolean): void;
export function timeout(delay: number, callback: () => void): () => void;
