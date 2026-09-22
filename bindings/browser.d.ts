/** Browser primitives only. Request ordering, errors and lifetimes belong to MoonBit. */
export function requestText(method: string, path: string, body: string, done: (status: number, text: string, failed: boolean) => void): () => void;
export function randomId(): string;
export function formatTime(value: string): string;
export function numberValue(value: string): number;
export function isVisible(): boolean;
export function onVisibility(listener: (visible: boolean) => void): () => void;
export function onActivity(listener: () => void): () => void;
