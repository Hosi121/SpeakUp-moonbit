export function connection_count(n: number): number;

export function create_hub(): number;

export function destroy_hub(n: number): void;

export function join(n: number, n2: number, n3: number, n4: number): Array<Delivery>;

export function leave(n: number, n2: number): Array<Delivery>;

export function relay(n: number, n2: number, s: string): Array<Delivery>;

export interface Delivery {
  connection: number;
  payload: string;
  close_code: number;
}