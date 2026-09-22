export type Dispose = () => void;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

export function text(node: Node, value: string | number): void {
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}
export function visible(node: HTMLElement | SVGElement, show: boolean): void {
  node.style.display = show ? "" : "none";
}
export function value(
  node: HTMLInputElement | HTMLTextAreaElement,
  next: string,
): void {
  // Do not disturb selection/composition when an unrelated snapshot changes.
  if (node.value !== next) node.value = next;
}
export function message(node: HTMLElement, content: string): void {
  text(node, content);
  visible(node, !!content);
}
export function alert(): HTMLParagraphElement {
  const node = element("p", "alert");
  node.role = "alert";
  visible(node, false);
  return node;
}
export function status(content: string): HTMLParagraphElement {
  const node = element("p", "", content);
  node.role = "status";
  return node;
}
export function link(
  label: string,
  path: string,
  className = "",
): HTMLAnchorElement {
  const node = element("a", className, label);
  node.href = path;
  return node;
}
export function button(
  label: string,
  action: () => void,
  className = "",
): HTMLButtonElement {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function submit(
  label: string,
  className = "primary",
): HTMLButtonElement {
  const node = element("button", className, label);
  node.type = "submit";
  return node;
}
export function form(action: () => void, className = "stack"): HTMLFormElement {
  const node = element("form", className);
  node.addEventListener("submit", (event) => {
    event.preventDefault();
    action();
  });
  return node;
}
function labelField<T extends HTMLInputElement | HTMLTextAreaElement>(
  label: string,
  input: T,
) {
  input.id = `field-${crypto.randomUUID()}`;
  const caption = element("label", "", label);
  caption.htmlFor = input.id;
  return { element: element("div", "field", caption, input), input };
}
export function input(
  label: string,
  changed: (value: string) => void,
  options: Partial<
    Pick<
      HTMLInputElement,
      | "type"
      | "required"
      | "minLength"
      | "maxLength"
      | "min"
      | "max"
      | "step"
      | "accept"
    >
  > & { autocomplete?: string } = {},
) {
  const node = element("input");
  const { autocomplete, ...properties } = options;
  Object.assign(node, properties);
  if (autocomplete !== undefined)
    node.setAttribute("autocomplete", autocomplete);
  node.addEventListener("input", () => changed(node.value));
  return labelField(label, node);
}
export function textarea(
  label: string,
  changed: (value: string) => void,
  rows: number,
  maxLength?: number,
) {
  const node = element("textarea");
  node.rows = rows;
  if (maxLength !== undefined) node.maxLength = maxLength;
  node.addEventListener("input", () => changed(node.value));
  return labelField(label, node);
}
export function choices(
  label: string,
  options: readonly { value: string; label: string }[],
  changed: (value: string) => void,
  decorated = true,
) {
  const node = element("fieldset", decorated ? "choices" : "");
  node.append(element("legend", decorated ? "sr-only" : "", label));
  const name = `choice-${crypto.randomUUID()}`;
  const inputs = options.map((option) => {
    const radio = element("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = option.value;
    radio.addEventListener("change", () => {
      if (radio.checked) changed(option.value);
    });
    node.append(
      element(
        "label",
        decorated ? "" : "radio-option",
        radio,
        element("span", "", option.label),
      ),
    );
    return radio;
  });
  return {
    element: node,
    update(selected: string) {
      for (const radio of inputs) radio.checked = radio.value === selected;
    },
  };
}

export interface Row<T> {
  element: HTMLElement;
  update: (value: T) => void;
  dispose?: Dispose;
}
/** Keyed DOM identity belongs to the renderer, never to application state. */
export function list<T>(
  host: HTMLElement,
  key: (value: T) => string | number,
  create: (value: T) => Row<T>,
) {
  const rows = new Map<string | number, Row<T>>();
  return {
    update(values: readonly T[]) {
      const retained = new Set(values.map(key));
      for (const [id, row] of rows)
        if (!retained.has(id)) {
          row.dispose?.();
          row.element.remove();
          rows.delete(id);
        }
      let cursor = host.firstChild;
      for (const item of values) {
        const id = key(item);
        let row = rows.get(id);
        if (!row) {
          row = create(item);
          rows.set(id, row);
        }
        row.update(item);
        if (row.element !== cursor) host.insertBefore(row.element, cursor);
        else cursor = cursor.nextSibling;
      }
    },
    dispose() {
      for (const row of rows.values()) row.dispose?.();
      rows.clear();
      host.replaceChildren();
    },
  };
}

export interface Snapshot<T> {
  get_snapshot: () => T;
  subscribe: (listener: () => void) => Dispose;
}
export interface Controller<T> extends Snapshot<T> {
  start: () => void;
  stop: Dispose;
}
/** Own only DOM listeners, subscriptions and mounted controller handles. */
export class ViewScope {
  private cleanups: Dispose[] = [];
  private live = true;
  constructor(private failed: () => void) {}
  own(dispose: Dispose): Dispose {
    if (this.live) this.cleanups.push(dispose);
    else dispose();
    return dispose;
  }
  observe<T>(controller: Snapshot<T>, render: (view: T) => void): void {
    const update = () => {
      if (!this.live) return;
      try {
        render(controller.get_snapshot());
      } catch {
        this.dispose();
        this.failed();
      }
    };
    this.own(controller.subscribe(update));
    update();
  }
  bind<T>(controller: Controller<T>, render: (view: T) => void): void {
    this.own(controller.stop);
    this.observe(controller, render);
    if (this.live) {
      try {
        controller.start();
      } catch {
        this.dispose();
        this.failed();
      }
    }
  }
  dispose = (): void => {
    if (!this.live) return;
    this.live = false;
    const cleanups = this.cleanups.splice(0).reverse();
    // A failing platform close must not leave the remaining views subscribed.
    for (const dispose of cleanups) {
      try {
        dispose();
      } catch {
        /* continue cleanup */
      }
    }
  };
}
