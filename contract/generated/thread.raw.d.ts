export function create_browser(s: string): ThreadController;

export function create_controller(n: number, arg1: ThreadPorts): ThreadController;

export interface MessageView {
  id: number;
  body: string;
  time: string;
  own: boolean;
  read: boolean;
}

export interface ThreadController {
  get_snapshot: () => ThreadView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  refresh: () => void;
  set_draft: (s: string) => void;
  send: () => void;
  load_older: () => void;
}

export interface ThreadPorts {
  request: (s: string, s2: string, s3: string, fn_: (n: number, s: string, flag: boolean) => void) => () => void;
  random_id: () => string;
  format_time: (s: string) => string;
  is_visible: () => boolean;
  on_visibility: (fn_: (flag: boolean) => void) => () => void;
  on_activity: (fn_: () => void) => () => void;
}

export interface ThreadView {
  valid: boolean;
  loaded: boolean;
  peer_name: string;
  peer_avatar: string;
  messages: Array<MessageView>;
  draft: string;
  error: string;
  sending: boolean;
  loading_older: boolean;
  has_older: boolean;
  can_send: boolean;
}