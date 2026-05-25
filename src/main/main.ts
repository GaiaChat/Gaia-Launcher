import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Notification,
  nativeImage,
  nativeTheme,
  shell,
  session,
  type Event as ElectronEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type WebContentsConsoleMessageEventParams,
} from 'electron';
import type {
  NodeOAuthClient as NodeOAuthClientType,
  NodeSavedSession,
  NodeSavedState,
  OAuthSession,
  TokenSet,
} from '@atproto/oauth-client-node';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { isIP, type AddressInfo } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  GaiaBskyActor,
  GaiaBskyActorSearchRequest,
  GaiaBskyConvo,
  GaiaBskyConvoForMemberRequest,
  GaiaBskyConvoPage,
  GaiaBskyDeletedMessage,
  GaiaBskyMessage,
  GaiaBskyMessageDeleteRequest,
  GaiaBskyMessagePage,
  GaiaBskyMessagesRequest,
  GaiaBskyPageRequest,
  GaiaBskyReadRequest,
  GaiaBskyReaction,
  GaiaBskyReactionRequest,
  GaiaBskySendMessageRequest,
  GaiaAppearanceModePayload,
  GaiaBskyProfile,
  GaiaClientAuthResult,
  GaiaClientAuthStartRequest,
  GaiaClientAuthStartResponse,
  GaiaClientAuthStatus,
  GaiaCurrentAppearance,
  GaiaIdentity,
  GaiaNotification,
  GaiaNotificationCenterState,
  GaiaNotificationKind,
  GaiaOAuthStartRequest,
  GaiaOAuthStartResponse,
  GaiaServerClientAuthResult,
  GaiaServer,
  GaiaServerInput,
  GaiaServerProbe,
  GaiaSettings,
  GaiaSettingsPatch,
  GaiaSoundSettings,
  GaiaStore,
  GaiaGifResult,
  GaiaGifSearchRequest,
  GaiaGifSearchResponse,
  GaiaUpdateState,
  GaiaVideoSettings,
  GaiaVisualEffectsSettings,
} from '../shared.js';
import {
  checkGaiaUpdates,
  configureGaiaUpdater,
  downloadGaiaUpdate,
  getGaiaUpdateState,
  installGaiaUpdate,
  openGaiaUpdateDownloads,
  setUpdaterWebContents,
} from './updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromMain = createRequire(import.meta.url);
const { NodeOAuthClient, buildAtprotoLoopbackClientMetadata, requestLocalLock } =
  requireFromMain('@atproto/oauth-client-node') as typeof import('@atproto/oauth-client-node');
const GAIA_APP_ID = 'com.gaia.launcher';
const GAIA_LINUX_DESKTOP_FILE = 'GaiaLauncher.desktop';
const GAIA_LINUX_WM_CLASS = 'GaiaLauncher';
const GAIA_USAGE_PING_URL = process.env.GAIA_USAGE_PING_URL || 'https://gaiachat.github.io/api/usage/ping';
const GAIA_USAGE_HEARTBEAT_MS = 60_000;
const GAIA_USAGE_CLIENT_ID_FILE = 'usage-client-id';
const GAIA_APP_ICON_RELATIVE_PATH = 'assets/appicon/linux/256x256.png';
const CURRENT_PARTITION = 'persist:gaia-current';
const STORE_VERSION = 1;
const DEFAULT_AUTH_HANDLE = 'https://bsky.social';
const AUTH_CALLBACK_PATH = '/current/oauth/callback';
const BSKY_CALLBACK_PATH = '/bluesky/oauth/callback';
const AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const BSKY_AUTH_SCOPE = 'atproto transition:generic transition:chat.bsky';
const BSKY_CHAT_PROXY = 'did:web:api.bsky.chat#bsky_chat';
const BSKY_STATE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_CALLBACK_PORT = Number(process.env.GAIA_CALLBACK_PORT ?? 17321);
const CURRENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_ACCENT_COLOR = '#30b4ff';
const MAX_NOTIFICATION_HISTORY = 100;
const CURRENT_NOTIFICATION_RECONNECT_MS = 5_000;
const CURRENT_NOTIFICATION_CATCH_UP_LIMIT = 200;
const CURRENT_NOTIFICATION_DESKTOP_MAX_AGE_MS = 2 * 60 * 1000;
const MAX_CURRENT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_IMAGE_BYTES = 2 * 1024 * 1024;
const CURRENT_GATEWAY_PROTOCOL = 'current-session';
const CURRENT_GATEWAY_TOKEN_PROTOCOL_PREFIX = 'current-session-token.';
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

app.setName('Gaia Launcher');
if (process.platform === 'win32') {
  app.setAppUserModelId(GAIA_APP_ID);
}
if (process.platform === 'linux') {
  const linuxApp = app as typeof app & { setDesktopName?: (desktopName: string) => void };
  linuxApp.setDesktopName?.(GAIA_LINUX_DESKTOP_FILE);
  app.commandLine.appendSwitch('class', GAIA_LINUX_WM_CLASS);
}

let gaiaLogoDataUrlCache: string | undefined | null;
let storeMutationQueue: Promise<void> = Promise.resolve();
let notificationMutationQueue: Promise<void> = Promise.resolve();

interface ColorPickPoint {
  x?: number;
  y?: number;
}

function appendUniqueSwitchValues(name: string, values: string[]): void {
  const existingValues = app.commandLine
    .getSwitchValue(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.commandLine.appendSwitch(name, Array.from(new Set([...existingValues, ...values])).join(','));
}

function attachConsoleForwarding(scope: string, contents: WebContents): void {
  contents.on('console-message', (details: ElectronEvent<WebContentsConsoleMessageEventParams>) => {
    const params = details as ElectronEvent<WebContentsConsoleMessageEventParams> & WebContentsConsoleMessageEventParams;
    const level = params.level ?? 'info';
    const message = params.message ?? '';
    const lineNumber = params.lineNumber ?? 0;
    const sourceId = params.sourceId ?? contents.getURL();
    const location = sourceId ? `${sourceId}${lineNumber ? `:${lineNumber}` : ''}` : contents.getURL();
    const line = `[gaia:${scope}:console:${level}] ${message} (${location})`;

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warning') {
      console.warn(line);
    } else {
      console.log(line);
    }
  });
}

function isWaylandEnvironment(): boolean {
  return Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland';
}

function resolveLinuxOzonePlatform(): string | undefined {
  const explicit = process.env.GAIA_OZONE_PLATFORM?.trim() || process.env.ELECTRON_OZONE_PLATFORM?.trim();
  if (explicit && explicit !== 'auto') {
    return explicit;
  }
  return isWaylandEnvironment() ? 'wayland' : undefined;
}

async function resolveFallbackDisplayCaptureSource(): Promise<Electron.Video | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  const source = sources.find((candidate) => candidate.id.startsWith('screen:')) ?? sources[0];
  return source ? { id: source.id, name: source.name } : null;
}

function configureDisplayCapture(targetSession: Electron.Session, scope: string): void {
  targetSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const source = await resolveFallbackDisplayCaptureSource();
        if (!source) {
          console.warn(`[gaia:${scope}:display-capture] no display capture sources were available`);
          callback({});
          return;
        }
        callback({ video: source });
      } catch (error) {
        console.error(`[gaia:${scope}:display-capture] failed to resolve display capture sources`, error);
        callback({});
      }
    },
    { useSystemPicker: true },
  );
}

function sanitizeColorPickPoint(point: ColorPickPoint): Electron.Rectangle {
  return {
    x: Math.max(0, Math.floor(Number(point.x) || 0)),
    y: Math.max(0, Math.floor(Number(point.y) || 0)),
    width: 1,
    height: 1,
  };
}

async function captureColorAtPoint(contents: Electron.WebContents, point: ColorPickPoint): Promise<string | null> {
  const image = await contents.capturePage(sanitizeColorPickPoint(point));
  return image.isEmpty() ? null : image.toDataURL();
}

function currentWebviewRuntimeScript(): string {
  const runtime = {
    platform: process.platform,
    isWayland: isWaylandEnvironment(),
    disableNativeEyeDropper: isWaylandEnvironment(),
    host: 'gaia-launcher',
  };

  return `
    (() => {
      const runtime = ${JSON.stringify(runtime)};
      const existing = window.currentDesktop || {};
      const merged = {
        ...existing,
        ...runtime,
      };
      if (typeof existing.pickColorAtPoint === 'function') {
        merged.pickColorAtPoint = (point) => existing.pickColorAtPoint(point);
      }
      if (typeof existing.getAppearanceMode === 'function') {
        merged.getAppearanceMode = () => existing.getAppearanceMode();
      }
      if (typeof existing.onAppearanceModeChange === 'function') {
        merged.onAppearanceModeChange = (callback) => existing.onAppearanceModeChange(callback);
      }
      if (typeof existing.getSoundSettings === 'function') {
        merged.getSoundSettings = () => existing.getSoundSettings();
      }
      if (typeof existing.onSoundSettingsChange === 'function') {
        merged.onSoundSettingsChange = (callback) => existing.onSoundSettingsChange(callback);
      }
      if (typeof existing.getVideoSettings === 'function') {
        merged.getVideoSettings = () => existing.getVideoSettings();
      }
      if (typeof existing.onVideoSettingsChange === 'function') {
        merged.onVideoSettingsChange = (callback) => existing.onVideoSettingsChange(callback);
      }
      if (typeof existing.getVisualEffectsSettings === 'function') {
        merged.getVisualEffectsSettings = () => existing.getVisualEffectsSettings();
      }
      if (typeof existing.onVisualEffectsSettingsChange === 'function') {
        merged.onVisualEffectsSettingsChange = (callback) => existing.onVisualEffectsSettingsChange(callback);
      }
      try {
        Object.defineProperty(window, 'currentDesktop', {
          configurable: true,
          value: merged,
        });
      } catch {
        window.currentDesktop = merged;
      }

      if (runtime.disableNativeEyeDropper) {
        try {
          Object.defineProperty(window, 'EyeDropper', {
            configurable: true,
            value: undefined,
          });
        } catch {
          try {
            delete window.EyeDropper;
          } catch {}
        }
      }
    })();
  `;
}

function installCurrentWebviewRuntimeHints(contents: Electron.WebContents): void {
  void contents.executeJavaScript(currentWebviewRuntimeScript(), true).catch(() => undefined);
}

function resolveAppearanceMode(settings: GaiaSettings): GaiaAppearanceModePayload {
  const mode = settings.appearanceMode;
  return {
    mode,
    resolvedMode: mode === 'auto' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : mode,
  };
}

function sendCurrentAppearanceMode(contents: Electron.WebContents, payload: GaiaAppearanceModePayload): void {
  if (contents.isDestroyed()) {
    currentWebviewContents.delete(contents);
    return;
  }
  contents.send('gaia:appearance-mode-changed', payload);
}

function broadcastCurrentAppearanceMode(settings: GaiaSettings): void {
  const payload = resolveAppearanceMode(settings);
  for (const contents of currentWebviewContents) {
    sendCurrentAppearanceMode(contents, payload);
  }
}

function sendCurrentSoundSettings(contents: Electron.WebContents, payload: GaiaSoundSettings): void {
  if (contents.isDestroyed()) {
    currentWebviewContents.delete(contents);
    return;
  }
  contents.send('gaia:sound-settings-changed', payload);
}

function broadcastCurrentSoundSettings(settings: GaiaSettings): void {
  for (const contents of currentWebviewContents) {
    sendCurrentSoundSettings(contents, settings.sound);
  }
}

function sendCurrentVideoSettings(contents: Electron.WebContents, payload: GaiaVideoSettings): void {
  if (contents.isDestroyed()) {
    currentWebviewContents.delete(contents);
    return;
  }
  contents.send('gaia:video-settings-changed', payload);
}

function broadcastCurrentVideoSettings(settings: GaiaSettings): void {
  for (const contents of currentWebviewContents) {
    sendCurrentVideoSettings(contents, settings.video);
  }
}

function visualEffectsSettings(settings: GaiaSettings): GaiaVisualEffectsSettings {
  return {
    animatedCurrentBackgrounds: settings.animatedCurrentBackgrounds,
    fastGraphicsMode: settings.fastGraphicsMode,
  };
}

function sendCurrentVisualEffectsSettings(contents: Electron.WebContents, payload: GaiaVisualEffectsSettings): void {
  if (contents.isDestroyed()) {
    currentWebviewContents.delete(contents);
    return;
  }
  contents.send('gaia:visual-effects-settings-changed', payload);
}

function broadcastCurrentVisualEffectsSettings(settings: GaiaSettings): void {
  const payload = visualEffectsSettings(settings);
  for (const contents of currentWebviewContents) {
    sendCurrentVisualEffectsSettings(contents, payload);
  }
}

async function broadcastAutoCurrentAppearanceMode(): Promise<void> {
  const store = await readStore();
  if (store.settings.appearanceMode === 'auto') {
    broadcastCurrentAppearanceMode(store.settings);
  }
}

function configureHighRefreshRendering(): void {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-oop-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  appendUniqueSwitchValues('enable-features', ['CanvasOopRasterization']);

  if (process.env.GAIA_RENDER_BENCH_FLAGS === '1') {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');
  }

  if (process.platform === 'linux') {
    const ozonePlatform = resolveLinuxOzonePlatform();

    if (ozonePlatform) {
      process.env.ELECTRON_OZONE_PLATFORM_HINT = ozonePlatform;
      if (ozonePlatform === 'wayland') {
        process.env.XDG_SESSION_TYPE = process.env.XDG_SESSION_TYPE || 'wayland';
        process.env.GDK_BACKEND = process.env.GDK_BACKEND || 'wayland,x11';
      }
      app.commandLine.appendSwitch('ozone-platform', ozonePlatform);
    } else {
      app.commandLine.appendSwitch('use-gl', 'desktop');
    }

    app.commandLine.appendSwitch('ozone-platform-hint', ozonePlatform ?? 'auto');
    appendUniqueSwitchValues('enable-features', [
      'UseOzonePlatform',
      'WebRTCPipeWireCapturer',
      'WaylandWindowDecorations',
      'WaylandPerSurfaceScale',
      'WaylandFractionalScaleV1',
    ]);

    if (ozonePlatform === 'wayland') {
      app.commandLine.appendSwitch('enable-wayland-ime');
      app.commandLine.appendSwitch('disable-vulkan');
      appendUniqueSwitchValues('disable-features', ['Vulkan']);
    }
  }
}

configureHighRefreshRendering();

const renderSwitchNames = [
  'disable-frame-rate-limit',
  'disable-gpu-vsync',
  'disable-background-timer-throttling',
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'enable-gpu-rasterization',
  'enable-oop-rasterization',
  'enable-zero-copy',
  'ignore-gpu-blocklist',
  'enable-features',
  'disable-features',
  'enable-wayland-ime',
  'disable-vulkan',
  'ozone-platform',
  'ozone-platform-hint',
  'use-gl',
];

function getRenderSwitchSnapshot(): Record<string, string | boolean> {
  return Object.fromEntries(
    renderSwitchNames.map((name) => {
      const value = app.commandLine.getSwitchValue(name);
      return [name, value || app.commandLine.hasSwitch(name)];
    }),
  );
}

async function logPerformanceDiagnostics(): Promise<void> {
  if (process.env.GAIA_PERF_DIAG !== '1') {
    return;
  }

  const gpuInfo = await app.getGPUInfo('basic').catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  console.info('[Gaia perf diag]', {
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE ?? null,
    waylandDisplay: Boolean(process.env.WAYLAND_DISPLAY),
    electronOzonePlatformHint: process.env.ELECTRON_OZONE_PLATFORM_HINT ?? null,
    gaiaOzonePlatform: process.env.GAIA_OZONE_PLATFORM ?? null,
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform') || null,
    switches: getRenderSwitchSnapshot(),
    gpuFeatureStatus: app.getGPUFeatureStatus(),
    gpuInfo,
  });
}

let mainWindow: BrowserWindow | null = null;
let callbackServer: Server | null = null;
let callbackPort: number | null = null;
let bskyOAuthClient: NodeOAuthClientType | null = null;
let bskyOAuthClientCallbackUrl: string | null = null;
let usageHeartbeatTimer: NodeJS.Timeout | null = null;
let usageClientIdPromise: Promise<string> | null = null;
const currentWebviewContents = new Set<WebContents>();
const avatarCacheInFlight = new Map<string, Promise<string>>();
const avatarCacheExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const currentBackgroundCache = new Map<string, string>();
const currentNotificationWatchers = new Map<string, CurrentNotificationWatcher>();

interface PendingAuth {
  id: string;
  serverUrl: string;
  origin: string;
  createdAt: number;
}

const pendingAuth = new Map<string, PendingAuth>();

interface BskyAuthStore {
  activeDid?: string;
  states: Record<string, { value: NodeSavedState; createdAt: number }>;
  sessions: Record<string, NodeSavedSession>;
}

interface CurrentSessionRecord {
  origin: string;
  sessionToken: string;
  expiresAt: string;
  updatedAt: string;
}

interface CurrentSessionStore {
  version: 1;
  sessions: Record<string, CurrentSessionRecord>;
}

interface GaiaNotificationStore {
  version: 1;
  notifications: GaiaNotification[];
  currentLastSeqByServerId: Record<string, number>;
}

interface CurrentUserPayload {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

interface CurrentServerPayload {
  id: string;
  name: string;
}

interface CurrentSessionPayload {
  user?: CurrentUserPayload;
  server?: CurrentServerPayload;
  access?: {
    state?: string;
  };
}

interface CurrentChannelPayload {
  id: string;
  name: string;
  type?: string;
}

type CurrentChannelNotificationLevel = 'default' | 'all' | 'mentions' | 'nothing';

interface CurrentChannelNotificationSettingPayload {
  userId: string;
  channelId: string;
  notificationLevel: CurrentChannelNotificationLevel;
  mutedUntil?: string;
  lastReadAt?: string;
  updatedAt?: string;
}

interface CurrentChannelNotificationSettingsResponse {
  items?: CurrentChannelNotificationSettingPayload[];
}

interface CurrentPageResponse<T> {
  items?: T[];
}

interface CurrentMessageAuthorPayload {
  id?: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

interface CurrentMessagePayload {
  id: string;
  channelId: string;
  authorId: string;
  author?: CurrentMessageAuthorPayload;
  content?: string;
  parentMessageId?: string;
  createdAt?: string;
}

interface CurrentMessageNotificationPayload {
  mentionHandles?: string[];
  replyToUserId?: string;
}

interface CurrentMessageCreatePayload {
  message?: CurrentMessagePayload;
  notification?: CurrentMessageNotificationPayload;
}

interface CurrentNotificationUpdatePayload {
  action?: 'channel_read' | 'channel_notification_settings';
  userId?: string;
  channelId?: string;
  readAt?: string;
  settings?: CurrentChannelNotificationSettingPayload;
}

interface CurrentGatewayEnvelope {
  id?: string;
  type?: string;
  payload?: unknown;
  seq?: number;
  sentAt?: string;
}

interface CurrentNotificationFeedItem {
  id?: string;
  seq?: number;
  kind?: GaiaNotificationKind;
  message?: CurrentMessagePayload;
  notification?: CurrentMessageNotificationPayload;
  createdAt?: string;
}

interface CurrentNotificationFeedPage {
  items?: CurrentNotificationFeedItem[];
  pageInfo?: {
    hasMore?: boolean;
    nextAfterSeq?: number;
    latestSeq?: number;
  };
}

type WebSocketLikeEventMap = {
  open: unknown;
  message: { data?: unknown };
  close: { code?: number; reason?: string };
  error: unknown;
};

interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<TKey extends keyof WebSocketLikeEventMap>(
    event: TKey,
    listener: (event: WebSocketLikeEventMap[TKey]) => void,
  ): void;
}

type WebSocketLikeConstructor = new (url: string, protocols?: string | string[]) => WebSocketLike;

interface CurrentNotificationWatcher {
  serverId: string;
  serverName: string;
  serverUrl: string;
  origin: string;
  sessionToken: string;
  lastSeq: number;
  currentUser?: CurrentUserPayload;
  currentServer?: CurrentServerPayload;
  channels: Map<string, string>;
  channelNotificationSettings: Map<string, CurrentChannelNotificationSettingPayload>;
  socket?: WebSocketLike;
  reconnectTimer?: NodeJS.Timeout;
  stopped: boolean;
  connecting: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function avatarCacheDirectory(): string {
  return join(app.getPath('userData'), 'bsky-avatar-cache');
}

function avatarCacheKey(remoteUrl: string): string {
  return createHash('sha256').update(remoteUrl).digest('hex');
}

function avatarExtensionFromContentType(contentType: string | null): string | undefined {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return '.jpg';
  }
  if (normalized === 'image/png') {
    return '.png';
  }
  if (normalized === 'image/webp') {
    return '.webp';
  }
  if (normalized === 'image/gif') {
    return '.gif';
  }
  return undefined;
}

function avatarExtensionFromUrl(remoteUrl: string): string {
  try {
    const pathname = new URL(remoteUrl).pathname.toLowerCase();
    const directMatch = pathname.match(/\.(jpe?g|png|webp|gif)(?:$|[/?#])/);
    if (directMatch) {
      return directMatch[1] === 'jpeg' ? '.jpg' : `.${directMatch[1]}`;
    }

    const atprotoImageMatch = pathname.match(/@(jpeg|png|webp|gif)(?:$|[/?#])/);
    if (atprotoImageMatch) {
      return atprotoImageMatch[1] === 'jpeg' ? '.jpg' : `.${atprotoImageMatch[1]}`;
    }
  } catch {
    // Fall back to the common Bluesky avatar format.
  }
  return '.jpg';
}

async function cachedAvatarFileUrl(cacheKey: string): Promise<string | undefined> {
  const cacheDir = avatarCacheDirectory();
  for (const extension of avatarCacheExtensions) {
    const filePath = join(cacheDir, `${cacheKey}${extension}`);
    try {
      await access(filePath);
      return pathToFileURL(filePath).toString();
    } catch {
      // Keep checking supported extensions.
    }
  }
  return undefined;
}

async function cacheAvatarUrlUncached(remoteUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return remoteUrl;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return remoteUrl;
  }

  const cacheKey = avatarCacheKey(remoteUrl);
  const cached = await cachedAvatarFileUrl(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(remoteUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return remoteUrl;
    }

    const contentTypeExtension = avatarExtensionFromContentType(response.headers.get('content-type'));
    if (!contentTypeExtension) {
      return remoteUrl;
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_IMAGE_BYTES) {
      return remoteUrl;
    }

    const extension = contentTypeExtension ?? avatarExtensionFromUrl(remoteUrl);
    const cacheDir = avatarCacheDirectory();
    await mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const filePath = join(cacheDir, `${cacheKey}${extension}`);
    const tempPath = `${filePath}.${process.pid}.tmp`;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_AVATAR_IMAGE_BYTES) {
      return remoteUrl;
    }
    await writeFile(tempPath, bytes, { mode: 0o600 });
    await rename(tempPath, filePath);
    return pathToFileURL(filePath).toString();
  } catch {
    return remoteUrl;
  }
}

async function cacheAvatarUrl(remoteUrl: string | undefined): Promise<string | undefined> {
  if (!remoteUrl) {
    return undefined;
  }

  const existing = avatarCacheInFlight.get(remoteUrl);
  if (existing) {
    return existing;
  }

  const request = cacheAvatarUrlUncached(remoteUrl);
  avatarCacheInFlight.set(remoteUrl, request);
  try {
    return await request;
  } finally {
    avatarCacheInFlight.delete(remoteUrl);
  }
}

async function cacheBskyProfileAvatar(profile: GaiaBskyProfile): Promise<GaiaBskyProfile> {
  return {
    ...profile,
    avatar: await cacheAvatarUrl(profile.avatar),
  };
}

async function cacheBskyActorAvatars(actors: GaiaBskyActor[]): Promise<GaiaBskyActor[]> {
  return Promise.all(
    actors.map(async (actor) => ({
      ...actor,
      avatar: await cacheAvatarUrl(actor.avatar),
    })),
  );
}

async function cacheBskyConvoAvatars(convo: GaiaBskyConvo): Promise<GaiaBskyConvo> {
  return {
    ...convo,
    members: await cacheBskyActorAvatars(convo.members),
  };
}

function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Enter a server URL.');
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Server URL must use http or https.');
  }

  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function safeExternalUrl(rawUrl: string | URL): string {
  const parsed = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl);
  if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('Gaia only opens http and https links outside the app.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Gaia will not open links with embedded credentials.');
  }
  return parsed.toString();
}

async function openSafeExternalUrl(rawUrl: string | URL): Promise<void> {
  await shell.openExternal(safeExternalUrl(rawUrl));
}

function normalizeAtprotoIdentity(rawInput: string): string {
  const input = rawInput.trim();
  if (!input) {
    throw new Error('Enter an ATProto handle, DID, or provider.');
  }

  if (input.startsWith('did:')) {
    return input;
  }

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const parsed = new URL(input);
    parsed.username = '';
    parsed.password = '';
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  const handle = input.startsWith('@') ? input.replace(/^@+/, '') : input;
  if (!handle) {
    throw new Error('Enter your ATProto handle or provider.');
  }

  if (handle.includes('@')) {
    throw new Error('Use your ATProto handle or provider, not your email address.');
  }

  const normalizedHandle = handle.toLowerCase();
  if (normalizedHandle === 'bsky.social' || normalizedHandle === 'bsky.app') {
    return DEFAULT_AUTH_HANDLE;
  }

  return normalizedHandle;
}

function normalizeOptionalAtprotoIdentity(rawInput: string): string | null {
  const input = rawInput.trim();
  if (!input) {
    return null;
  }

  return normalizeAtprotoIdentity(input);
}

function serverOrigin(serverUrl: string): string {
  return new URL(serverUrl).origin;
}

function normalizedHostname(origin: string): string {
  return new URL(origin).hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
}

function isLoopbackOrigin(origin: string): boolean {
  const hostname = normalizedHostname(origin);
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.startsWith('127.') || hostname === '::1';
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  if (hostname === '::1') {
    return true;
  }

  if (hostname.startsWith('::ffff:')) {
    return isPrivateIpv4(hostname.slice('::ffff:'.length));
  }

  return hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
}

function isPrivateNetworkOrigin(origin: string): boolean {
  const hostname = normalizedHostname(origin);
  const ipFamily = isIP(hostname);
  if (ipFamily === 4) {
    return isPrivateIpv4(hostname);
  }
  if (ipFamily === 6) {
    return isPrivateIpv6(hostname);
  }

  return isLoopbackOrigin(origin) || hostname.endsWith('.local') || !hostname.includes('.');
}

function canSendLauncherTokenToOrigin(origin: string): boolean {
  const parsed = new URL(origin);
  return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isPrivateNetworkOrigin(origin));
}

function storedServerOriginsSnapshot(): Set<string> {
  try {
    const contents = readFileSync(storePath(), 'utf8');
    return new Set(coerceStore(JSON.parse(contents) as Partial<GaiaStore>).servers.map((server) => serverOrigin(server.url)));
  } catch {
    return new Set(defaultStore().servers.map((server) => serverOrigin(server.url)));
  }
}

function canAttachCurrentWebviewSource(sourceUrl: string | undefined): boolean {
  if (!sourceUrl || sourceUrl === 'about:blank') {
    return true;
  }

  try {
    const origin = serverOrigin(normalizeServerUrl(sourceUrl));
    return storedServerOriginsSnapshot().has(origin);
  } catch {
    return false;
  }
}

function sameOriginHttpResourceUrl(rawUrl: string, origin: string): string | undefined {
  try {
    const resolved = new URL(rawUrl, origin);
    if ((resolved.protocol !== 'http:' && resolved.protocol !== 'https:') || resolved.origin !== origin) {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

type IpcSenderScope = 'launcher' | 'current-webview' | 'launcher-or-current-webview';

function ipcFrameUrl(event: IpcMainInvokeEvent): string {
  return event.senderFrame?.url || event.sender.getURL();
}

function isTrustedLauncherRendererUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const devServerUrl = process.env.GAIA_DEV_SERVER_URL?.trim();
    if (devServerUrl) {
      return parsed.origin === new URL(devServerUrl).origin;
    }

    if (parsed.protocol !== 'file:') {
      return false;
    }
    parsed.search = '';
    parsed.hash = '';
    return fileURLToPath(parsed) === join(__dirname, '../renderer/index.html');
  } catch {
    return false;
  }
}

function isTrustedLauncherIpcSender(event: IpcMainInvokeEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return false;
  }
  return isTrustedLauncherRendererUrl(ipcFrameUrl(event));
}

function isTrustedCurrentWebviewFrameUrl(rawUrl: string): boolean {
  if (!rawUrl || rawUrl === 'about:blank') {
    return false;
  }
  return canAttachCurrentWebviewSource(rawUrl);
}

function isTrustedCurrentWebviewIpcSender(event: IpcMainInvokeEvent): boolean {
  if (!currentWebviewContents.has(event.sender) || event.sender.isDestroyed()) {
    return false;
  }
  return isTrustedCurrentWebviewFrameUrl(ipcFrameUrl(event));
}

function isTrustedIpcSender(event: IpcMainInvokeEvent, scope: IpcSenderScope): boolean {
  if (scope === 'launcher') {
    return isTrustedLauncherIpcSender(event);
  }
  if (scope === 'current-webview') {
    return isTrustedCurrentWebviewIpcSender(event);
  }
  return isTrustedLauncherIpcSender(event) || isTrustedCurrentWebviewIpcSender(event);
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent, scope: IpcSenderScope, channel: string): void {
  if (isTrustedIpcSender(event, scope)) {
    return;
  }

  console.warn(
    `[gaia:ipc] blocked ${channel} from untrusted sender id=${event.sender.id} url=${ipcFrameUrl(event) || 'unknown'}`,
  );
  throw new Error('Blocked untrusted Gaia IPC sender.');
}

function handleIpc<TArgs extends unknown[], TResult>(
  channel: string,
  scope: IpcSenderScope,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event, scope, channel);
    return handler(event, ...(args as TArgs));
  });
}

function defaultStore(): GaiaStore {
  const createdAt = nowIso();
  return {
    version: STORE_VERSION,
    selectedServerId: 'srv_local_current',
    identity: null,
    servers: [
      {
        id: 'srv_local_current',
        name: 'Local Current',
        url: 'http://127.0.0.1:8080',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    settings: defaultSettings(),
  };
}

function defaultSettings(): GaiaSettings {
  return {
    startupView: 'last',
    lastContentView: 'server',
    appearanceMode: 'auto',
    accentColor: DEFAULT_ACCENT_COLOR,
    density: 'comfortable',
    reducedMotion: false,
    gifPlayback: 'always',
    animatedCurrentBackgrounds: true,
    fastGraphicsMode: false,
    perfProbe: false,
    sound: defaultSoundSettings(),
    video: defaultVideoSettings(),
  };
}

function defaultSoundSettings(): GaiaSoundSettings {
  return {
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    outputVolume: 1,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    pushToTalkMode: 'hold',
    pushToTalkKey: 'Space',
  };
}

function defaultVideoSettings(): GaiaVideoSettings {
  return {
    cameraDeviceId: 'default',
    cameraResolution: '720p',
    cameraFrameRate: 30,
    mirrorPreview: true,
  };
}

function storePath(): string {
  return join(app.getPath('userData'), 'servers.json');
}

function usageClientIdPath(): string {
  return join(app.getPath('userData'), GAIA_USAGE_CLIENT_ID_FILE);
}

async function usageClientId(): Promise<string> {
  if (usageClientIdPromise) {
    return usageClientIdPromise;
  }

  usageClientIdPromise = (async () => {
    const existing = await readFile(usageClientIdPath(), 'utf8').catch(() => '');
    const trimmed = existing.trim();
    if (/^[a-f0-9-]{24,64}$/i.test(trimmed)) {
      return trimmed;
    }

    const nextId = randomUUID();
    await writeFile(usageClientIdPath(), `${nextId}\n`, 'utf8').catch(() => undefined);
    return nextId;
  })();

  return usageClientIdPromise;
}

async function pingGaiaWebsiteUsage(): Promise<void> {
  if (!GAIA_USAGE_PING_URL || process.env.GAIA_USAGE_PING_DISABLED === '1') {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(GAIA_USAGE_PING_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app: 'gaia-launcher',
        clientId: await usageClientId(),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        sentAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } catch {
    // Usage presence is best-effort and should never interrupt launcher startup.
  } finally {
    clearTimeout(timeout);
  }
}

function startGaiaWebsiteUsageHeartbeat(): void {
  if (usageHeartbeatTimer || !GAIA_USAGE_PING_URL || process.env.GAIA_USAGE_PING_DISABLED === '1') {
    return;
  }
  void pingGaiaWebsiteUsage();
  usageHeartbeatTimer = setInterval(() => {
    void pingGaiaWebsiteUsage();
  }, GAIA_USAGE_HEARTBEAT_MS);
}

function stopGaiaWebsiteUsageHeartbeat(): void {
  if (usageHeartbeatTimer) {
    clearInterval(usageHeartbeatTimer);
    usageHeartbeatTimer = null;
  }
}

function bskyAuthStorePath(): string {
  return join(app.getPath('userData'), 'bluesky-oauth.json');
}

function currentSessionStorePath(): string {
  return join(app.getPath('userData'), 'current-sessions.json');
}

function notificationStorePath(): string {
  return join(app.getPath('userData'), 'notifications.json');
}

function uniqueTempPath(path: string): string {
  return `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

function defaultBskyAuthStore(): BskyAuthStore {
  return {
    states: {},
    sessions: {},
  };
}

function coerceBskyAuthStore(raw: Partial<BskyAuthStore> | null): BskyAuthStore {
  const fallback = defaultBskyAuthStore();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const now = Date.now();
  const states: BskyAuthStore['states'] = {};
  if (raw.states && typeof raw.states === 'object') {
    for (const [key, entry] of Object.entries(raw.states)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.createdAt === 'number' &&
        now - entry.createdAt < BSKY_STATE_TTL_MS &&
        entry.value
      ) {
        states[key] = entry as { value: NodeSavedState; createdAt: number };
      }
    }
  }

  return {
    activeDid: typeof raw.activeDid === 'string' ? raw.activeDid : undefined,
    states,
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
  };
}

async function readBskyAuthStore(): Promise<BskyAuthStore> {
  try {
    const contents = await readFile(bskyAuthStorePath(), 'utf8');
    return coerceBskyAuthStore(JSON.parse(contents) as Partial<BskyAuthStore>);
  } catch {
    return defaultBskyAuthStore();
  }
}

async function saveBskyAuthStore(store: BskyAuthStore): Promise<BskyAuthStore> {
  const path = bskyAuthStorePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = uniqueTempPath(path);
  const normalized = coerceBskyAuthStore(store);
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tempPath, path);
  return normalized;
}

async function mutateBskyAuthStore(mutator: (store: BskyAuthStore) => BskyAuthStore): Promise<BskyAuthStore> {
  const current = await readBskyAuthStore();
  return saveBskyAuthStore(mutator(current));
}

function defaultCurrentSessionStore(): CurrentSessionStore {
  return {
    version: 1,
    sessions: {},
  };
}

function coerceCurrentSessionStore(raw: Partial<CurrentSessionStore> | null): CurrentSessionStore {
  const fallback = defaultCurrentSessionStore();
  if (!raw || typeof raw !== 'object' || !raw.sessions || typeof raw.sessions !== 'object') {
    return fallback;
  }

  const now = Date.now();
  const sessions: CurrentSessionStore['sessions'] = {};
  for (const [origin, record] of Object.entries(raw.sessions)) {
    if (
      !record ||
      typeof record !== 'object' ||
      typeof record.origin !== 'string' ||
      typeof record.sessionToken !== 'string' ||
      typeof record.expiresAt !== 'string' ||
      record.sessionToken.length === 0
    ) {
      continue;
    }

    const expiresAtMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      continue;
    }

    try {
      const normalizedOrigin = serverOrigin(normalizeServerUrl(record.origin));
      sessions[normalizedOrigin] = {
        origin: normalizedOrigin,
        sessionToken: record.sessionToken,
        expiresAt: new Date(expiresAtMs).toISOString(),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso(),
      };
    } catch {
      // Skip malformed stored origins.
    }
  }

  return {
    version: 1,
    sessions,
  };
}

async function readCurrentSessionStore(): Promise<CurrentSessionStore> {
  try {
    const contents = await readFile(currentSessionStorePath(), 'utf8');
    return coerceCurrentSessionStore(JSON.parse(contents) as Partial<CurrentSessionStore>);
  } catch {
    return defaultCurrentSessionStore();
  }
}

async function saveCurrentSessionStore(store: CurrentSessionStore): Promise<CurrentSessionStore> {
  const path = currentSessionStorePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = uniqueTempPath(path);
  const normalized = coerceCurrentSessionStore(store);
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tempPath, path);
  return normalized;
}

async function rememberCurrentSession(input: { origin: string; sessionToken: string }): Promise<void> {
  const origin = serverOrigin(normalizeServerUrl(input.origin));
  const expiresAt = new Date(Date.now() + CURRENT_SESSION_TTL_MS).toISOString();
  const current = await readCurrentSessionStore();
  await saveCurrentSessionStore({
    version: 1,
    sessions: {
      ...current.sessions,
      [origin]: {
        origin,
        sessionToken: input.sessionToken,
        expiresAt,
        updatedAt: nowIso(),
      },
    },
  });
}

async function forgetCurrentSession(origin: string): Promise<void> {
  const normalizedOrigin = serverOrigin(normalizeServerUrl(origin));
  const current = await readCurrentSessionStore();
  const { [normalizedOrigin]: _removed, ...sessions } = current.sessions;
  await saveCurrentSessionStore({
    version: 1,
    sessions,
  });
}

async function cachedCurrentSessionToken(origin: string): Promise<string | undefined> {
  const normalizedOrigin = serverOrigin(normalizeServerUrl(origin));
  return (await readCurrentSessionStore()).sessions[normalizedOrigin]?.sessionToken;
}

function defaultNotificationStore(): GaiaNotificationStore {
  return {
    version: 1,
    notifications: [],
    currentLastSeqByServerId: {},
  };
}

function coerceNotificationKind(value: unknown): GaiaNotificationKind {
  return value === 'current_reply' || value === 'current_mention' || value === 'current_message'
    ? value
    : 'current_mention';
}

function coerceNotificationStore(raw: Partial<GaiaNotificationStore> | null): GaiaNotificationStore {
  const fallback = defaultNotificationStore();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const notifications = Array.isArray(raw.notifications)
    ? raw.notifications
        .filter((notification): notification is GaiaNotification => {
          return Boolean(
            notification &&
              typeof notification.id === 'string' &&
              typeof notification.serverId === 'string' &&
              typeof notification.serverName === 'string' &&
              typeof notification.serverUrl === 'string' &&
              typeof notification.channelId === 'string' &&
              typeof notification.messageId === 'string' &&
              typeof notification.authorId === 'string' &&
              typeof notification.authorName === 'string' &&
              typeof notification.title === 'string' &&
              typeof notification.body === 'string' &&
              typeof notification.createdAt === 'string',
          );
        })
        .map((notification) => ({
          ...notification,
          kind: coerceNotificationKind(notification.kind),
          channelName: typeof notification.channelName === 'string' ? notification.channelName : undefined,
          authorHandle: typeof notification.authorHandle === 'string' ? notification.authorHandle : undefined,
          authorAvatarUrl:
            typeof notification.authorAvatarUrl === 'string' ? notification.authorAvatarUrl : undefined,
          readAt: typeof notification.readAt === 'string' ? notification.readAt : undefined,
        }))
        .slice(0, MAX_NOTIFICATION_HISTORY)
    : [];

  const currentLastSeqByServerId: Record<string, number> = {};
  if (raw.currentLastSeqByServerId && typeof raw.currentLastSeqByServerId === 'object') {
    for (const [serverId, seq] of Object.entries(raw.currentLastSeqByServerId)) {
      if (typeof serverId === 'string' && typeof seq === 'number' && Number.isFinite(seq) && seq > 0) {
        currentLastSeqByServerId[serverId] = Math.floor(seq);
      }
    }
  }

  return {
    version: 1,
    notifications,
    currentLastSeqByServerId,
  };
}

function toNotificationCenterState(store: GaiaNotificationStore): GaiaNotificationCenterState {
  return {
    notifications: store.notifications,
    unreadCount: store.notifications.filter((notification) => !notification.readAt).length,
  };
}

async function readNotificationStore(): Promise<GaiaNotificationStore> {
  try {
    const contents = await readFile(notificationStorePath(), 'utf8');
    return coerceNotificationStore(JSON.parse(contents) as Partial<GaiaNotificationStore>);
  } catch {
    return defaultNotificationStore();
  }
}

async function saveNotificationStore(store: GaiaNotificationStore): Promise<GaiaNotificationStore> {
  const path = notificationStorePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = uniqueTempPath(path);
  const normalized = coerceNotificationStore(store);
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tempPath, path);
  return normalized;
}

async function notifyNotificationCenterChanged(): Promise<GaiaNotificationCenterState> {
  const state = toNotificationCenterState(await readNotificationStore());
  mainWindow?.webContents.send('gaia:notifications:changed', state);
  return state;
}

async function mutateNotificationStore(
  mutator: (store: GaiaNotificationStore) => GaiaNotificationStore,
  broadcast = true,
): Promise<GaiaNotificationStore> {
  const nextMutation = notificationMutationQueue.then(async () => {
    const current = await readNotificationStore();
    return saveNotificationStore(mutator(current));
  });
  notificationMutationQueue = nextMutation.then(
    () => undefined,
    () => undefined,
  );
  const next = await nextMutation;
  if (broadcast) {
    mainWindow?.webContents.send('gaia:notifications:changed', toNotificationCenterState(next));
  }
  return next;
}

async function recordCurrentLastSeq(serverId: string, seq: number): Promise<void> {
  if (!Number.isFinite(seq) || seq <= 0) {
    return;
  }
  await mutateNotificationStore(
    (store) => ({
      ...store,
      currentLastSeqByServerId: {
        ...store.currentLastSeqByServerId,
        [serverId]: Math.max(store.currentLastSeqByServerId[serverId] ?? 0, Math.floor(seq)),
      },
    }),
    false,
  );
}

function showCurrentDesktopNotification(notification: GaiaNotification): void {
  if (!Notification.isSupported()) {
    return;
  }

  const toast = new Notification({
    title: `${notification.serverName}: ${notification.title}`,
    body: notification.body,
    ...(gaiaAppIconPath() ? { icon: gaiaAppIconPath() } : {}),
  });
  toast.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });
  toast.show();
}

async function addCurrentNotification(
  notification: GaiaNotification,
  options: { showDesktop?: boolean } = {},
): Promise<void> {
  let added = false;
  await mutateNotificationStore((store) => {
    const duplicate = store.notifications.some(
      (existing) =>
        existing.kind === notification.kind &&
        existing.serverId === notification.serverId &&
        existing.messageId === notification.messageId,
    );
    if (duplicate) {
      return store;
    }

    added = true;
    return {
      ...store,
      notifications: [notification, ...store.notifications].slice(0, MAX_NOTIFICATION_HISTORY),
    };
  });

  if (added && options.showDesktop !== false) {
    showCurrentDesktopNotification(notification);
  }
}

async function markNotificationsRead(notificationIds?: string[]): Promise<GaiaNotificationCenterState> {
  const idSet = notificationIds && notificationIds.length > 0 ? new Set(notificationIds) : null;
  const readAt = nowIso();
  const next = await mutateNotificationStore((store) => ({
    ...store,
    notifications: store.notifications.map((notification) =>
      !notification.readAt && (!idSet || idSet.has(notification.id))
        ? {
            ...notification,
            readAt,
          }
        : notification,
    ),
  }));
  return toNotificationCenterState(next);
}

async function markCurrentChannelNotificationsRead(input: {
  serverId: string;
  channelId: string;
  readAt?: string;
}): Promise<GaiaNotificationCenterState> {
  const readAt = input.readAt ?? nowIso();
  const readAtTimestamp = Date.parse(readAt);
  const next = await mutateNotificationStore((store) => ({
    ...store,
    notifications: store.notifications.map((notification) => {
      if (
        notification.readAt ||
        notification.serverId !== input.serverId ||
        notification.channelId !== input.channelId
      ) {
        return notification;
      }
      if (Number.isFinite(readAtTimestamp)) {
        const createdAt = Date.parse(notification.createdAt);
        if (Number.isFinite(createdAt) && createdAt > readAtTimestamp) {
          return notification;
        }
      }
      return {
        ...notification,
        readAt,
      };
    }),
  }));
  return toNotificationCenterState(next);
}

async function clearNotifications(): Promise<GaiaNotificationCenterState> {
  const next = await mutateNotificationStore((store) => ({
    ...store,
    notifications: [],
  }));
  return toNotificationCenterState(next);
}

function coerceStore(raw: Partial<GaiaStore> | null): GaiaStore {
  const fallback = defaultStore();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const servers = Array.isArray(raw.servers)
    ? raw.servers
        .filter((server): server is GaiaServer => {
          return Boolean(
            server &&
              typeof server.id === 'string' &&
              typeof server.name === 'string' &&
              typeof server.url === 'string',
          );
        })
        .map((server) => {
          const updatedAt = typeof server.updatedAt === 'string' ? server.updatedAt : nowIso();
          return {
            id: server.id,
            name: server.name,
            url: normalizeServerUrl(server.url),
            createdAt: typeof server.createdAt === 'string' ? server.createdAt : updatedAt,
            updatedAt,
          };
        })
    : fallback.servers;

  let identity: GaiaIdentity | null = null;
  if (raw.identity && typeof raw.identity.handle === 'string') {
    try {
      const handle = normalizeOptionalAtprotoIdentity(raw.identity.handle);
      if (handle) {
        identity = {
          handle,
          updatedAt: typeof raw.identity.updatedAt === 'string' ? raw.identity.updatedAt : nowIso(),
        };
      }
    } catch {
      identity = null;
    }
  }

  return {
    version: STORE_VERSION,
    selectedServerId:
      typeof raw.selectedServerId === 'string' && servers.some((server) => server.id === raw.selectedServerId)
        ? raw.selectedServerId
        : servers[0]?.id,
    identity,
    servers: servers.length > 0 ? servers : fallback.servers,
    settings: coerceSettings(raw.settings),
  };
}

function coerceSettings(raw: Partial<GaiaSettings> | undefined | null): GaiaSettings {
  const fallback = defaultSettings();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  return {
    startupView:
      raw.startupView === 'last' || raw.startupView === 'server' || raw.startupView === 'messages'
        ? raw.startupView
        : fallback.startupView,
    lastContentView:
      raw.lastContentView === 'server' || raw.lastContentView === 'messages'
        ? raw.lastContentView
        : fallback.lastContentView,
    appearanceMode:
      raw.appearanceMode === 'auto' || raw.appearanceMode === 'light' || raw.appearanceMode === 'dark'
        ? raw.appearanceMode
        : fallback.appearanceMode,
    accentColor: coerceAccentColor(raw.accentColor, fallback.accentColor),
    density:
      raw.density === 'comfortable' || raw.density === 'compact'
        ? raw.density
        : fallback.density,
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : fallback.reducedMotion,
    gifPlayback:
      raw.gifPlayback === 'always' || raw.gifPlayback === 'focused' || raw.gifPlayback === 'never'
        ? raw.gifPlayback
        : fallback.gifPlayback,
    animatedCurrentBackgrounds:
      typeof raw.animatedCurrentBackgrounds === 'boolean'
        ? raw.animatedCurrentBackgrounds
        : fallback.animatedCurrentBackgrounds,
    fastGraphicsMode: typeof raw.fastGraphicsMode === 'boolean' ? raw.fastGraphicsMode : fallback.fastGraphicsMode,
    perfProbe: typeof raw.perfProbe === 'boolean' ? raw.perfProbe : fallback.perfProbe,
    sound: coerceSoundSettings(raw.sound),
    video: coerceVideoSettings(raw.video),
  };
}

function coerceAccentColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

function coerceDeviceId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function coercePushToTalkKey(value: unknown, fallback: string): string {
  const key = typeof value === 'string' ? value.trim() : '';
  return key.length > 0 && key.length <= 48 ? key : fallback;
}

function coerceSoundSettings(raw: Partial<GaiaSoundSettings> | undefined | null): GaiaSoundSettings {
  const fallback = defaultSoundSettings();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  return {
    inputDeviceId: coerceDeviceId(raw.inputDeviceId, fallback.inputDeviceId),
    outputDeviceId: coerceDeviceId(raw.outputDeviceId, fallback.outputDeviceId),
    outputVolume: clampNumber(raw.outputVolume, fallback.outputVolume, 0, 1),
    noiseSuppression: typeof raw.noiseSuppression === 'boolean' ? raw.noiseSuppression : fallback.noiseSuppression,
    echoCancellation: typeof raw.echoCancellation === 'boolean' ? raw.echoCancellation : fallback.echoCancellation,
    autoGainControl: typeof raw.autoGainControl === 'boolean' ? raw.autoGainControl : fallback.autoGainControl,
    pushToTalkMode:
      raw.pushToTalkMode === 'voice_activity' || raw.pushToTalkMode === 'hold' || raw.pushToTalkMode === 'toggle'
        ? raw.pushToTalkMode
        : fallback.pushToTalkMode,
    pushToTalkKey: coercePushToTalkKey(raw.pushToTalkKey, fallback.pushToTalkKey),
  };
}

function coerceVideoSettings(raw: Partial<GaiaVideoSettings> | undefined | null): GaiaVideoSettings {
  const fallback = defaultVideoSettings();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  return {
    cameraDeviceId: coerceDeviceId(raw.cameraDeviceId, fallback.cameraDeviceId),
    cameraResolution:
      raw.cameraResolution === '480p' || raw.cameraResolution === '720p' || raw.cameraResolution === '1080p'
        ? raw.cameraResolution
        : fallback.cameraResolution,
    cameraFrameRate: Math.round(clampNumber(raw.cameraFrameRate, fallback.cameraFrameRate, 1, 60)),
    mirrorPreview: typeof raw.mirrorPreview === 'boolean' ? raw.mirrorPreview : fallback.mirrorPreview,
  };
}

async function readStore(): Promise<GaiaStore> {
  try {
    const contents = await readFile(storePath(), 'utf8');
    return coerceStore(JSON.parse(contents) as Partial<GaiaStore>);
  } catch {
    const store = defaultStore();
    await saveStore(store);
    return store;
  }
}

async function saveStore(store: GaiaStore): Promise<GaiaStore> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = uniqueTempPath(path);
  const normalized = coerceStore(store);
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tempPath, path);
  return normalized;
}

async function mutateStore(mutator: (store: GaiaStore) => GaiaStore): Promise<GaiaStore> {
  const nextMutation = storeMutationQueue.then(async () => {
    const current = await readStore();
    return saveStore(mutator(current));
  });
  storeMutationQueue = nextMutation.then(
    () => undefined,
    () => undefined,
  );
  return nextMutation;
}

function toServer(input: GaiaServerInput): GaiaServer {
  const timestamp = nowIso();
  const url = normalizeServerUrl(input.url);
  const fallbackName = new URL(url).host;
  return {
    id: createId('srv'),
    name: input.name?.trim() || fallbackName,
    url,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sendAuthResult(result: { authId: string; serverUrl: string; ok: boolean; message: string }): void {
  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('gaia:auth:result', result);
}

function sendClientAuthResult(result: GaiaClientAuthResult): void {
  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('gaia:client-auth:result', result);
}

function gaiaLogoPath(): string | undefined {
  const candidates = [
    join(__dirname, '../assets/logo.svg'),
    join(__dirname, '../../src/assets/logo.svg'),
    join(app.getAppPath(), 'src/assets/logo.svg'),
    join(app.getAppPath(), 'dist/assets/logo.svg'),
    join(process.cwd(), 'src/assets/logo.svg'),
    join(process.cwd(), 'dist/assets/logo.svg'),
    join(__dirname, '../assets/logo_grayscale.svg'),
    join(__dirname, '../../src/assets/logo_grayscale.svg'),
    join(app.getAppPath(), 'src/assets/logo_grayscale.svg'),
    join(app.getAppPath(), 'dist/assets/logo_grayscale.svg'),
    join(process.cwd(), 'src/assets/logo_grayscale.svg'),
    join(process.cwd(), 'dist/assets/logo_grayscale.svg'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function gaiaAppIconPath(): string | undefined {
  const candidates = [
    join(__dirname, '..', GAIA_APP_ICON_RELATIVE_PATH),
    join(__dirname, '../../src/assets/appicon/linux/256x256.png'),
    join(app.getAppPath(), 'src/assets/appicon/linux/256x256.png'),
    join(app.getAppPath(), 'dist', GAIA_APP_ICON_RELATIVE_PATH),
    join(process.cwd(), 'src/assets/appicon/linux/256x256.png'),
    join(process.cwd(), 'dist', GAIA_APP_ICON_RELATIVE_PATH),
    join(__dirname, '../assets/appicon/gaia_app_icon.png'),
    join(__dirname, '../../src/assets/appicon/gaia_app_icon.png'),
    join(app.getAppPath(), 'src/assets/appicon/gaia_app_icon.png'),
    join(app.getAppPath(), 'dist/assets/appicon/gaia_app_icon.png'),
    join(process.cwd(), 'src/assets/appicon/gaia_app_icon.png'),
    join(process.cwd(), 'dist/assets/appicon/gaia_app_icon.png'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function gaiaAppIconImage(): ReturnType<typeof nativeImage.createFromPath> | undefined {
  const iconPath = gaiaAppIconPath();
  if (!iconPath) {
    return undefined;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    return undefined;
  }

  return process.platform === 'linux' ? icon.resize({ width: 256, height: 256 }) : icon;
}

function configureAppIdentity(): void {
  const icon = gaiaAppIconImage();
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon);
  }
}

function gaiaLogoDataUrl(): string | undefined {
  if (gaiaLogoDataUrlCache !== undefined) {
    return gaiaLogoDataUrlCache ?? undefined;
  }

  const logoPath = gaiaLogoPath();
  if (!logoPath) {
    gaiaLogoDataUrlCache = null;
    return undefined;
  }

  gaiaLogoDataUrlCache = `data:image/svg+xml;base64,${readFileSync(logoPath).toString('base64')}`;
  return gaiaLogoDataUrlCache;
}

function buildAuthReturnPage(input: { ok: boolean; title: string; message: string }): string {
  const accent = input.ok ? '#2fbf84' : '#ff8795';
  const logoUrl = gaiaLogoDataUrl();
  const mark = logoUrl ? `<img class="mark-logo" src="${logoUrl}" alt="Gaia Launcher" />` : '<span>Gaia</span>';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Gaia Launcher Sign-In</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        color: #f4f7fb;
        background:
          radial-gradient(circle at 20% 18%, rgba(48, 191, 132, 0.16), transparent 34%),
          radial-gradient(circle at 80% 12%, rgba(74, 157, 248, 0.18), transparent 30%),
          linear-gradient(160deg, #14161a 0%, #202328 52%, #15171b 100%);
      }
      main {
        width: min(460px, calc(100vw - 32px));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 24px;
        background: rgba(24, 26, 31, 0.94);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36);
      }
      .mark {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        overflow: hidden;
        border: 1px solid ${accent};
        border-radius: 14px;
        padding: 4px;
        margin-bottom: 18px;
        background: rgba(255, 255, 255, 0.1);
        color: #07110d;
        font-weight: 900;
      }
      .mark-logo { width: 100%; height: 100%; object-fit: contain; border-radius: 10px; }
      .mark span { color: #f4f7fb; font-size: 0.78rem; }
      h1 { margin: 0 0 8px; font-size: 1.45rem; letter-spacing: 0; }
      p { margin: 0; color: #c2c9d4; line-height: 1.45; }
      small { display: block; margin-top: 18px; color: #8e97a5; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">${mark}</div>
      <h1>${input.title}</h1>
      <p>${input.message}</p>
      <small>You can return to Gaia Launcher.</small>
    </main>
  </body>
</html>`;
}

function sendHtml(reply: ServerResponse, statusCode: number, html: string): void {
  reply.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  reply.end(html);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === 'function') {
    return withGetter.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function readCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

async function applyCurrentSessionCookie(input: { origin: string; sessionToken: string }): Promise<void> {
  const origin = serverOrigin(normalizeServerUrl(input.origin));
  const expirationDate = Math.floor((Date.now() + CURRENT_SESSION_TTL_MS) / 1000);
  await session.fromPartition(CURRENT_PARTITION).cookies.set({
    url: origin,
    name: 'current_session',
    value: input.sessionToken,
    path: '/',
    httpOnly: true,
    secure: new URL(origin).protocol === 'https:',
    expirationDate,
    sameSite: 'lax',
  });
  await rememberCurrentSession({
    origin,
    sessionToken: input.sessionToken,
  });
  void syncCurrentNotificationWatchers().catch(() => undefined);
}

async function ensureCurrentSessionCookie(origin: string): Promise<string | undefined> {
  const normalizedOrigin = serverOrigin(normalizeServerUrl(origin));
  const currentSession = session.fromPartition(CURRENT_PARTITION);
  const cookies = await currentSession.cookies.get({
    url: normalizedOrigin,
    name: 'current_session',
  });
  const liveToken = cookies[0]?.value;
  if (liveToken) {
    const cachedToken = await cachedCurrentSessionToken(normalizedOrigin);
    if (cachedToken !== liveToken) {
      await rememberCurrentSession({
        origin: normalizedOrigin,
        sessionToken: liveToken,
      });
    }
    return liveToken;
  }

  const cachedToken = await cachedCurrentSessionToken(normalizedOrigin);
  if (!cachedToken) {
    return undefined;
  }

  await currentSession.cookies.set({
    url: normalizedOrigin,
    name: 'current_session',
    value: cachedToken,
    path: '/',
    httpOnly: true,
    secure: new URL(normalizedOrigin).protocol === 'https:',
    expirationDate: Math.floor((Date.now() + CURRENT_SESSION_TTL_MS) / 1000),
    sameSite: 'lax',
  });
  return cachedToken;
}

async function exchangeAuthTicket(input: { origin: string; ticket: string }): Promise<void> {
  const response = await fetch(`${input.origin}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ticket: input.ticket }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let message = `Auth exchange failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message ?? message;
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  const sessionToken = readCookieValue(getSetCookieHeaders(response.headers), 'current_session');
  if (!sessionToken) {
    throw new Error('Current did not return a launcher session cookie.');
  }

  await applyCurrentSessionCookie({
    origin: input.origin,
    sessionToken,
  });
}

class LauncherSessionExchangeUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LauncherSessionExchangeUnsupportedError';
  }
}

function dpopHtu(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function launcherTokenSet(oauthSession: OAuthSession): Promise<TokenSet> {
  return (oauthSession as unknown as { getTokenSet(refresh: boolean | 'auto'): Promise<TokenSet> }).getTokenSet('auto');
}

function launcherTokenAudience(tokenSet: TokenSet): string | undefined {
  try {
    return serverOrigin(tokenSet.aud);
  } catch {
    return tokenSet.aud;
  }
}

async function createLauncherDpopProof(input: {
  oauthSession: OAuthSession;
  tokenSet: TokenSet;
  method: string;
  url: string;
}): Promise<string> {
  const key = input.oauthSession.server.dpopKey;
  const alg =
    input.oauthSession.serverMetadata.dpop_signing_alg_values_supported?.find((candidate) =>
      key.algorithms.includes(candidate),
    ) ?? key.algorithms[0];
  const jwk = key.bareJwk;
  if (!alg || !jwk) {
    throw new Error('Gaia could not create an ATProto token proof for this server.');
  }

  let nonce: string | undefined;
  try {
    nonce = await input.oauthSession.server.dpopNonces.get(new URL(input.url).origin);
  } catch {
    nonce = undefined;
  }

  return key.createJwt(
    {
      alg,
      typ: 'dpop+jwt',
      jwk,
    },
    {
      iat: Math.floor(Date.now() / 1000),
      jti: createId('dpop'),
      htm: input.method.toUpperCase(),
      htu: dpopHtu(input.url),
      ath: createHash('sha256').update(input.tokenSet.access_token).digest('base64url'),
      nonce,
    },
  );
}

async function createLauncherResourceProof(input: {
  oauthSession: OAuthSession;
  tokenSet: TokenSet;
}): Promise<{ method: 'GET'; url: string; dpopProof: string }> {
  const url = new URL('/xrpc/com.atproto.server.getSession', input.tokenSet.aud).toString();
  return {
    method: 'GET',
    url,
    dpopProof: await createLauncherDpopProof({
      oauthSession: input.oauthSession,
      tokenSet: input.tokenSet,
      method: 'GET',
      url,
    }),
  };
}

async function exchangeLauncherSession(input: {
  origin: string;
  oauthSession: OAuthSession;
  profile: GaiaBskyProfile;
}): Promise<void> {
  if (!canSendLauncherTokenToOrigin(input.origin)) {
    throw new LauncherSessionExchangeUnsupportedError(
      'Silent launcher sign-in requires HTTPS or a private/LAN Current server.',
    );
  }

  const endpoint = `${input.origin}/api/v1/auth/launcher`;
  const tokenSet = await launcherTokenSet(input.oauthSession);
  const resourceProof = await createLauncherResourceProof({
    oauthSession: input.oauthSession,
    tokenSet,
  });
  const dpopProof = await createLauncherDpopProof({
    oauthSession: input.oauthSession,
    tokenSet,
    method: 'POST',
    url: endpoint,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `${tokenSet.token_type} ${tokenSet.access_token}`,
      dpop: dpopProof,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      profile: input.profile,
      token: {
        issuer: tokenSet.iss,
        audience: launcherTokenAudience(tokenSet),
        scope: tokenSet.scope,
        expiresAt: tokenSet.expires_at,
      },
      resourceProof,
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404 || response.status === 405) {
    throw new LauncherSessionExchangeUnsupportedError('Current server does not support launcher token sign-in yet.');
  }

  if (!response.ok) {
    let message = `Launcher token sign-in failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } };
      message = payload.error?.message ?? message;
      if (
        (response.status === 409 && payload.error?.code === 'ATPROTO_AUTH_DISABLED') ||
        (response.status === 401 && payload.error?.code === 'LAUNCHER_AUTH_FAILED')
      ) {
        throw new LauncherSessionExchangeUnsupportedError(message);
      }
    } catch (error) {
      if (error instanceof LauncherSessionExchangeUnsupportedError) {
        throw error;
      }
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  const sessionToken = readCookieValue(getSetCookieHeaders(response.headers), 'current_session');
  if (!sessionToken) {
    throw new Error('Current did not return a launcher session cookie.');
  }

  await applyCurrentSessionCookie({
    origin: input.origin,
    sessionToken,
  });
}

async function logoutCurrentServer(serverUrl: string): Promise<{ ok: boolean; message: string }> {
  const origin = serverOrigin(normalizeServerUrl(serverUrl));
  const currentSession = session.fromPartition(CURRENT_PARTITION);
  const cookies = await currentSession.cookies.get({
    url: origin,
    name: 'current_session',
  });
  const sessionCookie = cookies[0]?.value;

  await currentSession.cookies.remove(origin, 'current_session').catch(() => undefined);
  await forgetCurrentSession(origin);
  void syncCurrentNotificationWatchers().catch(() => undefined);

  if (!sessionCookie) {
    return {
      ok: true,
      message: 'Logged out locally.',
    };
  }

  try {
    const response = await fetch(`${origin}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: `current_session=${encodeURIComponent(sessionCookie)}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok && response.status !== 401) {
      return {
        ok: true,
        message: 'Logged out locally. The server did not confirm logout.',
      };
    }

    return {
      ok: true,
      message: 'Logged out.',
    };
  } catch {
    return {
      ok: true,
      message: 'Logged out locally. The server did not respond.',
    };
  }
}

function bskyCallbackUrl(): `http://127.0.0.1:${string}` {
  if (!callbackPort) {
    throw new Error('Gaia callback server is not running.');
  }
  return `http://127.0.0.1:${callbackPort}${BSKY_CALLBACK_PATH}`;
}

async function getBskyOAuthClient(): Promise<NodeOAuthClientType> {
  if (!callbackPort) {
    await ensureCallbackServer();
  }
  const callbackUrl = bskyCallbackUrl();
  if (bskyOAuthClient && bskyOAuthClientCallbackUrl === callbackUrl) {
    return bskyOAuthClient;
  }

  bskyOAuthClient = new NodeOAuthClient({
    responseMode: 'query',
    requestLock: requestLocalLock,
    clientMetadata: buildAtprotoLoopbackClientMetadata({
      scope: BSKY_AUTH_SCOPE,
      redirect_uris: [callbackUrl],
    }),
    stateStore: {
      get: async (key: string) => (await readBskyAuthStore()).states[key]?.value,
      set: async (key: string, value: NodeSavedState) => {
        await mutateBskyAuthStore((store) => ({
          ...store,
          states: {
            ...store.states,
            [key]: {
              value,
              createdAt: Date.now(),
            },
          },
        }));
      },
      del: async (key: string) => {
        await mutateBskyAuthStore((store) => {
          const { [key]: _deleted, ...states } = store.states;
          return {
            ...store,
            states,
          };
        });
      },
    },
    sessionStore: {
      get: async (key: string) => (await readBskyAuthStore()).sessions[key],
      set: async (key: string, value: NodeSavedSession) => {
        await mutateBskyAuthStore((store) => ({
          ...store,
          activeDid: key,
          sessions: {
            ...store.sessions,
            [key]: value,
          },
        }));
      },
      del: async (key: string) => {
        await mutateBskyAuthStore((store) => {
          const { [key]: _deleted, ...sessions } = store.sessions;
          return {
            ...store,
            activeDid: store.activeDid === key ? undefined : store.activeDid,
            sessions,
          };
        });
      },
    },
  });
  bskyOAuthClientCallbackUrl = callbackUrl;
  return bskyOAuthClient;
}

async function fetchBskyProfile(oauthSession: OAuthSession): Promise<GaiaBskyProfile> {
  const params = new URLSearchParams({
    actor: oauthSession.did,
  });
  const response = await oauthSession.fetchHandler(`/xrpc/app.bsky.actor.getProfile?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return {
      did: oauthSession.did,
    };
  }

  const payload = (await response.json()) as Partial<GaiaBskyProfile>;
  return cacheBskyProfileAvatar({
    did: typeof payload.did === 'string' ? payload.did : oauthSession.did,
    handle: typeof payload.handle === 'string' ? payload.handle : undefined,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
    avatar: typeof payload.avatar === 'string' ? payload.avatar : undefined,
  });
}

async function setLauncherIdentityFromProfile(profile: GaiaBskyProfile): Promise<void> {
  const handle = profile.handle ?? profile.did;
  await mutateStore((store) => ({
    ...store,
    identity: {
      handle,
      updatedAt: nowIso(),
    },
  }));
}

async function restoreBskySession(): Promise<OAuthSession | null> {
  const store = await readBskyAuthStore();
  if (!store.activeDid) {
    return null;
  }

  try {
    const client = await getBskyOAuthClient();
    return await client.restore(store.activeDid, 'auto');
  } catch {
    await mutateBskyAuthStore((current) => ({
      ...current,
      activeDid: undefined,
    }));
    return null;
  }
}

async function requireBskySession(): Promise<OAuthSession> {
  const oauthSession = await restoreBskySession();
  if (!oauthSession) {
    throw new Error('Sign in to Bluesky from Gaia first.');
  }
  return oauthSession;
}

async function getBskyAuthStatus(): Promise<GaiaClientAuthStatus> {
  const oauthSession = await restoreBskySession();
  if (!oauthSession) {
    return {
      authenticated: false,
      message: 'Not signed in.',
    };
  }

  const [tokenInfo, profile] = await Promise.all([
    oauthSession.getTokenInfo('auto'),
    fetchBskyProfile(oauthSession),
  ]);

  return {
    authenticated: true,
    profile,
    scope: tokenInfo.scope,
    expiresAt: tokenInfo.expiresAt?.toISOString(),
  };
}

async function startBskyClientAuth(request: GaiaClientAuthStartRequest): Promise<GaiaClientAuthStartResponse> {
  await ensureCallbackServer();
  const callbackUrl = bskyCallbackUrl();
  const client = await getBskyOAuthClient();
  const handle = normalizeAtprotoIdentity(request.handle ?? (await readStore()).identity?.handle ?? DEFAULT_AUTH_HANDLE);
  const authorizationUrl = await client.authorize(handle, {
    scope: BSKY_AUTH_SCOPE,
    redirect_uri: callbackUrl,
  });

  await openSafeExternalUrl(authorizationUrl);

  return {
    openedExternal: true,
    authorizationUrl: authorizationUrl.toString(),
    callbackUrl,
  };
}

async function signOutBskyClient(): Promise<{ ok: boolean; message: string }> {
  const store = await readBskyAuthStore();
  const activeDid = store.activeDid;
  if (!activeDid) {
    return {
      ok: true,
      message: 'Signed out locally.',
    };
  }

  try {
    const client = await getBskyOAuthClient();
    const oauthSession = await client.restore(activeDid, false);
    await oauthSession.signOut();
  } catch {
    await mutateBskyAuthStore((current) => ({
      ...current,
      activeDid: undefined,
      sessions: Object.fromEntries(Object.entries(current.sessions).filter(([did]) => did !== activeDid)),
    }));
  }

  return {
    ok: true,
    message: 'Signed out.',
  };
}

function parseBskyActor(raw: unknown): GaiaBskyActor {
  const actor = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const did = typeof actor.did === 'string' ? actor.did : 'unknown';
  return {
    did,
    handle: typeof actor.handle === 'string' ? actor.handle : undefined,
    displayName: typeof actor.displayName === 'string' ? actor.displayName : undefined,
    avatar: typeof actor.avatar === 'string' ? actor.avatar : undefined,
  };
}

function parseBskyReaction(raw: unknown): { value: string; senderDid: string; createdAt?: string } | undefined {
  const reaction = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const value = typeof reaction.value === 'string' ? reaction.value : undefined;
  const sender = reaction.sender && typeof reaction.sender === 'object' ? (reaction.sender as Record<string, unknown>) : {};
  const senderDid = typeof sender.did === 'string' ? sender.did : undefined;
  if (!value || !senderDid) {
    return undefined;
  }

  return {
    value,
    senderDid,
    createdAt: typeof reaction.createdAt === 'string' ? reaction.createdAt : undefined,
  };
}

function groupBskyReactions(rawReactions: unknown): GaiaBskyReaction[] | undefined {
  if (!Array.isArray(rawReactions)) {
    return undefined;
  }

  const grouped = new Map<string, GaiaBskyReaction>();
  for (const rawReaction of rawReactions) {
    const reaction = parseBskyReaction(rawReaction);
    if (!reaction) {
      continue;
    }

    const existing = grouped.get(reaction.value);
    if (existing) {
      existing.count += 1;
      existing.senderDids.push(reaction.senderDid);
      existing.createdAt = existing.createdAt ?? reaction.createdAt;
    } else {
      grouped.set(reaction.value, {
        value: reaction.value,
        count: 1,
        senderDids: [reaction.senderDid],
        createdAt: reaction.createdAt,
      });
    }
  }

  return Array.from(grouped.values());
}

function parseBskyMessage(raw: unknown): GaiaBskyMessage | undefined {
  const message = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof message.id === 'string' ? message.id : undefined;
  if (!id) {
    return undefined;
  }

  const sender = message.sender && typeof message.sender === 'object' ? (message.sender as Record<string, unknown>) : {};
  return {
    id,
    revision: typeof message.rev === 'string' ? message.rev : undefined,
    text: typeof message.text === 'string' ? message.text : '',
    sentAt: typeof message.sentAt === 'string' ? message.sentAt : '',
    senderDid: typeof sender.did === 'string' ? sender.did : 'unknown',
    reactions: groupBskyReactions(message.reactions),
  };
}

function parseBskyDeletedMessage(raw: unknown): GaiaBskyDeletedMessage | undefined {
  const message = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof message.id === 'string' ? message.id : undefined;
  if (!id) {
    return undefined;
  }

  const sender = message.sender && typeof message.sender === 'object' ? (message.sender as Record<string, unknown>) : {};
  return {
    id,
    revision: typeof message.rev === 'string' ? message.rev : undefined,
    sentAt: typeof message.sentAt === 'string' ? message.sentAt : '',
    senderDid: typeof sender.did === 'string' ? sender.did : 'unknown',
  };
}

function parseBskyConvo(raw: unknown): GaiaBskyConvo | undefined {
  const convo = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof convo.id === 'string' ? convo.id : undefined;
  if (!id) {
    return undefined;
  }

  const lastMessage = parseBskyMessage(convo.lastMessage);
  return {
    id,
    revision: typeof convo.rev === 'string' ? convo.rev : undefined,
    status: typeof convo.status === 'string' ? convo.status : undefined,
    muted: typeof convo.muted === 'boolean' ? convo.muted : undefined,
    unreadCount: typeof convo.unreadCount === 'number' ? convo.unreadCount : undefined,
    members: Array.isArray(convo.members) ? convo.members.map(parseBskyActor) : [],
    lastMessage,
  };
}

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(limit)));
}

async function bskyChatGet<T>(oauthSession: OAuthSession, method: string, params: URLSearchParams): Promise<T> {
  const query = params.toString();
  const response = await oauthSession.fetchHandler(`/xrpc/${method}${query ? `?${query}` : ''}`, {
    headers: {
      'atproto-proxy': BSKY_CHAT_PROXY,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    let message = `${method} failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function bskyAppViewGet<T>(oauthSession: OAuthSession, method: string, params: URLSearchParams): Promise<T> {
  const query = params.toString();
  const response = await oauthSession.fetchHandler(`/xrpc/${method}${query ? `?${query}` : ''}`, {
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    let message = `${method} failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function bskyChatPost<T>(oauthSession: OAuthSession, method: string, body: unknown): Promise<T> {
  const response = await oauthSession.fetchHandler(`/xrpc/${method}`, {
    method: 'POST',
    headers: {
      'atproto-proxy': BSKY_CHAT_PROXY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    let message = `${method} failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function listBskyConvos(request: GaiaBskyPageRequest): Promise<GaiaBskyConvoPage> {
  const oauthSession = await requireBskySession();
  const params = new URLSearchParams({
    limit: String(clampLimit(request.limit, 25, 100)),
  });
  if (request.cursor) {
    params.set('cursor', request.cursor);
  }

  const payload = await bskyChatGet<{ cursor?: string; convos?: unknown[] }>(
    oauthSession,
    'chat.bsky.convo.listConvos',
    params,
  );

  const convos = Array.isArray(payload.convos)
    ? payload.convos.map(parseBskyConvo).filter((convo): convo is GaiaBskyConvo => Boolean(convo))
    : [];

  return {
    cursor: typeof payload.cursor === 'string' ? payload.cursor : undefined,
    convos: await Promise.all(convos.map(cacheBskyConvoAvatars)),
  };
}

async function listBskyMessages(request: GaiaBskyMessagesRequest): Promise<GaiaBskyMessagePage> {
  const convoId = request.convoId.trim();
  if (!convoId) {
    throw new Error('Conversation id is required.');
  }

  const oauthSession = await requireBskySession();
  const params = new URLSearchParams({
    convoId,
    limit: String(clampLimit(request.limit, 50, 100)),
  });
  if (request.cursor) {
    params.set('cursor', request.cursor);
  }

  const payload = await bskyChatGet<{ cursor?: string; messages?: unknown[] }>(
    oauthSession,
    'chat.bsky.convo.getMessages',
    params,
  );

  return {
    cursor: typeof payload.cursor === 'string' ? payload.cursor : undefined,
    messages: Array.isArray(payload.messages)
      ? payload.messages.map(parseBskyMessage).filter((message): message is GaiaBskyMessage => Boolean(message))
      : [],
  };
}

async function searchBskyActors(request: GaiaBskyActorSearchRequest): Promise<GaiaBskyActor[]> {
  const query = request.query.trim().replace(/^@+/, '');
  if (!query) {
    return [];
  }

  const oauthSession = await requireBskySession();
  const params = new URLSearchParams({
    q: query,
    limit: String(clampLimit(request.limit, 8, 25)),
  });
  const payload = await bskyAppViewGet<{ actors?: unknown[] }>(
    oauthSession,
    'app.bsky.actor.searchActorsTypeahead',
    params,
  );
  const actors = Array.isArray(payload.actors) ? payload.actors.map(parseBskyActor) : [];
  return cacheBskyActorAvatars(actors);
}

async function getBskyConvoForMember(request: GaiaBskyConvoForMemberRequest): Promise<GaiaBskyConvo> {
  const memberDid = request.did.trim();
  if (!memberDid) {
    throw new Error('Choose a Bluesky account.');
  }

  const oauthSession = await requireBskySession();
  const params = new URLSearchParams();
  params.append('members', memberDid);
  const payload = await bskyChatGet<{ convo?: unknown }>(
    oauthSession,
    'chat.bsky.convo.getConvoForMembers',
    params,
  );
  const convo = parseBskyConvo(payload.convo);
  if (!convo) {
    throw new Error('Bluesky did not return a conversation.');
  }
  return cacheBskyConvoAvatars(convo);
}

async function sendBskyMessage(request: GaiaBskySendMessageRequest): Promise<GaiaBskyMessage> {
  const convoId = request.convoId.trim();
  const text = request.text.trim();
  if (!convoId || !text) {
    throw new Error('Conversation and message are required.');
  }

  const oauthSession = await requireBskySession();
  const payload = await bskyChatPost<unknown>(oauthSession, 'chat.bsky.convo.sendMessage', {
    convoId,
    message: {
      text,
    },
  });
  const message = parseBskyMessage(payload);
  if (!message) {
    throw new Error('Bluesky did not return the sent message.');
  }
  return message;
}

async function updateBskyRead(request: GaiaBskyReadRequest): Promise<GaiaBskyConvo> {
  const convoId = request.convoId.trim();
  if (!convoId) {
    throw new Error('Conversation is required.');
  }

  const oauthSession = await requireBskySession();
  const payload = await bskyChatPost<{ convo?: unknown }>(oauthSession, 'chat.bsky.convo.updateRead', {
    convoId,
    ...(request.messageId ? { messageId: request.messageId } : {}),
  });
  const convo = parseBskyConvo(payload.convo);
  if (!convo) {
    throw new Error('Bluesky did not return the updated conversation.');
  }
  return cacheBskyConvoAvatars(convo);
}

async function deleteBskyMessageForSelf(request: GaiaBskyMessageDeleteRequest): Promise<GaiaBskyDeletedMessage> {
  const convoId = request.convoId.trim();
  const messageId = request.messageId.trim();
  if (!convoId || !messageId) {
    throw new Error('Conversation and message are required.');
  }

  const oauthSession = await requireBskySession();
  const payload = await bskyChatPost<unknown>(oauthSession, 'chat.bsky.convo.deleteMessageForSelf', {
    convoId,
    messageId,
  });
  const deletedMessage = parseBskyDeletedMessage(payload);
  if (!deletedMessage) {
    throw new Error('Bluesky did not return the deleted message.');
  }
  return deletedMessage;
}

function parseGifResult(raw: unknown): GaiaGifResult | undefined {
  const result = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mediaFormats = result.media_formats && typeof result.media_formats === 'object'
    ? (result.media_formats as Record<string, unknown>)
    : {};
  const readFormat = (key: string): { url?: string } | undefined => {
    const format = mediaFormats[key];
    if (!format || typeof format !== 'object') {
      return undefined;
    }
    const url = (format as Record<string, unknown>).url;
    return typeof url === 'string' ? { url } : undefined;
  };

  const gif = readFormat('gif');
  const tinygif = readFormat('tinygif');
  const mp4 = readFormat('mp4');
  if (!gif && !tinygif && !mp4) {
    return undefined;
  }

  return {
    id: typeof result.id === 'string' ? result.id : undefined,
    contentDescription:
      typeof result.content_description === 'string' ? result.content_description : undefined,
    mediaFormats: {
      gif,
      tinygif,
      mp4,
    },
  };
}

async function searchCurrentGifs(request: GaiaGifSearchRequest): Promise<GaiaGifSearchResponse> {
  const query = request.query.trim();
  const serverUrl = request.serverUrl?.trim();
  if (!query || !serverUrl) {
    return {
      results: [],
    };
  }

  const baseUrl = normalizeServerUrl(serverUrl);
  const origin = serverOrigin(baseUrl);
  const params = new URLSearchParams({
    q: query,
    limit: String(clampLimit(request.limit, 9, 20)),
  });
  const cookieHeader = await currentCookieHeader(origin);
  const response = await fetch(`${origin}/api/v1/media/gifs/search?${params.toString()}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    let message = `GIF search failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: { message?: string }; message?: string };
      message = payload.error?.message ?? payload.message ?? message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    results?: unknown[];
    providerError?: { message?: string };
  };
  return {
    results: Array.isArray(payload.results)
      ? payload.results.map(parseGifResult).filter((result): result is GaiaGifResult => Boolean(result))
      : [],
    providerError: payload.providerError,
  };
}

async function currentCookieHeader(origin: string): Promise<string> {
  await ensureCurrentSessionCookie(origin);
  const cookies = await session.fromPartition(CURRENT_PARTITION).cookies.get({
    url: origin,
    name: 'current_session',
  });
  const sessionCookie = cookies[0]?.value;
  return sessionCookie ? `current_session=${encodeURIComponent(sessionCookie)}` : '';
}

async function fetchCurrentJson<T>(origin: string, path: string, cookieHeader: string): Promise<T | null> {
  const response = await fetch(`${origin}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

function currentGatewayUrl(origin: string, lastSeq: number): string {
  const url = new URL('/gateway', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('lastEventSeq', String(Math.max(0, Math.floor(lastSeq))));
  return url.toString();
}

function currentGatewayProtocols(sessionToken: string): string[] {
  return [
    CURRENT_GATEWAY_PROTOCOL,
    `${CURRENT_GATEWAY_TOKEN_PROTOCOL_PREFIX}${Buffer.from(sessionToken, 'utf8').toString('base64url')}`,
  ];
}

function currentWebSocketConstructor(): WebSocketLikeConstructor | null {
  const ctor = (globalThis as unknown as { WebSocket?: WebSocketLikeConstructor }).WebSocket;
  return typeof ctor === 'function' ? ctor : null;
}

function webSocketDataToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data ?? '');
}

function normalizeCurrentHandle(handle: string | undefined): string {
  return (handle ?? '').replace(/^@/, '').trim().toLowerCase();
}

function normalizeCurrentChannelNotificationLevel(value: unknown): CurrentChannelNotificationLevel {
  return value === 'all' || value === 'mentions' || value === 'nothing' || value === 'default'
    ? value
    : 'default';
}

function coerceCurrentChannelNotificationSetting(
  setting: CurrentChannelNotificationSettingPayload,
): CurrentChannelNotificationSettingPayload | null {
  if (
    !setting ||
    typeof setting.userId !== 'string' ||
    typeof setting.channelId !== 'string'
  ) {
    return null;
  }

  return {
    userId: setting.userId,
    channelId: setting.channelId,
    notificationLevel: normalizeCurrentChannelNotificationLevel(setting.notificationLevel),
    mutedUntil: typeof setting.mutedUntil === 'string' ? setting.mutedUntil : undefined,
    lastReadAt: typeof setting.lastReadAt === 'string' ? setting.lastReadAt : undefined,
    updatedAt: typeof setting.updatedAt === 'string' ? setting.updatedAt : undefined,
  };
}

function effectiveCurrentChannelNotificationLevel(
  setting: CurrentChannelNotificationSettingPayload | undefined,
): Exclude<CurrentChannelNotificationLevel, 'default'> {
  const level = normalizeCurrentChannelNotificationLevel(setting?.notificationLevel);
  return level === 'default' ? 'all' : level;
}

function isCurrentChannelMuted(setting: CurrentChannelNotificationSettingPayload | undefined): boolean {
  if (!setting?.mutedUntil) {
    return false;
  }
  const mutedUntil = Date.parse(setting.mutedUntil);
  return Number.isFinite(mutedUntil) && mutedUntil > Date.now();
}

function currentNotificationMentionsUser(
  content: string | undefined,
  notification: CurrentMessageNotificationPayload | undefined,
  currentUser: CurrentUserPayload | undefined,
): boolean {
  const userHandle = normalizeCurrentHandle(currentUser?.handle);
  if (!userHandle) {
    return false;
  }

  if (Array.isArray(notification?.mentionHandles)) {
    for (const handle of notification.mentionHandles) {
      if (normalizeCurrentHandle(handle) === userHandle) {
        return true;
      }
    }
  }

  if (!content) {
    return false;
  }

  const tokenPattern = /@[A-Za-z0-9._-]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content))) {
    if (normalizeCurrentHandle(match[0]) === userHandle) {
      return true;
    }
  }
  return false;
}

function currentMessagePreview(message: CurrentMessagePayload): string {
  const content = message.content?.replace(/\s+/g, ' ').trim();
  if (content) {
    return content.length > 120 ? `${content.slice(0, 117)}...` : content;
  }
  return 'Sent a message.';
}

function currentAuthorName(message: CurrentMessagePayload): string {
  return message.author?.displayName?.trim() || message.author?.handle?.trim() || message.authorId;
}

async function hydrateCurrentWatcher(watcher: CurrentNotificationWatcher): Promise<boolean> {
  const cookieHeader = await currentCookieHeader(watcher.origin);
  const sessionPayload = await fetchCurrentJson<CurrentSessionPayload>(watcher.origin, '/api/v1/auth/session', cookieHeader);
  if (!sessionPayload?.user || sessionPayload.access?.state === 'pending' || sessionPayload.access?.state === 'denied') {
    return false;
  }

  watcher.currentUser = sessionPayload.user;
  watcher.currentServer = sessionPayload.server;

  const channelPage = await fetchCurrentJson<CurrentPageResponse<CurrentChannelPayload>>(
    watcher.origin,
    '/api/v1/channels?limit=200',
    cookieHeader,
  );
  watcher.channels = new Map(
    (channelPage?.items ?? [])
      .filter((channel) => typeof channel.id === 'string' && typeof channel.name === 'string')
      .map((channel) => [channel.id, channel.name]),
  );

  const settingsPage = await fetchCurrentJson<CurrentChannelNotificationSettingsResponse>(
    watcher.origin,
    '/api/v1/notification-settings/channels',
    cookieHeader,
  );
  watcher.channelNotificationSettings = new Map(
    (settingsPage?.items ?? [])
      .map(coerceCurrentChannelNotificationSetting)
      .filter((setting): setting is CurrentChannelNotificationSettingPayload => Boolean(setting))
      .map((setting) => [setting.channelId, setting]),
  );
  await Promise.all(
    [...watcher.channelNotificationSettings.values()]
      .filter((setting) => typeof setting.lastReadAt === 'string')
      .map((setting) =>
        markCurrentChannelNotificationsRead({
          serverId: watcher.serverId,
          channelId: setting.channelId,
          readAt: setting.lastReadAt,
        }),
      ),
  );
  return true;
}

async function isCurrentReplyToUser(
  watcher: CurrentNotificationWatcher,
  message: CurrentMessagePayload,
  notification?: CurrentMessageNotificationPayload,
): Promise<boolean> {
  if (notification?.replyToUserId && watcher.currentUser?.id) {
    return notification.replyToUserId === watcher.currentUser.id;
  }

  if (!message.parentMessageId || !watcher.currentUser?.id) {
    return false;
  }

  try {
    const cookieHeader = await currentCookieHeader(watcher.origin);
    const parent = await fetchCurrentJson<CurrentMessagePayload>(
      watcher.origin,
      `/api/v1/messages/${encodeURIComponent(message.parentMessageId)}`,
      cookieHeader,
    );
    return parent?.authorId === watcher.currentUser.id;
  } catch {
    return false;
  }
}

function currentNotificationTitle(kind: GaiaNotificationKind, isMentionedReply: boolean): string {
  if (isMentionedReply) {
    return 'Mentioned you in a reply';
  }
  if (kind === 'current_reply') {
    return 'Replied to you';
  }
  if (kind === 'current_mention') {
    return 'Mentioned you';
  }
  return 'New message';
}

async function handleCurrentMessageCreate(
  watcher: CurrentNotificationWatcher,
  message: CurrentMessagePayload,
  notification?: CurrentMessageNotificationPayload,
  options: { showDesktop?: boolean; kind?: GaiaNotificationKind } = {},
): Promise<void> {
  const currentUser = watcher.currentUser;
  if (!currentUser || message.authorId === currentUser.id) {
    console.info('[gaia:notifications] Current message skipped', {
      server: watcher.serverName,
      messageId: message.id,
      reason: currentUser ? 'self' : 'missing-current-user',
      authorId: message.authorId,
      currentUserId: currentUser?.id,
    });
    return;
  }

  const mentioned = currentNotificationMentionsUser(message.content, notification, currentUser);
  const replyToUser = await isCurrentReplyToUser(watcher, message, notification);
  console.info('[gaia:notifications] Current message evaluated', {
    server: watcher.serverName,
    messageId: message.id,
    authorId: message.authorId,
    currentUserId: currentUser.id,
    currentUserHandle: currentUser.handle,
    contentLength: message.content?.length ?? 0,
    mentionHandles: notification?.mentionHandles ?? [],
    replyToUserId: notification?.replyToUserId,
    hasParent: Boolean(message.parentMessageId),
    mentioned,
    replyToUser,
  });

  const isMentionedReply = mentioned && replyToUser;
  const setting = watcher.channelNotificationSettings.get(message.channelId);
  if (isCurrentChannelMuted(setting)) {
    return;
  }

  const kind: GaiaNotificationKind = options.kind ??
    (mentioned ? 'current_mention' : replyToUser ? 'current_reply' : 'current_message');
  if (!options.kind) {
    const level = effectiveCurrentChannelNotificationLevel(setting);
    if (level === 'nothing') {
      return;
    }
    if (level === 'mentions' && !mentioned && !replyToUser) {
      return;
    }
  }

  const channelName = watcher.channels.get(message.channelId);
  const authorName = currentAuthorName(message);
  const title = currentNotificationTitle(kind, isMentionedReply);
  const channelCopy = channelName ? `#${channelName}` : 'Current';

  await addCurrentNotification({
    id: createId('ntf'),
    kind,
    serverId: watcher.serverId,
    serverName: watcher.currentServer?.name ?? watcher.serverName,
    serverUrl: watcher.serverUrl,
    channelId: message.channelId,
    channelName,
    messageId: message.id,
    authorId: message.authorId,
    authorName,
    authorHandle: message.author?.handle,
    authorAvatarUrl: message.author?.avatarUrl,
    title,
    body: `${authorName} in ${channelCopy}: ${currentMessagePreview(message)}`,
    createdAt: message.createdAt ?? nowIso(),
  }, options);
}

function sendCurrentGatewayAck(socket: WebSocketLike, envelope: CurrentGatewayEnvelope): void {
  if (typeof envelope.seq !== 'number' || !Number.isFinite(envelope.seq)) {
    return;
  }

  socket.send(
    JSON.stringify({
      id: `ack_${envelope.id ?? envelope.seq}`,
      type: 'ACK',
      payload: { seq: envelope.seq },
      sentAt: nowIso(),
    }),
  );
}

function finiteSeq(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function shouldShowDesktopNotificationForGatewayEvent(envelope: CurrentGatewayEnvelope): boolean {
  if (!envelope.sentAt) {
    return true;
  }

  const sentAt = Date.parse(envelope.sentAt);
  if (!Number.isFinite(sentAt)) {
    return true;
  }

  return Date.now() - sentAt <= CURRENT_NOTIFICATION_DESKTOP_MAX_AGE_MS;
}

async function fetchCurrentMissedNotifications(watcher: CurrentNotificationWatcher): Promise<void> {
  const cookieHeader = await currentCookieHeader(watcher.origin);
  let afterSeq = Math.max(0, Math.floor(watcher.lastSeq));

  for (let pageIndex = 0; pageIndex < 25 && !watcher.stopped; pageIndex += 1) {
    const path =
      `/api/v1/notifications/current?afterSeq=${encodeURIComponent(String(afterSeq))}` +
      `&limit=${CURRENT_NOTIFICATION_CATCH_UP_LIMIT}`;
    const page = await fetchCurrentJson<CurrentNotificationFeedPage>(watcher.origin, path, cookieHeader);
    if (!page) {
      return;
    }

    const items = [...(page.items ?? [])].sort((a, b) => (finiteSeq(a.seq) ?? 0) - (finiteSeq(b.seq) ?? 0));
    for (const item of items) {
      const seq = finiteSeq(item.seq);
      if (seq !== undefined) {
        watcher.lastSeq = Math.max(watcher.lastSeq, seq);
      }
      if (item.message?.id) {
        await handleCurrentMessageCreate(watcher, item.message, item.notification, {
          showDesktop: false,
          kind: item.kind,
        });
      }
    }

    const nextAfterSeq = finiteSeq(page.pageInfo?.nextAfterSeq);
    const latestSeq = finiteSeq(page.pageInfo?.latestSeq);
    if (page.pageInfo?.hasMore && nextAfterSeq !== undefined && nextAfterSeq > afterSeq) {
      watcher.lastSeq = Math.max(watcher.lastSeq, nextAfterSeq);
      afterSeq = nextAfterSeq;
      await recordCurrentLastSeq(watcher.serverId, watcher.lastSeq);
      continue;
    }

    if (latestSeq !== undefined) {
      watcher.lastSeq = Math.max(watcher.lastSeq, latestSeq);
    }
    await recordCurrentLastSeq(watcher.serverId, watcher.lastSeq);
    return;
  }

  await recordCurrentLastSeq(watcher.serverId, watcher.lastSeq);
}

async function handleCurrentGatewayEnvelope(
  watcher: CurrentNotificationWatcher,
  socket: WebSocketLike,
  envelope: CurrentGatewayEnvelope,
): Promise<void> {
  if (typeof envelope.seq === 'number' && Number.isFinite(envelope.seq)) {
    watcher.lastSeq = Math.max(watcher.lastSeq, envelope.seq);
    sendCurrentGatewayAck(socket, envelope);
    void recordCurrentLastSeq(watcher.serverId, watcher.lastSeq).catch(() => undefined);
  }

  if (envelope.type === 'READY') {
    if (!watcher.currentUser) {
      void hydrateCurrentWatcher(watcher).catch(() => undefined);
    }
    return;
  }

  if (envelope.type === 'NOTIFICATION_UPDATE' && envelope.payload && typeof envelope.payload === 'object') {
    const payload = envelope.payload as CurrentNotificationUpdatePayload;
    if (!payload.channelId || !payload.userId || payload.userId !== watcher.currentUser?.id) {
      return;
    }
    const setting = payload.settings ? coerceCurrentChannelNotificationSetting(payload.settings) : null;
    if (setting) {
      watcher.channelNotificationSettings.set(setting.channelId, setting);
    }
    if (payload.action === 'channel_read') {
      await markCurrentChannelNotificationsRead({
        serverId: watcher.serverId,
        channelId: payload.channelId,
        readAt: payload.readAt ?? setting?.lastReadAt,
      });
    }
    return;
  }

  if (envelope.type !== 'MESSAGE_CREATE' || !envelope.payload || typeof envelope.payload !== 'object') {
    return;
  }

  const payload = envelope.payload as CurrentMessageCreatePayload;
  if (!payload.message || typeof payload.message.id !== 'string') {
    return;
  }

  await handleCurrentMessageCreate(watcher, payload.message, payload.notification, {
    showDesktop: shouldShowDesktopNotificationForGatewayEvent(envelope),
  });
}

function scheduleCurrentNotificationReconnect(watcher: CurrentNotificationWatcher): void {
  if (watcher.stopped || watcher.reconnectTimer) {
    return;
  }
  watcher.reconnectTimer = setTimeout(() => {
    watcher.reconnectTimer = undefined;
    void connectCurrentNotificationWatcher(watcher);
  }, CURRENT_NOTIFICATION_RECONNECT_MS);
}

async function connectCurrentNotificationWatcher(watcher: CurrentNotificationWatcher): Promise<void> {
  if (watcher.stopped || watcher.connecting) {
    return;
  }

  const WebSocketCtor = currentWebSocketConstructor();
  if (!WebSocketCtor) {
    console.warn('[gaia:notifications] Current gateway notifications unavailable: WebSocket missing in main process.');
    return;
  }

  watcher.connecting = true;
  try {
    const hydrated = await hydrateCurrentWatcher(watcher);
    if (!hydrated || watcher.stopped) {
      return;
    }

    await fetchCurrentMissedNotifications(watcher);
    if (watcher.stopped) {
      return;
    }

    const socket = new WebSocketCtor(
      currentGatewayUrl(watcher.origin, watcher.lastSeq),
      currentGatewayProtocols(watcher.sessionToken),
    );
    watcher.socket = socket;
    socket.addEventListener('open', () => {
      watcher.connecting = false;
      console.info(`[gaia:notifications] Current watcher online server=${watcher.serverName} origin=${watcher.origin}`);
    });
    socket.addEventListener('message', (event) => {
      try {
        const envelope = JSON.parse(webSocketDataToString(event.data)) as CurrentGatewayEnvelope;
        void handleCurrentGatewayEnvelope(watcher, socket, envelope).catch((error) => {
          console.warn('[gaia:notifications] Failed to process Current gateway event.', error);
        });
      } catch (error) {
        console.warn('[gaia:notifications] Failed to parse Current gateway event.', error);
      }
    });
    socket.addEventListener('close', (event) => {
      watcher.connecting = false;
      watcher.socket = undefined;
      if (!watcher.stopped) {
        console.info(
          `[gaia:notifications] Current watcher closed server=${watcher.serverName} code=${event.code ?? 0} reason=${event.reason ?? ''}`,
        );
        scheduleCurrentNotificationReconnect(watcher);
      }
    });
    socket.addEventListener('error', (error) => {
      console.warn(`[gaia:notifications] Current watcher error server=${watcher.serverName}.`, error);
    });
  } catch (error) {
    console.warn(`[gaia:notifications] Current watcher failed server=${watcher.serverName}.`, error);
    scheduleCurrentNotificationReconnect(watcher);
  } finally {
    watcher.connecting = false;
  }
}

function stopCurrentNotificationWatcher(watcher: CurrentNotificationWatcher): void {
  watcher.stopped = true;
  if (watcher.reconnectTimer) {
    clearTimeout(watcher.reconnectTimer);
    watcher.reconnectTimer = undefined;
  }
  try {
    watcher.socket?.close(1000, 'Stopped');
  } catch {
    // Ignore close errors while tearing down the watcher.
  }
  watcher.socket = undefined;
}

async function syncCurrentNotificationWatchers(): Promise<void> {
  const [store, currentSessions, notifications] = await Promise.all([
    readStore(),
    readCurrentSessionStore(),
    readNotificationStore(),
  ]);
  const desiredIds = new Set<string>();

  for (const server of store.servers) {
    let origin: string;
    try {
      origin = serverOrigin(normalizeServerUrl(server.url));
    } catch {
      continue;
    }

    const sessionToken = currentSessions.sessions[origin]?.sessionToken;
    if (!sessionToken) {
      continue;
    }

    desiredIds.add(server.id);
    const existing = currentNotificationWatchers.get(server.id);
    if (existing && existing.origin === origin && existing.sessionToken === sessionToken) {
      existing.serverName = server.name;
      existing.serverUrl = server.url;
      continue;
    }

    if (existing) {
      stopCurrentNotificationWatcher(existing);
    }

    const watcher: CurrentNotificationWatcher = {
      serverId: server.id,
      serverName: server.name,
      serverUrl: server.url,
      origin,
      sessionToken,
      lastSeq: notifications.currentLastSeqByServerId[server.id] ?? 0,
      channels: new Map(),
      channelNotificationSettings: new Map(),
      stopped: false,
      connecting: false,
    };
    currentNotificationWatchers.set(server.id, watcher);
    void connectCurrentNotificationWatcher(watcher);
  }

  for (const [serverId, watcher] of currentNotificationWatchers) {
    if (!desiredIds.has(serverId)) {
      stopCurrentNotificationWatcher(watcher);
      currentNotificationWatchers.delete(serverId);
    }
  }
}

async function probeCurrentServerSession(serverUrl: string): Promise<GaiaServerProbe> {
  try {
    const origin = serverOrigin(normalizeServerUrl(serverUrl));
    const cookieHeader = await currentCookieHeader(origin);
    const response = await fetch(`${origin}/api/v1/auth/session`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(3_000),
    });
    if (cookieHeader && (response.status === 401 || response.status === 403)) {
      await session.fromPartition(CURRENT_PARTITION).cookies.remove(origin, 'current_session').catch(() => undefined);
      await forgetCurrentSession(origin);
      void syncCurrentNotificationWatchers().catch(() => undefined);
    }
    return {
      reachable: response.status === 200 || response.status === 401 || response.status === 403,
      authenticated: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      reachable: false,
      authenticated: false,
      message: error instanceof Error ? error.message : 'Server did not respond.',
    };
  }
}

function rememberCurrentBackgroundCache(key: string, value: string): string {
  if (!currentBackgroundCache.has(key) && currentBackgroundCache.size >= 6) {
    const [oldestKey] = currentBackgroundCache.keys();
    if (oldestKey) {
      currentBackgroundCache.delete(oldestKey);
    }
  }
  currentBackgroundCache.set(key, value);
  return value;
}

async function fetchCurrentImageDataUrl(input: {
  absoluteUrl: string;
  cookieHeader: string;
}): Promise<string | undefined> {
  const cached = currentBackgroundCache.get(input.absoluteUrl);
  if (cached) {
    return cached;
  }

  const response = await fetch(input.absoluteUrl, {
    headers: input.cookieHeader ? { cookie: input.cookieHeader } : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    return undefined;
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CURRENT_IMAGE_BYTES) {
    return undefined;
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!contentType.startsWith('image/')) {
    return undefined;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_CURRENT_IMAGE_BYTES) {
    return undefined;
  }
  return rememberCurrentBackgroundCache(
    input.absoluteUrl,
    `data:${contentType};base64,${bytes.toString('base64')}`,
  );
}

async function getCurrentAppearance(serverUrl: string): Promise<GaiaCurrentAppearance> {
  const origin = serverOrigin(normalizeServerUrl(serverUrl));
  const cookieHeader = await currentCookieHeader(origin);
  const response = await fetch(`${origin}/api/v1/server`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    return {};
  }

  const payload = (await response.json()) as {
    server?: {
      name?: unknown;
      iconUrl?: unknown;
      appearance?: {
        background?: {
          url?: unknown;
          mimeType?: unknown;
        };
      };
    };
  };
  const serverName = typeof payload.server?.name === 'string' && payload.server.name.trim().length > 0
    ? payload.server.name.trim()
    : undefined;
  const iconUrl = typeof payload.server?.iconUrl === 'string' && payload.server.iconUrl
    ? sameOriginHttpResourceUrl(payload.server.iconUrl, origin)
    : undefined;
  const background = payload.server?.appearance?.background;
  const backgroundUrl = background?.url;
  const backgroundMimeType = typeof background?.mimeType === 'string' ? background.mimeType : undefined;
  const serverIconUrl = iconUrl
    ? await fetchCurrentImageDataUrl({
        absoluteUrl: iconUrl,
        cookieHeader,
      })
    : undefined;

  if (typeof backgroundUrl !== 'string' || !backgroundUrl) {
    return {
      serverName,
      serverIconUrl,
    };
  }

  const absoluteUrl = sameOriginHttpResourceUrl(backgroundUrl, origin);
  if (!absoluteUrl) {
    return {
      serverName,
      serverIconUrl,
    };
  }

  return {
    serverName,
    serverIconUrl,
    backgroundMimeType,
    backgroundUrl: await fetchCurrentImageDataUrl({
      absoluteUrl,
      cookieHeader,
    }),
  };
}

async function toggleBskyReaction(request: GaiaBskyReactionRequest): Promise<GaiaBskyMessage> {
  const convoId = request.convoId.trim();
  const messageId = request.messageId.trim();
  const value = request.value.trim();
  if (!convoId || !messageId || !value) {
    throw new Error('Conversation, message, and reaction are required.');
  }

  const oauthSession = await requireBskySession();
  const payload = await bskyChatPost<{ message?: unknown }>(
    oauthSession,
    request.remove ? 'chat.bsky.convo.removeReaction' : 'chat.bsky.convo.addReaction',
    {
      convoId,
      messageId,
      value,
    },
  );
  const message = parseBskyMessage(payload.message);
  if (!message) {
    throw new Error('Bluesky did not return the updated message.');
  }
  return message;
}

async function startCurrentOAuth(request: GaiaOAuthStartRequest): Promise<GaiaOAuthStartResponse> {
  const baseUrl = normalizeServerUrl(request.serverUrl);
  const origin = serverOrigin(baseUrl);
  const port = await ensureCallbackServer();
  const authId = createId('auth');
  const returnToUrl = new URL(AUTH_CALLBACK_PATH, `http://127.0.0.1:${port}`);
  returnToUrl.searchParams.set('authId', authId);
  pendingAuth.set(authId, {
    id: authId,
    serverUrl: baseUrl,
    origin,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    handle: normalizeAtprotoIdentity(request.handle ?? DEFAULT_AUTH_HANDLE),
    returnTo: returnToUrl.toString(),
  });
  const response = await fetch(`${origin}/api/v1/auth/oauth/start?${params.toString()}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    pendingAuth.delete(authId);
    let message = `OAuth start failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message ?? message;
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as Omit<GaiaOAuthStartResponse, 'authId' | 'openedExternal' | 'returnToUrl'>;
  const authorizationUrl = payload.authorizationUrl ?? payload.lanHandoff?.hostAuthUrl;
  if (!authorizationUrl) {
    pendingAuth.delete(authId);
    throw new Error('Current did not return an OAuth URL.');
  }

  await openSafeExternalUrl(authorizationUrl);

  return {
    authId,
    returnToUrl: returnToUrl.toString(),
    openedExternal: true,
    authorizationUrl: payload.authorizationUrl,
    lanHandoff: payload.lanHandoff,
  };
}

async function authenticateCurrentServerWithClient(serverUrl: string): Promise<GaiaServerClientAuthResult> {
  const probe = await probeCurrentServerSession(serverUrl);
  if (probe.authenticated) {
    return {
      ok: true,
      message: 'Using cached Current session.',
    };
  }

  const oauthSession = await requireBskySession();
  const profile = await fetchBskyProfile(oauthSession);

  try {
    await exchangeLauncherSession({
      origin: serverOrigin(normalizeServerUrl(serverUrl)),
      oauthSession,
      profile,
    });
    return {
      ok: true,
      message: 'Signed into Current with your Gaia Launcher session.',
    };
  } catch (error) {
    if (!(error instanceof LauncherSessionExchangeUnsupportedError)) {
      throw error;
    }
  }

  const handle = profile.handle ?? profile.did;

  // Older Current servers do not have the launcher token endpoint yet, so keep
  // the browser flow as a compatibility fallback.
  const oauth = await startCurrentOAuth({
    serverUrl,
    handle,
  });

  return {
    ok: false,
    message: 'Opened the server sign-in flow with your Gaia ATProto identity.',
    oauth,
  };
}

async function handleBskyCallback(request: IncomingMessage, reply: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${callbackPort ?? 0}`);
  try {
    const client = await getBskyOAuthClient();
    const { session: oauthSession } = await client.callback(requestUrl.searchParams, {
      redirect_uri: bskyCallbackUrl(),
    });
    await mutateBskyAuthStore((store) => ({
      ...store,
      activeDid: oauthSession.did,
    }));
    const profile = await fetchBskyProfile(oauthSession);
    await setLauncherIdentityFromProfile(profile);
    sendClientAuthResult({
      ok: true,
      message: 'Signed in.',
      profile,
    });
    sendHtml(
      reply,
      200,
      buildAuthReturnPage({
        ok: true,
        title: 'You are signed in',
        message: 'Gaia Launcher has received your ATProto session.',
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gaia could not finish ATProto sign-in.';
    sendClientAuthResult({
      ok: false,
      message,
    });
    sendHtml(
      reply,
      500,
      buildAuthReturnPage({
        ok: false,
        title: 'ATProto sign-in failed',
        message,
      }),
    );
  }
}

async function handleAuthCallback(request: IncomingMessage, reply: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${callbackPort ?? 0}`);
  if (requestUrl.pathname === BSKY_CALLBACK_PATH) {
    await handleBskyCallback(request, reply);
    return;
  }

  if (requestUrl.pathname !== AUTH_CALLBACK_PATH) {
    sendHtml(
      reply,
      404,
      buildAuthReturnPage({
        ok: false,
        title: 'Gaia callback not found',
        message: 'This local Gaia Launcher callback URL is not active.',
      }),
    );
    return;
  }

  const authId = requestUrl.searchParams.get('authId') ?? '';
  const ticket = requestUrl.searchParams.get('current_auth_ticket') ?? '';
  const pending = pendingAuth.get(authId);
  if (!pending || Date.now() - pending.createdAt > AUTH_TIMEOUT_MS) {
    pendingAuth.delete(authId);
    sendHtml(
      reply,
      410,
      buildAuthReturnPage({
        ok: false,
        title: 'Sign-in expired',
        message: 'Return to Gaia Launcher and start sign-in again.',
      }),
    );
    return;
  }

  if (!ticket) {
    pendingAuth.delete(authId);
    sendAuthResult({
      authId,
      serverUrl: pending.serverUrl,
      ok: false,
      message: 'Current did not return an auth ticket.',
    });
    sendHtml(
      reply,
      400,
      buildAuthReturnPage({
        ok: false,
        title: 'Sign-in failed',
        message: 'Current did not return the auth ticket Gaia needs.',
      }),
    );
    return;
  }

  try {
    await exchangeAuthTicket({
      origin: pending.origin,
      ticket,
    });
    pendingAuth.delete(authId);
    sendAuthResult({
      authId,
      serverUrl: pending.serverUrl,
      ok: true,
      message: 'Signed in successfully.',
    });
    sendHtml(
      reply,
      200,
      buildAuthReturnPage({
        ok: true,
        title: 'You are signed in',
        message: 'Gaia Launcher has received your Current session and is loading the server.',
      }),
    );
  } catch (error) {
    pendingAuth.delete(authId);
    const message = error instanceof Error ? error.message : 'Gaia could not finish sign-in.';
    sendAuthResult({
      authId,
      serverUrl: pending.serverUrl,
      ok: false,
      message,
    });
    sendHtml(
      reply,
      500,
      buildAuthReturnPage({
        ok: false,
        title: 'Sign-in failed',
        message,
      }),
    );
  }
}

async function ensureCallbackServer(): Promise<number> {
  if (callbackServer && callbackPort) {
    return callbackPort;
  }

  callbackServer = createServer((request, reply) => {
    void handleAuthCallback(request, reply).catch((error) => {
      sendHtml(
        reply,
        500,
        buildAuthReturnPage({
          ok: false,
          title: 'Gaia callback failed',
          message: error instanceof Error ? error.message : 'Unexpected callback failure.',
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    if (!callbackServer) {
      reject(new Error('Could not create Gaia auth callback server.'));
      return;
    }

    let retriedWithRandomPort = false;
    const onError = (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && !retriedWithRandomPort) {
        retriedWithRandomPort = true;
        callbackServer?.once('error', onError);
        callbackServer?.listen(0, '127.0.0.1');
        return;
      }
      callbackServer?.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      callbackServer?.off('error', onError);
      resolve();
    };

    callbackServer.once('error', onError);
    callbackServer.once('listening', onListening);
    callbackServer.listen(DEFAULT_CALLBACK_PORT, '127.0.0.1');
  });

  const address = callbackServer.address() as AddressInfo | null;
  if (!address?.port) {
    throw new Error('Could not start Gaia auth callback server.');
  }
  callbackPort = address.port;
  return callbackPort;
}

function configureCurrentPartition(): void {
  const currentSession = session.fromPartition(CURRENT_PARTITION);
  currentSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'speaker-selection', 'display-capture'].includes(permission));
  });
  configureDisplayCapture(currentSession, 'current');
}

function configureLauncherSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'speaker-selection'].includes(permission));
  });
}

function registerIpc(): void {
  handleIpc('gaia:store:get', 'launcher', () => readStore());
  handleIpc('gaia:appearance-mode:get', 'launcher-or-current-webview', async () =>
    resolveAppearanceMode((await readStore()).settings),
  );
  handleIpc('gaia:sound-settings:get', 'launcher-or-current-webview', async () => (await readStore()).settings.sound);
  handleIpc('gaia:video-settings:get', 'launcher-or-current-webview', async () => (await readStore()).settings.video);
  handleIpc('gaia:visual-effects-settings:get', 'launcher-or-current-webview', async () =>
    visualEffectsSettings((await readStore()).settings),
  );

  handleIpc('gaia:servers:add', 'launcher', async (_event, input: GaiaServerInput) => {
    const server = toServer(input);
    const nextStore = await mutateStore((store) => ({
      ...store,
      selectedServerId: server.id,
      servers: [...store.servers, server],
    }));
    void syncCurrentNotificationWatchers().catch(() => undefined);
    return nextStore;
  });

  handleIpc('gaia:servers:update', 'launcher', async (_event, serverId: string, input: GaiaServerInput) => {
    const nextStore = await mutateStore((store) => {
      const updatedAt = nowIso();
      return {
        ...store,
        servers: store.servers.map((server) =>
          server.id === serverId
            ? {
                ...server,
                name: input.name?.trim() || new URL(normalizeServerUrl(input.url)).host,
                url: normalizeServerUrl(input.url),
                updatedAt,
              }
            : server,
        ),
      };
    });
    void syncCurrentNotificationWatchers().catch(() => undefined);
    return nextStore;
  });

  handleIpc('gaia:servers:remove', 'launcher', async (_event, serverId: string) => {
    const nextStore = await mutateStore((store) => {
      const servers = store.servers.filter((server) => server.id !== serverId);
      return {
        ...store,
        selectedServerId:
          store.selectedServerId === serverId ? servers[0]?.id : store.selectedServerId,
        servers,
      };
    });
    void syncCurrentNotificationWatchers().catch(() => undefined);
    return nextStore;
  });

  handleIpc('gaia:servers:select', 'launcher', async (_event, serverId: string) => {
    return mutateStore((store) => ({
      ...store,
      selectedServerId: store.servers.some((server) => server.id === serverId)
        ? serverId
        : store.selectedServerId,
    }));
  });

  handleIpc('gaia:identity:set', 'launcher', async (_event, identity: GaiaIdentity | null) => {
    return mutateStore((store) => ({
      ...store,
      identity:
        identity && identity.handle.trim().length > 0
          ? {
              handle: normalizeAtprotoIdentity(identity.handle),
              updatedAt: nowIso(),
            }
          : null,
    }));
  });

  handleIpc('gaia:settings:update', 'launcher', async (_event, patch: GaiaSettingsPatch) => {
    const nextStore = await mutateStore((store) => ({
      ...store,
      settings: coerceSettings({
        ...store.settings,
        ...(patch && typeof patch === 'object' ? patch : {}),
      }),
    }));
    broadcastCurrentAppearanceMode(nextStore.settings);
    broadcastCurrentSoundSettings(nextStore.settings);
    broadcastCurrentVideoSettings(nextStore.settings);
    broadcastCurrentVisualEffectsSettings(nextStore.settings);
    return nextStore;
  });

  handleIpc('gaia:oauth:start', 'launcher', async (_event, request: GaiaOAuthStartRequest): Promise<GaiaOAuthStartResponse> => {
    return startCurrentOAuth(request);
  });

  handleIpc(
    'gaia:client-auth:start',
    'launcher',
    async (_event, request: GaiaClientAuthStartRequest): Promise<GaiaClientAuthStartResponse> => {
      return startBskyClientAuth(request);
    },
  );

  handleIpc('gaia:client-auth:status', 'launcher', async (): Promise<GaiaClientAuthStatus> => {
    return getBskyAuthStatus();
  });

  handleIpc('gaia:client-auth:logout', 'launcher', async (): Promise<{ ok: boolean; message: string }> => {
    return signOutBskyClient();
  });

  handleIpc('gaia:server:client-auth', 'launcher', async (_event, serverUrl: string): Promise<GaiaServerClientAuthResult> => {
    return authenticateCurrentServerWithClient(serverUrl);
  });

  handleIpc('gaia:bsky:convos:list', 'launcher', async (_event, request: GaiaBskyPageRequest): Promise<GaiaBskyConvoPage> => {
    return listBskyConvos(request);
  });

  handleIpc(
    'gaia:bsky:messages:list',
    'launcher',
    async (_event, request: GaiaBskyMessagesRequest): Promise<GaiaBskyMessagePage> => {
      return listBskyMessages(request);
    },
  );

  handleIpc('gaia:bsky:actors:search', 'launcher', async (_event, request: GaiaBskyActorSearchRequest) => {
    return searchBskyActors(request);
  });

  handleIpc(
    'gaia:bsky:convo:for-member',
    'launcher',
    async (_event, request: GaiaBskyConvoForMemberRequest): Promise<GaiaBskyConvo> => {
      return getBskyConvoForMember(request);
    },
  );

  handleIpc(
    'gaia:bsky:reaction:toggle',
    'launcher',
    async (_event, request: GaiaBskyReactionRequest): Promise<GaiaBskyMessage> => {
      return toggleBskyReaction(request);
    },
  );

  handleIpc(
    'gaia:bsky:message:send',
    'launcher',
    async (_event, request: GaiaBskySendMessageRequest): Promise<GaiaBskyMessage> => {
      return sendBskyMessage(request);
    },
  );

  handleIpc(
    'gaia:bsky:message:delete-for-self',
    'launcher',
    async (_event, request: GaiaBskyMessageDeleteRequest): Promise<GaiaBskyDeletedMessage> => {
      return deleteBskyMessageForSelf(request);
    },
  );

  handleIpc(
    'gaia:bsky:read:update',
    'launcher',
    async (_event, request: GaiaBskyReadRequest): Promise<GaiaBskyConvo> => {
      return updateBskyRead(request);
    },
  );

  handleIpc(
    'gaia:current:gifs:search',
    'launcher',
    async (_event, request: GaiaGifSearchRequest): Promise<GaiaGifSearchResponse> => {
      return searchCurrentGifs(request);
    },
  );

  handleIpc('gaia:current:pick-color-at-point', 'current-webview', async (event, point: ColorPickPoint): Promise<string | null> => {
    return captureColorAtPoint(event.sender, point);
  });

  handleIpc('gaia:current:appearance', 'launcher', async (_event, serverUrl: string): Promise<GaiaCurrentAppearance> => {
    return getCurrentAppearance(serverUrl);
  });

  handleIpc('gaia:notifications:get', 'launcher', async (): Promise<GaiaNotificationCenterState> => {
    return toNotificationCenterState(await readNotificationStore());
  });

  handleIpc(
    'gaia:notifications:mark-read',
    'launcher',
    async (_event, notificationIds?: string[]): Promise<GaiaNotificationCenterState> => {
      return markNotificationsRead(Array.isArray(notificationIds) ? notificationIds : undefined);
    },
  );

  handleIpc('gaia:notifications:clear', 'launcher', async (): Promise<GaiaNotificationCenterState> => {
    return clearNotifications();
  });

  handleIpc('gaia:server:probe', 'launcher', async (_event, serverUrl: string): Promise<GaiaServerProbe> => {
    return probeCurrentServerSession(serverUrl);
  });

  handleIpc('gaia:server:logout', 'launcher', async (_event, serverUrl: string) => logoutCurrentServer(serverUrl));

  handleIpc('gaia:open-external', 'launcher', async (_event, url: string) => {
    await openSafeExternalUrl(url);
  });

  handleIpc('gaia:updates:get', 'launcher', async (): Promise<GaiaUpdateState> => {
    return getGaiaUpdateState();
  });

  handleIpc('gaia:updates:check', 'launcher', async (): Promise<GaiaUpdateState> => {
    return checkGaiaUpdates();
  });

  handleIpc('gaia:updates:download', 'launcher', async (): Promise<GaiaUpdateState> => {
    return downloadGaiaUpdate();
  });

  handleIpc('gaia:updates:install', 'launcher', async (): Promise<GaiaUpdateState> => {
    return installGaiaUpdate();
  });

  handleIpc('gaia:updates:open-downloads', 'launcher', async (): Promise<GaiaUpdateState> => {
    return openGaiaUpdateDownloads();
  });
}

function createWindow(): void {
  const icon = gaiaAppIconImage();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 660,
    title: 'Gaia Launcher',
    ...(icon ? { icon } : {}),
    backgroundColor: '#18191c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  if (icon && process.platform !== 'darwin') {
    mainWindow.setIcon(icon);
  }

  mainWindow.webContents.backgroundThrottling = false;
  setUpdaterWebContents(mainWindow.webContents);
  attachConsoleForwarding('launcher', mainWindow.webContents);
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!canAttachCurrentWebviewSource(params.src)) {
      event.preventDefault();
      console.warn(`[gaia:current-webview] blocked unsafe attach src=${params.src ?? 'unknown src'}`);
      return;
    }
    webPreferences.backgroundThrottling = false;
    webPreferences.preload = join(__dirname, 'current-webview-preload.cjs');
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    console.info(`[gaia:current-webview] will attach ${params.src ?? 'unknown src'}`);
  });
  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    currentWebviewContents.add(webContents);
    webContents.backgroundThrottling = false;
    console.info(`[gaia:current-webview] attached id=${webContents.id} url=${webContents.getURL()}`);
    attachConsoleForwarding('current-webview', webContents);
    installCurrentWebviewRuntimeHints(webContents);
    webContents.on('dom-ready', () => {
      console.info(`[gaia:current-webview] dom-ready id=${webContents.id} url=${webContents.getURL()}`);
      installCurrentWebviewRuntimeHints(webContents);
    });
    webContents.on('will-navigate', (_navigationEvent, url) => {
      console.info(`[gaia:current-webview] will-navigate id=${webContents.id} from=${webContents.getURL()} to=${url}`);
    });
    webContents.on('did-start-navigation', (_navigationEvent, url, isInPlace, isMainFrame) => {
      console.info(
        `[gaia:current-webview] did-start-navigation id=${webContents.id} main=${isMainFrame} inPlace=${isInPlace} from=${webContents.getURL()} to=${url}`,
      );
    });
    webContents.on('did-navigate', (_navigationEvent, url, httpResponseCode, httpStatusText) => {
      console.info(
        `[gaia:current-webview] did-navigate id=${webContents.id} status=${httpResponseCode} ${httpStatusText} url=${url}`,
      );
    });
    webContents.on('did-finish-load', () => {
      console.info(`[gaia:current-webview] did-finish-load id=${webContents.id} url=${webContents.getURL()}`);
      installCurrentWebviewRuntimeHints(webContents);
    });
    webContents.on('did-fail-load', (_loadEvent, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.warn(
        `[gaia:current-webview] did-fail-load id=${webContents.id} main=${isMainFrame} code=${errorCode} description=${errorDescription} url=${validatedURL}`,
      );
    });
    webContents.on('media-started-playing', () => {
      console.info(`[gaia:current-webview:media] started id=${webContents.id} url=${webContents.getURL()}`);
    });
    webContents.on('media-paused', () => {
      console.info(`[gaia:current-webview:media] paused id=${webContents.id} url=${webContents.getURL()}`);
    });
    webContents.on('render-process-gone', (_goneEvent, details) => {
      console.warn(
        `[gaia:current-webview] render-process-gone id=${webContents.id} reason=${details.reason} exitCode=${details.exitCode}`,
      );
    });
    webContents.once('destroyed', () => {
      console.info(`[gaia:current-webview] destroyed id=${webContents.id}`);
      currentWebviewContents.delete(webContents);
    });
    void readStore()
      .then((store) => {
        sendCurrentAppearanceMode(webContents, resolveAppearanceMode(store.settings));
        sendCurrentSoundSettings(webContents, store.settings.sound);
        sendCurrentVideoSettings(webContents, store.settings.video);
        sendCurrentVisualEffectsSettings(webContents, visualEffectsSettings(store.settings));
      })
      .catch(() => undefined);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openSafeExternalUrl(url).catch((error) => {
      console.warn('[gaia:security] Blocked unsafe external URL.', error);
    });
    return { action: 'deny' };
  });

  if (process.env.GAIA_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.GAIA_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadURL(pathToFileURL(join(__dirname, '../renderer/index.html')).toString());
  }
}

app.whenReady().then(() => {
  void logPerformanceDiagnostics();
  configureAppIdentity();
  configureLauncherSession();
  configureCurrentPartition();
  configureGaiaUpdater();
  registerIpc();
  createWindow();
  startGaiaWebsiteUsageHeartbeat();
  void syncCurrentNotificationWatchers();
  void notifyNotificationCenterChanged().catch(() => undefined);

  nativeTheme.on('updated', () => {
    void broadcastAutoCurrentAppearanceMode().catch(() => undefined);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void openSafeExternalUrl(url).catch((error) => {
      console.warn('[gaia:security] Blocked unsafe external URL.', error);
    });
    return { action: 'deny' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopGaiaWebsiteUsageHeartbeat();
  for (const watcher of currentNotificationWatchers.values()) {
    stopCurrentNotificationWatcher(watcher);
  }
  currentNotificationWatchers.clear();
  callbackServer?.close();
  callbackServer = null;
  callbackPort = null;
});
