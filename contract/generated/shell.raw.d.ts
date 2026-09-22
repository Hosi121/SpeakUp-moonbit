import type * as presenter from "hosi121/speakup/presenter";

export function create_activity_loader(value: ActivityLoaderPorts): presenter.ActivityController;

export function create_auth(flag: boolean, arg1: AuthPorts): AuthController;

export function route(s: string): RouteView;

export interface ActivityLoaderPorts {
  load: (fn_: (value: presenter.ActivityController) => void, fn_2: (s: string) => void) => void;
  enabled: boolean;
}

export interface AuthController {
  get_snapshot: () => AuthView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  preload: () => void;
  set_field: (s: string, s2: string) => void;
  show_password: (flag: boolean) => void;
  submit: () => void;
}

export interface AuthPorts {
  load: (fn_: (fn_: (flag: boolean, s: string, s2: string, s3: string, fn_: (s: string, s2: string) => void) => () => void) => void, fn_2: (s: string) => void) => void;
  store_token: (s: string) => void;
  navigate: (s: string, flag: boolean) => void;
}

export interface AuthView {
  username: string;
  email: string;
  password: string;
  showPassword: boolean;
  error: string;
  busy: boolean;
}

export interface RouteView {
  page: string;
  redirect: string;
  peer: string;
}