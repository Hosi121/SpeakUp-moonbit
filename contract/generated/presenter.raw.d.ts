import type * as shared from "hosi121/speakup/shared";

export function browser_ports(): AppPorts;

export function create_activity(arg0: AppPorts, arg1: RealtimePorts): ActivityController;

export function create_admin(value: AppPorts): AdminController;

export function create_auth_request(value: AppPorts): AuthRequest;

export function create_calls(value: AppPorts): CallsController;

export function create_event_card(arg0: AppPorts, arg1: shared.EventOverviewDto, flag: boolean, arg3: EventsController): EventCardController;

export function create_events(value: AppPorts): EventsController;

export function create_history(value: AppPorts): HistoryController;

export function create_home(value: AppPorts): HomeController;

export function create_learning(arg0: AppPorts, s: string, flag: boolean): LearningController;

export function create_memo(value: AppPorts): MemoController;

export function create_microphone(arg0: MediaPorts, arg1: RealtimePorts): MicrophoneController;

export function create_reflection(arg0: AppPorts, s: string): ReflectionController;

export function create_session(arg0: AppPorts, arg1: RealtimePorts, arg2: MediaPorts, s: string): SessionController;

export function create_settings(value: AppPorts): SettingsController;

export function create_social(arg0: AppPorts, flag: boolean): SocialController;

export function create_stats(value: AppPorts): StatsController;

export function create_voice(arg0: AppPorts, arg1: RealtimePorts, arg2: MediaPorts, n: number, arg4: VoiceObserver): VoiceController;

export function http_error(n: number, s: string): string;

export function microphone_levels(items: Array<number>): Array<number>;

export function notification_view(value: shared.NotificationDto): NotificationView;

export function sound_is_speaking(items: Array<number>): boolean;

export interface ActivityController {
  get_snapshot: () => ActivityView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  refresh: () => void;
  set_open: (flag: boolean) => void;
  read: () => void;
}

export interface ActivityView {
  revision: number;
  inbox: shared.InboxDto;
  items: Array<NotificationView>;
  connected: boolean;
  clockOffset: number;
  error: string;
  open: boolean;
  busy: boolean;
  read_error: string;
}

export interface AdminController {
  get_snapshot: () => AdminView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_field: (s: string, s2: string) => void;
  set_topic: (n: number, s: string) => void;
  open: () => void;
  close: () => void;
  create: () => void;
  generate: () => void;
  search: () => void;
}

export interface AdminView {
  open: boolean;
  dateTime: string;
  theme: string;
  topics: Array<string>;
  success: string;
  error: string;
  dialogError: string;
  created: Array<shared.Event>;
  section: string;
  query: string;
  users: Array<shared.User>;
  searched: boolean;
  busy: boolean;
}

export interface AppPorts {
  request: (s: string, s2: string, s3: string, fn_: (n: number, s: string, flag: boolean) => void) => () => void;
  now: () => number;
  number: (s: string) => number;
  date: (s: string) => number;
  iso: (s: string) => string;
  encode: (s: string) => string;
  random_id: () => string;
  navigate: (s: string, flag: boolean) => void;
  token: () => string;
  store_token: (s: string) => void;
  timeout: (n: number, fn_: () => void) => () => void;
  on_activity: (fn_: () => void) => () => void;
}

export interface AssistantLine {
  body: string;
  own: boolean;
}

export interface AuthRequest {
  submit: (flag: boolean, s: string, s2: string, s3: string, fn_: (s: string, s2: string) => void) => () => void;
}

export interface CallRow {
  call: shared.ConversationDto;
  partner: string;
  can_join: boolean;
  active: boolean;
  path: string;
}

export interface CallsController {
  get_snapshot: () => CallsView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  refresh: () => void;
  set_query: (s: string) => void;
  search: () => void;
  invite: (n: number) => void;
}

export interface CallsView {
  calls: Array<CallRow>;
  query: string;
  users: Array<shared.User>;
  busy: boolean;
  refreshing: boolean;
  loaded: boolean;
  can_search: boolean;
  error: string;
}

export interface CandidateView {
  person: shared.FriendSummaryDto;
  accepted: boolean;
  known: boolean;
  can_request: boolean;
}

export interface EventCardController {
  get_snapshot: () => EventCardView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  update: (value: shared.EventOverviewDto) => void;
  set_round: (n: number, flag: boolean) => void;
  confirm: (flag: boolean) => void;
  act: (s: string) => void;
}

export interface EventCardView {
  value: shared.EventOverviewDto;
  rounds: Array<boolean>;
  roster: Array<RosterRow>;
  frozen: boolean;
  busy: boolean;
  error: string;
  success: string;
  confirm: boolean;
}

export interface EventsController {
  get_snapshot: () => EventsView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  refresh: () => void;
}

export interface EventsView {
  events: Array<shared.EventOverviewDto>;
  loaded: boolean;
  error: string;
}

export interface HistoryController {
  get_snapshot: () => HistoryView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_tab: (s: string) => void;
}

export interface HistoryView {
  calls: Array<shared.ConversationDto>;
  loaded: boolean;
  error: string;
  tab: string;
}

export interface HomeController {
  get_snapshot: () => HomeView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
}

export interface HomeView {
  events: Array<shared.Event>;
  loading: boolean;
  error: string;
}

export interface IceCandidate {
  candidate: string;
  mid: string;
  has_mid: boolean;
  line: number;
  username: string;
  has_username: boolean;
}

export interface LearningController {
  get_snapshot: () => LearningView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_saved: (flag: boolean) => void;
  answer: (n: number, n2: number) => void;
  save: () => void;
  generate: () => void;
}

export interface LearningView {
  id: number;
  answers: Array<number>;
  feedback: string;
  feedback_current: boolean;
  busy: boolean;
  error: string;
  saved: boolean;
  can_generate: boolean;
}

export interface MediaPorts {
  acquire: (fn_: (value: StreamPort) => void, fn_2: (s: string) => void) => void;
  frame: (fn_: () => void) => () => void;
}

export interface MemoController {
  get_snapshot: () => MemoView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_memo: (s: string) => void;
  set_words: (s: string) => void;
  save: () => void;
}

export interface MemoView {
  carryInMemo: string;
  wordList: string;
  busy: boolean;
  error: string;
  saved: boolean;
}

export interface MeterPort {
  sample: () => Array<number>;
  close: () => void;
}

export interface MicrophoneController {
  get_snapshot: () => MicrophoneView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  finish: () => void;
}

export interface MicrophoneView {
  levels: Array<number>;
  error: string;
  ready: boolean;
  checked: boolean;
}

export interface NotificationView {
  value: shared.NotificationDto;
  description: string;
  destination: string;
}

export interface PeerPort {
  describe: (flag: boolean, fn_: (s: string, s2: string) => void) => void;
  set_local: (s: string, s2: string, fn_: (s: string, s2: string) => void) => void;
  remote: (s: string, s2: string, fn_: (s: string) => void) => void;
  ice: (arg0: IceCandidate, fn_: (s: string) => void) => void;
  close: () => void;
}

export interface RealtimePorts {
  socket: (s: string, fn_: (s: string, s2: string) => void) => SocketPort;
  visible: () => boolean;
  on_focus: (fn_: () => void) => () => void;
  notify: () => void;
}

export interface ReflectionController {
  get_snapshot: () => ReflectionView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_field: (s: string, s2: string) => void;
  save: () => void;
}

export interface ReflectionView {
  id: number;
  conversation: Array<shared.ConversationDto>;
  satisfaction: string;
  comment: string;
  learned: string;
  busy: boolean;
  error: string;
  saved: boolean;
  complete: boolean;
}

export interface RosterRow {
  id: number;
  username: string;
  status: string;
}

export interface SessionController {
  get_snapshot: () => SessionView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_offset: (n: number) => void;
  toggle_mute: () => void;
  set_open: (s: string, flag: boolean) => void;
  set_tab: (s: string) => void;
  set_draft: (s: string) => void;
  send: () => void;
  retry: () => void;
  finish: () => void;
  cancel: () => void;
}

export interface SessionView {
  id: number;
  conversation: Array<shared.ConversationDto>;
  me: shared.UserProfile;
  partner: shared.FriendSummaryDto;
  status: string;
  can_finish: boolean;
  can_cancel: boolean;
  can_retry: boolean;
  muted: boolean;
  speaking: boolean;
  remote_speaking: boolean;
  error: string;
  saving: boolean;
  memo_open: boolean;
  assistant_open: boolean;
  topic_open: boolean;
  memo_tab: string;
  carryInMemo: string;
  wordList: string;
  messages: Array<AssistantLine>;
  draft: string;
  sending: boolean;
}

export interface SettingsController {
  get_snapshot: () => SettingsView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  edit: (s: string) => void;
  set_draft: (s: string) => void;
  save: () => void;
  upload: (value: Upload) => void;
  logout: () => void;
}

export interface SettingsView {
  user: shared.UserProfile;
  loaded: boolean;
  editing: string;
  draft: string;
  busy: boolean;
  error: string;
}

export interface SocialController {
  get_snapshot: () => SocialView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
  set_query: (s: string) => void;
  search: () => void;
  change: (n: number, s: string) => void;
}

export interface SocialView {
  social: shared.SocialDto;
  loaded: boolean;
  candidates: Array<CandidateView>;
  query: string;
  busy: boolean;
  error: string;
}

export interface SocketPort {
  send: (s: string) => boolean;
  close: () => void;
}

export interface StatsController {
  get_snapshot: () => StatsView;
  subscribe: (fn_: () => void) => () => void;
  start: () => void;
  stop: () => void;
}

export interface StatsView {
  items: Array<shared.StatsDto>;
  error: string;
}

export interface StreamPort {
  close: () => void;
  mute: (flag: boolean) => void;
  meter: (n: number) => MeterPort;
  play: (fn_: (s: string) => void) => () => void;
  peer: (items: Array<shared.IceServerDto>, fn_: (value: IceCandidate) => void, fn_2: (value: StreamPort) => void, fn_3: (s: string) => void) => PeerPort;
}

export interface Upload {
  send: (s: string, s2: string, s3: string, fn_: (n: number, s: string, flag: boolean) => void) => () => void;
}

export interface VoiceController {
  start: () => void;
  stop: () => void;
  mute: (flag: boolean) => void;
}

export interface VoiceObserver {
  conversation: (value: shared.ConversationDto) => void;
  connection: (s: string) => void;
  error: (s: string) => void;
  speaking: (flag: boolean, flag2: boolean) => void;
}