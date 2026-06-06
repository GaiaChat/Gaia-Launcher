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
export type GaiaCameraResolution = '480p' | '720p' | '1080p';
export type GaiaServerNotificationLevel = 'all' | 'mentions' | 'nothing';

export const GAIA_P2P_VOICE_DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
] as const;

export interface GaiaServerNotificationSetting {
  level: GaiaServerNotificationLevel;
  mutedUntil?: string;
}

export interface GaiaServerNotificationSettingsPatch {
  level?: GaiaServerNotificationLevel;
  mutedUntil?: string | null;
}

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

export interface GaiaVideoSettings {
  cameraDeviceId: string;
  cameraResolution: GaiaCameraResolution;
  cameraFrameRate: number;
  mirrorPreview: boolean;
}

export interface GaiaP2PVoiceTurnServer {
  turnUrl?: string;
  turnsUrl?: string;
  username?: string;
  credential?: string;
}

export type GaiaP2PVoiceSignalingPreference = 'atproto-record' | 'bsky-dm';
export type GaiaP2PVoiceIncomingCallPolicy = 'accepted-conversations' | 'none';

export interface GaiaP2PVoiceSettings {
  turnServers: GaiaP2PVoiceTurnServer[];
  signaling: GaiaP2PVoiceSignalingPreference;
  incomingCalls: GaiaP2PVoiceIncomingCallPolicy;
  incomingCallNotifications: boolean;
  respectConversationMute: boolean;
}

export interface GaiaP2PVoiceIceConfig {
  stunUrls: string[];
  turnServers: GaiaP2PVoiceTurnServer[];
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
  video: GaiaVideoSettings;
  p2pVoice: GaiaP2PVoiceSettings;
}

export type GaiaSettingsPatch = Partial<GaiaSettings>;

export type GaiaP2PVoiceSignalType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'join-call'
  | 'leave-call'
  | 'call-rejected'
  | 'call-ended';

export interface GaiaP2PVoiceSessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface GaiaP2PVoiceIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface GaiaP2PVoiceSignalBase {
  version: 1;
  type: GaiaP2PVoiceSignalType;
  callId: string;
  roomId: string;
  senderId: string;
  createdAt: string;
}

export interface GaiaP2PVoiceOfferSignal extends GaiaP2PVoiceSignalBase {
  type: 'offer';
  description: GaiaP2PVoiceSessionDescription;
}

export interface GaiaP2PVoiceAnswerSignal extends GaiaP2PVoiceSignalBase {
  type: 'answer';
  description: GaiaP2PVoiceSessionDescription;
}

export interface GaiaP2PVoiceIceCandidateSignal extends GaiaP2PVoiceSignalBase {
  type: 'ice-candidate';
  candidate: GaiaP2PVoiceIceCandidate;
}

export interface GaiaP2PVoiceControlSignal extends GaiaP2PVoiceSignalBase {
  type: 'join-call' | 'leave-call' | 'call-rejected' | 'call-ended';
  reason?: string;
}

export type GaiaP2PVoiceSignalMessage =
  | GaiaP2PVoiceOfferSignal
  | GaiaP2PVoiceAnswerSignal
  | GaiaP2PVoiceIceCandidateSignal
  | GaiaP2PVoiceControlSignal;

export function coerceGaiaP2PVoiceSignalMessage(value: unknown): GaiaP2PVoiceSignalMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.type !== 'string' ||
    typeof record.callId !== 'string' ||
    typeof record.roomId !== 'string' ||
    typeof record.senderId !== 'string' ||
    typeof record.createdAt !== 'string'
  ) {
    return null;
  }

  const base = {
    version: 1 as const,
    type: record.type,
    callId: record.callId,
    roomId: record.roomId,
    senderId: record.senderId,
    createdAt: record.createdAt,
  };

  if (record.type === 'offer' || record.type === 'answer') {
    const description = coerceGaiaP2PVoiceSessionDescription(record.description, record.type);
    return description ? { ...base, type: record.type, description } : null;
  }
  if (record.type === 'ice-candidate') {
    const candidate = coerceGaiaP2PVoiceIceCandidate(record.candidate);
    return candidate ? { ...base, type: 'ice-candidate', candidate } : null;
  }
  if (
    record.type === 'join-call' ||
    record.type === 'leave-call' ||
    record.type === 'call-rejected' ||
    record.type === 'call-ended'
  ) {
    return {
      ...base,
      type: record.type,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
    };
  }

  return null;
}

function coerceGaiaP2PVoiceSessionDescription(
  value: unknown,
  expectedType: 'offer' | 'answer',
): GaiaP2PVoiceSessionDescription | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.type === expectedType && typeof record.sdp === 'string'
    ? { type: expectedType, sdp: record.sdp }
    : null;
}

function coerceGaiaP2PVoiceIceCandidate(value: unknown): GaiaP2PVoiceIceCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.candidate !== 'string') {
    return null;
  }
  return {
    candidate: record.candidate,
    sdpMid: typeof record.sdpMid === 'string' || record.sdpMid === null ? record.sdpMid : undefined,
    sdpMLineIndex:
      typeof record.sdpMLineIndex === 'number' || record.sdpMLineIndex === null
        ? record.sdpMLineIndex
        : undefined,
    usernameFragment:
      typeof record.usernameFragment === 'string' || record.usernameFragment === null
        ? record.usernameFragment
        : undefined,
  };
}

export interface GaiaStore {
  version: 1;
  selectedServerId?: string;
  identity: GaiaIdentity | null;
  servers: GaiaServer[];
  serverNotificationSettings: Record<string, GaiaServerNotificationSetting>;
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
  | 'macos'
  | 'windows'
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
  messagePreview?: string;
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

export interface GaiaSpotifyActivity {
  provider: 'spotify';
  title: string;
  artists: string[];
  album?: string;
  albumArtUrl?: string;
  trackUrl?: string;
  isPlaying: boolean;
  progressMs?: number;
  durationMs?: number;
  startedAt?: string;
  updatedAt: string;
  expiresAt: string;
}

export interface GaiaSpotifyStatus {
  configured: boolean;
  connected: boolean;
  sharingEnabled: boolean;
  redirectUri: string;
  scope: string;
  expiresAt?: string;
  displayName?: string;
  activity?: GaiaSpotifyActivity;
  message?: string;
}

export interface GaiaSpotifyAuthStartResponse {
  openedExternal: boolean;
  authorizationUrl?: string;
  redirectUri: string;
}

export interface GaiaSpotifySharingPatch {
  sharingEnabled?: boolean;
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

export interface GaiaBskyCallKey {
  did: string;
  deviceId: string;
  keyId: string;
  createdAt: string;
  updatedAt: string;
  encryptedLocally: boolean;
}

export interface GaiaBskyCallSignalSource {
  repoDid: string;
  uri: string;
  cid?: string;
  rkey: string;
  createdAt: string;
  expiresAt: string;
}

export interface GaiaBskyCallSignal {
  convoId: string;
  senderDid: string;
  signal: GaiaP2PVoiceSignalMessage;
  source: GaiaBskyCallSignalSource;
}

export interface GaiaBskyCallSignalPage {
  cursor?: string;
  signals: GaiaBskyCallSignal[];
}

export interface GaiaBskyPublishCallSignalRequest {
  peerDid: string;
  convoId: string;
  signal: GaiaP2PVoiceSignalMessage;
}

export interface GaiaBskyPublishCallSignalResponse {
  uri: string;
  cid?: string;
  rkey: string;
  createdAt: string;
  expiresAt: string;
}

export interface GaiaBskyListCallSignalsRequest {
  peerDid: string;
  convoId: string;
  cursor?: string;
  limit?: number;
  ignoreBefore?: string;
}

export interface GaiaBskyDeleteCallSignalsRequest {
  rkeys: string[];
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
