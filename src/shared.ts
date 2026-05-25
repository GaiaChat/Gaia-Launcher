export interface GaiaServer {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GaiaIdentity {
  handle: string;
  updatedAt?: string;
}

export type GaiaStartupView = 'last' | 'server' | 'messages';
export type GaiaLastContentView = 'server' | 'messages';
export type GaiaDensity = 'comfortable' | 'compact';
export type GaiaGifPlayback = 'always' | 'focused' | 'never';
export type GaiaAppearanceMode = 'auto' | 'light' | 'dark';
export type GaiaResolvedAppearanceMode = 'light' | 'dark';
export type GaiaPushToTalkMode = 'voice_activity' | 'hold' | 'toggle';

export interface GaiaAppearanceModePayload {
  mode: GaiaAppearanceMode;
  resolvedMode: GaiaResolvedAppearanceMode;
}

export interface GaiaSoundSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  outputVolume: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  pushToTalkMode: GaiaPushToTalkMode;
  pushToTalkKey: string;
}

export interface GaiaVisualEffectsSettings {
  animatedCurrentBackgrounds: boolean;
  fastGraphicsMode: boolean;
}

export interface GaiaSettings {
  startupView: GaiaStartupView;
  lastContentView: GaiaLastContentView;
  appearanceMode: GaiaAppearanceMode;
  accentColor: string;
  density: GaiaDensity;
  reducedMotion: boolean;
  gifPlayback: GaiaGifPlayback;
  animatedCurrentBackgrounds: boolean;
  fastGraphicsMode: boolean;
  perfProbe: boolean;
  sound: GaiaSoundSettings;
}

export type GaiaSettingsPatch = Partial<GaiaSettings>;

export interface GaiaStore {
  version: 1;
  selectedServerId?: string;
  identity: GaiaIdentity | null;
  servers: GaiaServer[];
  settings: GaiaSettings;
}

export type GaiaUpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'not_available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export type GaiaUpdateInstallMode =
  | 'appimage'
  | 'package-manager'
  | 'store'
  | 'manual'
  | 'development';

export interface GaiaUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface GaiaUpdateState {
  status: GaiaUpdateStatus;
  supported: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  canOpenDownloads: boolean;
  currentVersion: string;
  platform: string;
  arch: string;
  installMode: GaiaUpdateInstallMode;
  message: string;
  releasePageUrl: string;
  feedUrl?: string;
  checkedAt?: string;
  availableVersion?: string;
  downloadedFile?: string;
  error?: string;
  progress?: GaiaUpdateProgress;
}

export type GaiaNotificationKind = 'current_message' | 'current_reply' | 'current_mention';

export interface GaiaNotification {
  id: string;
  kind: GaiaNotificationKind;
  serverId: string;
  serverName: string;
  serverUrl: string;
  channelId: string;
  channelName?: string;
  messageId: string;
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface GaiaNotificationCenterState {
  notifications: GaiaNotification[];
  unreadCount: number;
}

export interface GaiaServerInput {
  name?: string;
  url: string;
}

export interface GaiaOAuthStartRequest {
  serverUrl: string;
  handle?: string;
}

export interface GaiaLanHandoff {
  handoffId: string;
  hostAuthUrl: string;
  expiresAt: string;
  message: string;
}

export interface GaiaOAuthStartResponse {
  authId: string;
  returnToUrl: string;
  openedExternal: boolean;
  authorizationUrl?: string;
  lanHandoff?: GaiaLanHandoff;
}

export interface GaiaAuthResult {
  authId: string;
  serverUrl: string;
  ok: boolean;
  message: string;
}

export interface GaiaServerProbe {
  reachable: boolean;
  authenticated?: boolean;
  status?: number;
  message?: string;
}

export interface GaiaCurrentAppearance {
  backgroundUrl?: string;
  backgroundMimeType?: string;
  serverName?: string;
  serverIconUrl?: string;
}

export interface GaiaLogoutResult {
  ok: boolean;
  message: string;
}

export interface GaiaClientAuthStartRequest {
  handle?: string;
}

export interface GaiaClientAuthStartResponse {
  openedExternal: boolean;
  authorizationUrl: string;
  callbackUrl: string;
}

export interface GaiaBskyProfile {
  did: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export interface GaiaClientAuthStatus {
  authenticated: boolean;
  profile?: GaiaBskyProfile;
  scope?: string;
  expiresAt?: string;
  message?: string;
}

export interface GaiaClientAuthResult {
  ok: boolean;
  message: string;
  profile?: GaiaBskyProfile;
}

export interface GaiaServerClientAuthResult {
  ok: boolean;
  message: string;
  oauth?: GaiaOAuthStartResponse;
}

export interface GaiaBskyActor {
  did: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export interface GaiaBskyReaction {
  value: string;
  count: number;
  senderDids: string[];
  createdAt?: string;
}

export interface GaiaBskyMessage {
  id: string;
  revision?: string;
  text: string;
  sentAt: string;
  senderDid: string;
  reactions?: GaiaBskyReaction[];
}

export interface GaiaBskyDeletedMessage {
  id: string;
  revision?: string;
  sentAt: string;
  senderDid: string;
}

export interface GaiaBskyConvo {
  id: string;
  revision?: string;
  status?: string;
  muted?: boolean;
  unreadCount?: number;
  members: GaiaBskyActor[];
  lastMessage?: GaiaBskyMessage;
}

export interface GaiaBskyConvoPage {
  cursor?: string;
  convos: GaiaBskyConvo[];
}

export interface GaiaBskyMessagePage {
  cursor?: string;
  messages: GaiaBskyMessage[];
}

export interface GaiaBskyPageRequest {
  cursor?: string;
  limit?: number;
}

export interface GaiaBskyMessagesRequest extends GaiaBskyPageRequest {
  convoId: string;
}

export interface GaiaBskyReactionRequest {
  convoId: string;
  messageId: string;
  value: string;
  remove?: boolean;
}

export interface GaiaBskyActorSearchRequest {
  query: string;
  limit?: number;
}

export interface GaiaBskyConvoForMemberRequest {
  did: string;
}

export interface GaiaBskySendMessageRequest {
  convoId: string;
  text: string;
}

export interface GaiaBskyMessageDeleteRequest {
  convoId: string;
  messageId: string;
}

export interface GaiaBskyReadRequest {
  convoId: string;
  messageId?: string;
}

export interface GaiaGifSearchRequest {
  serverUrl?: string;
  query: string;
  limit?: number;
}

export interface GaiaGifResult {
  id?: string;
  contentDescription?: string;
  mediaFormats: {
    gif?: {
      url?: string;
    };
    tinygif?: {
      url?: string;
    };
    mp4?: {
      url?: string;
    };
  };
}

export interface GaiaGifSearchResponse {
  results: GaiaGifResult[];
  providerError?: {
    message?: string;
  };
}
