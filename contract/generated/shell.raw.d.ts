import type * as presenter from "hosi121/speakup/presenter";

export function create_activity_loader(value: ActivityLoaderPorts): presenter.ActivityController;

export function create_app(value: AppHost): AppController;

export function create_auth(flag: boolean, arg1: AuthPorts): AuthController;

export function route(s: string): RouteView;

export interface ActivityLoaderPorts {
  load: (fn_: (value: presenter.ActivityController) => void, fn_2: (s: string) => void) => void;
  enabled: boolean;
}

export interface AppController {
  start: () => void;
  stop: () => void;
}

export interface AppHost {
  location: () => LocationInput;
  on_location: (fn_: () => void) => () => void;
  navigate: (s: string, flag: boolean) => void;
  load: (s: string, fn_: (value: PageRenderer) => void, fn_2: () => void) => void;
  load_activity: (fn_: (value: presenter.ActivityController) => void, fn_2: (s: string) => void) => void;
  loading: () => void;
  not_found: () => void;
  failed: () => void;
}

export interface AuthController {
  get_snapshot: () => AuthView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  preload: () => void;
  set_username: (s: string) => void;
  set_email: (s: string) => void;
  set_password: (s: string) => void;
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

export interface LocationInput {
  pathname: string;
  conversation: string;
  token: string;
}

export interface PageInput {
  conversation: string;
  peer: string;
  activity: presenter.ActivityController;
  failed: () => void;
}

export interface PageRenderer {
  mount: (value: PageInput) => () => void;
}

export interface RouteView {
  page: string;
  redirect: string;
  peer: string;
}