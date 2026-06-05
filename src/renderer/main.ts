import type {
  GaiaAuthResult,
  GaiaAppearanceMode,
  GaiaBskyActor,
  GaiaBskyConvo,
  GaiaBskyConvoPage,
  GaiaBskyMessage,
  GaiaBskyMessagePage,
  GaiaBskyProfile,
  GaiaClientAuthResult,
  GaiaClientAuthStatus,
  GaiaCurrentAppearance,
  GaiaGifResult,
  GaiaNotification,
  GaiaNotificationCenterState,
  GaiaOAuthStartResponse,
  GaiaP2PVoiceIceConfig,
  GaiaP2PVoiceSettings,
  GaiaP2PVoiceSignalMessage,
  GaiaServer,
  GaiaServerNotificationLevel,
  GaiaServerNotificationSetting,
  GaiaServerProbe,
  GaiaSettings,
  GaiaSettingsPatch,
  GaiaSpotifyStatus,
  GaiaPushToTalkMode,
  GaiaSoundSettings,
  GaiaStore,
  GaiaUpdateState,
  GaiaVideoSettings,
} from '../shared';
import {
  BskyDmP2PVoiceSignalingTransport,
  decodeBskyVoiceSignalPayload,
  formatP2PVoiceSignalBundle,
  ManualP2PVoiceSignalingTransport,
  parseP2PVoiceSignalText,
  P2PVoiceCallService,
  P2P_VOICE_DIRECT_FAILURE_MESSAGE,
  type P2PVoiceSignalSource,
  type P2PVoiceSignalingTransport,
  type P2PVoiceState,
} from './p2p-voice';
import { createElement, type CSSProperties } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import LiquidGlass from 'liquid-glass-react';
import * as THREE from 'three';
import type { EmojiEntry } from './emoji-catalog';
import {
  buildEmojiToneIndex,
  getEmojiToneGroupForEntry,
  getPreferredEmojiForEntry,
  shouldShowEmojiEntry,
  type EmojiToneGroup,
  type EmojiToneIndex,
  type EmojiToneVariant,
} from './emoji-skin-tones';
import './styles.css';

const GAIA_LOGO_URL = new URL('../assets/logo_grayscale.svg', import.meta.url).href;
const GAIA_GLOBE_URL = new URL('../assets/globe.png', import.meta.url).href;
const GAIA_GLOBE_LIGHT_URL = new URL('../assets/globe_light.png', import.meta.url).href;
const GAIA_NOTIFICATION_TEST_URL = new URL('../assets/audio/message/notification.mp3', import.meta.url).href;
const CURRENT_PARTITION = 'persist:gaia-current';
const DEFAULT_AUTH_HANDLE = 'https://bsky.social';
const DEFAULT_RECENT_REACTION_EMOJIS = ['👍', '❤️', '😂'];
const RECENT_REACTION_STORAGE_KEY = 'gaia.recentReactionEmojis';
const EMOJI_TONE_DEFAULTS_STORAGE_KEY = 'gaia.emojiToneDefaults';
const EMOJI_LONG_PRESS_MS = 450;
const GIF_QUICK_TOPICS = [
  'Favorites',
  'Trending GIFs',
  'tired bunny',
  'monday face',
  'masters',
  'morning coffee',
];
const MAX_GIF_RESULTS = 9;
const MESSAGES_AUTO_REFRESH_MS = 12_000;
const BSKY_DM_VOICE_SIGNAL_POLL_MS = 1_500;
const BSKY_DM_VOICE_SIGNAL_STALE_MS = 5 * 60_000;
const BSKY_NOTIFICATION_TRACK_LIMIT = 200;
const LAUNCHER_UPDATE_STARTUP_CHECK_DELAY_MS = 8_000;
const LAUNCHER_UPDATE_LIVE_CHECK_INTERVAL_MS = 60 * 60_000;
const LAUNCHER_UPDATE_FOCUS_CHECK_INTERVAL_MS = 15 * 60_000;

type AuthProviderChoice = 'bluesky' | 'custom';
const CURRENT_APPEARANCE_REFRESH_MS = 5_000;
const BACKGROUND_SAMPLE_SIZE = 28;
const BRIGHT_BACKGROUND_THRESHOLD = 164;
const WALLPAPER_FADE_MS = 420;
const APPEARANCE_TRANSITION_MS = 680;
const ACTOR_SEARCH_DEBOUNCE_MS = 260;
const CONVO_CACHE_LIMIT = 100;
const SERVER_SESSION_CACHE_TTL_MS = 60_000;
const SERVER_PROBE_CACHE_TTL_MS = 30_000;
const SERVER_AUTO_AUTH_RETRY_MS = 2 * 60_000;
const SERVER_WEBVIEW_SUSPEND_MS = 2 * 60_000;
const SERVER_PAGE_REVEAL_DELAY_MS = 120;
const SERVER_WEBVIEW_ALLOWED_NAVIGATION_MS = 2_500;
const WORKSPACE_PAGE_FADE_MS = 240;
const STATIC_ANIMATED_BACKGROUND_CACHE_LIMIT = 6;
const STATIC_ANIMATED_BACKGROUND_MAX_EDGE = 2_048;
const DEFAULT_BACKGROUND_CSS = 'var(--gaia-default-bg)';
const MESSAGES_BACKGROUND_CSS = 'var(--gaia-messages-bg)';
const DEFAULT_ACCENT_COLOR = '#30b4ff';
const ACCENT_SWATCHES = ['#30b4ff', '#6effbf', '#b278ff', '#ff7aa8', '#ffb36b', '#f2d44d'];
const CURRENT_VOICE_SESSION_QUERY = `(() => {
  const state = window.__CURRENT_GAIA_VOICE_STATE__;
  if (state && typeof state === 'object' && typeof state.connected === 'boolean') {
    return state.connected;
  }
  return Boolean(
    document.documentElement.dataset.gaiaVoiceConnected === 'true' ||
    document.body?.dataset.gaiaVoiceConnected === 'true' ||
    document.querySelector('.voice-box.connected, .voice-room-hero.connected')
  );
})()`;
const DEFAULT_SOUND_SETTINGS: GaiaSoundSettings = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  outputVolume: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  pushToTalkMode: 'hold',
  pushToTalkKey: 'Space',
};
const DEFAULT_VIDEO_SETTINGS: GaiaVideoSettings = {
  cameraDeviceId: 'default',
  cameraResolution: '720p',
  cameraFrameRate: 30,
  mirrorPreview: true,
};
const DEFAULT_P2P_VOICE_SETTINGS: GaiaP2PVoiceSettings = {
  turnServers: [],
};
const DEFAULT_GAIA_SETTINGS: GaiaSettings = {
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
  sound: DEFAULT_SOUND_SETTINGS,
  video: DEFAULT_VIDEO_SETTINGS,
  p2pVoice: DEFAULT_P2P_VOICE_SETTINGS,
};
const DEFAULT_SERVER_NOTIFICATION_SETTING: GaiaServerNotificationSetting = {
  level: 'all',
};
const SERVER_MUTE_FOREVER_UNTIL = '9999-12-31T23:59:59.999Z';
const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  title: string;
  summary: string;
  searchText: string;
}> = [
  {
    id: 'general',
    title: 'General',
    summary: 'Startup behavior and default workspace.',
    searchText: 'general startup start launch last view servers messages default workspace',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    summary: 'Theme, density, and motion preferences.',
    searchText: 'appearance theme color mode light dark auto system display density compact comfortable reduced motion animations transitions current backgrounds animated wallpaper',
  },
  {
    id: 'messages',
    title: 'Messages',
    summary: 'GIF playback behavior for Bluesky messages.',
    searchText: 'messages gif playback animated media always focused paused never',
  },
  {
    id: 'connections',
    title: 'Connections',
    summary: 'Connected services and activity sharing.',
    searchText: 'connections connected services spotify music audio now playing listening activity share current profile popout redirect oauth p2p voice webrtc stun turn relay ice',
  },
  {
    id: 'sound',
    title: 'Devices & Sound',
    summary: 'Voice, camera, output volume, and push-to-talk.',
    searchText: 'devices sound audio video camera webcam voice microphone mic input speaker output volume device echo cancellation noise suppression auto gain push to talk ptt keybind toggle hold preview resolution frame rate mirror',
  },
  {
    id: 'performance',
    title: 'Performance',
    summary: 'Renderer diagnostics and frame pacing tools.',
    searchText: 'performance perf probe diagnostics fps frame pacing renderer logs reload fancy fast graphics liquid glass blur blurs pause animated backgrounds wallpaper',
  },
  {
    id: 'updates',
    title: 'Updates',
    summary: 'Version checks, downloads, and install status.',
    searchText: 'updates update version download appimage linux fedora bazzite arch cachyos rpm pacman deb latest release',
  },
];
const liquidGlassLayerStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '100%',
  height: '100%',
};
const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const systemAppearanceQuery = window.matchMedia('(prefers-color-scheme: dark)');

type PickerTab = 'gifs' | 'emoji';
type SettingsSectionId = 'general' | 'appearance' | 'messages' | 'connections' | 'sound' | 'updates' | 'performance';
type MediaDeviceChoiceKind = 'audioinput' | 'audiooutput' | 'videoinput';
type AudioDeviceChoice = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
};
type IncomingP2PVoiceOffer = {
  convoId: string;
  message: Extract<GaiaP2PVoiceSignalMessage, { type: 'offer' }>;
  sourceMessageId?: string;
  receivedAt: string;
};
type P2PVoiceActionInFlight =
  | 'join'
  | 'leave'
  | 'mute'
  | 'apply-signal'
  | 'copy-signal'
  | 'accept'
  | 'reject'
  | null;
type VideoDeviceChoice = {
  deviceId: string;
  label: string;
  kind: 'videoinput';
};
type AudioDeviceLoadState = 'idle' | 'loading' | 'ready' | 'failed';
type OutputTestState = 'idle' | 'playing' | 'failed';
type MicrophoneTestState = 'idle' | 'starting' | 'active' | 'failed';
type CameraPreviewState = 'idle' | 'starting' | 'active' | 'failed';
type MicrophoneTestRuntime = {
  analyser: AnalyserNode;
  context: AudioContext;
  data: Uint8Array<ArrayBuffer>;
  rafId: number;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
};
type CameraPreviewRuntime = {
  stream: MediaStream;
};
type GifTile = {
  id: string;
  selectUrl: string;
  previewUrl: string;
  label: string;
};

type EmojiTonePickerState = {
  group: EmojiToneGroup;
  x: number;
  y: number;
} | null;

type ContextMenuItem = {
  id: string;
  label: string;
  icon: string;
  variant?: 'normal' | 'danger';
  disabled?: boolean;
  disabledReason?: string;
  hidden?: boolean;
  run: () => void | Promise<void>;
};

type ContextMenuSection = {
  id: string;
  items: ContextMenuItem[];
};

type ContextMenuRenderOptions = {
  className: string;
  dismiss: () => void;
  errorMessage: string;
};

function isRendererPerfProbeEnabled(storageKey: string): boolean {
  const params = new URLSearchParams(window.location.search);
  const values = [
    params.get('perfProbe'),
    params.get('fpsProbe'),
    params.get('glassPerf'),
    window.localStorage.getItem(storageKey),
    window.localStorage.getItem('glassPerfProbe'),
  ];

  return values.some((value) => {
    if (!value) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });
}

function countVisibleMessageBodies(): number {
  let visible = 0;
  document.querySelectorAll<HTMLElement>('.message-body').forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.top <= window.innerHeight &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth
    ) {
      visible += 1;
    }
  });
  return visible;
}

function getPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.ceil(sortedValues.length * percentile) - 1);
  return sortedValues[index] ?? 0;
}

function hasActiveStyleValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'none' && normalized !== 'initial';
}

function countComputedStyleMatches(isMatch: (style: CSSStyleDeclaration) => boolean): number {
  let count = 0;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (isMatch(window.getComputedStyle(element))) {
      count += 1;
    }
  });
  return count;
}

function getComputedStyleValue(style: CSSStyleDeclaration, propertyNames: string[]): string {
  for (const propertyName of propertyNames) {
    const value = style.getPropertyValue(propertyName);
    if (hasActiveStyleValue(value)) {
      return value;
    }
  }
  return '';
}

function startRendererPerfProbe(label: string, storageKey: string): void {
  if (!isRendererPerfProbeEnabled(storageKey)) {
    return;
  }

  let frameCount = 0;
  let lastFrameAt = performance.now();
  let windowStartedAt = lastFrameAt;
  const frameTimes: number[] = [];

  const tick = (now: number): void => {
    const frameTime = now - lastFrameAt;
    lastFrameAt = now;
    if (frameTime > 0 && frameTime < 1000) {
      frameTimes.push(frameTime);
    }
    frameCount += 1;

    const elapsed = now - windowStartedAt;
    if (elapsed >= 2000) {
      const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
      const totalFrameTime = frameTimes.reduce((sum, value) => sum + value, 0);
      const averageFrameMs = frameTimes.length ? totalFrameTime / frameTimes.length : 0;
      const p95FrameMs = getPercentile(sortedFrameTimes, 0.95);
      const p99FrameMs = getPercentile(sortedFrameTimes, 0.99);
      console.info(`[${label} perf]`, {
        fps: Math.round((frameCount * 1000) / elapsed),
        averageFrameMs: Number(averageFrameMs.toFixed(2)),
        p95FrameMs: Number(p95FrameMs.toFixed(2)),
        p99FrameMs: Number(p99FrameMs.toFixed(2)),
        framesOver8_33Ms: frameTimes.filter((value) => value > 8.33).length,
        framesOver10Ms: frameTimes.filter((value) => value > 10).length,
        framesOver12Ms: frameTimes.filter((value) => value > 12).length,
        framesOver16_67Ms: frameTimes.filter((value) => value > 16.67).length,
        framesOver20Ms: frameTimes.filter((value) => value > 20).length,
        visibleMessages: countVisibleMessageBodies(),
        liquidGlassLayers: document.querySelectorAll('.liquid-glass-layer').length,
        messageLiquidGlassLayers: document.querySelectorAll('.message-body .message-liquid-glass .liquid-glass-layer').length,
        staticMessageGlass: document.querySelectorAll('.message-liquid-glass-static').length,
        backdropFilterNodes: countComputedStyleMatches((style) =>
          hasActiveStyleValue(getComputedStyleValue(style, ['backdrop-filter', '-webkit-backdrop-filter'])),
        ),
        cssFilterNodes: countComputedStyleMatches((style) =>
          hasActiveStyleValue(getComputedStyleValue(style, ['filter'])),
        ),
        maskedNodes: countComputedStyleMatches((style) =>
          hasActiveStyleValue(getComputedStyleValue(style, ['mask-image', '-webkit-mask-image'])),
        ),
      });
      frameCount = 0;
      frameTimes.length = 0;
      windowStartedAt = now;
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

type BackgroundSnapshot = {
  css: string;
  analysisUrl?: string;
  animated?: boolean;
  staticCss?: string;
  staticAnalysisUrl?: string;
};

type ServerSessionSnapshot = {
  authenticated: boolean;
  checkedAt: number;
};

type ServerProbeSnapshot = GaiaServerProbe & {
  checkedAt: number;
};

type WebviewElement = HTMLElement & {
  src: string;
  partition: string;
  capturePage?: (rect?: { x: number; y: number; width: number; height: number }) => Promise<{ toDataURL: () => string }>;
  reload: () => void;
  executeJavaScript: <T = unknown>(code: string, userGesture?: boolean) => Promise<T>;
};

type WebviewNavigationEvent = Event & {
  url?: string;
  preventDefault?: () => void;
};

type ServerDialogMode = 'add' | 'edit';
type ContentView = 'server' | 'messages';
type ActiveView = ContentView | 'notifications' | 'settings';
type ClientAuthPurpose = 'app' | 'server' | 'messages';
type ServerPageLoadPhase = 'idle' | 'loading' | 'ready' | 'failed';
type RgbColor = { red: number; green: number; blue: number };
type HslColor = { hue: number; saturation: number; lightness: number };
type LandingGlobeCity = { lat: number; lon: number };
type LandingGlobeTheme = {
  accentHex: string;
  accent: THREE.Color;
  alt: THREE.Color;
  brand: THREE.Color;
  glow: THREE.Color;
  light: boolean;
  mode: 'light' | 'dark';
  palette: ReturnType<typeof resolveAccentPalette>;
};
type LandingEarthMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
type LandingGlobeRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  globeRoot: THREE.Group;
  earth: THREE.Mesh;
  atmosphere: THREE.Mesh;
  gridLines: THREE.LineSegments;
  cityPoints: THREE.Points;
  connectionArcs: THREE.LineSegments;
  orbitRings: THREE.Group;
  stars: THREE.Points;
  earthMaterial: LandingEarthMaterial;
  atmosphereMaterial: THREE.ShaderMaterial;
  gridMaterial: THREE.LineBasicMaterial;
  cityMaterial: THREE.PointsMaterial;
  arcMaterial: THREE.LineBasicMaterial;
  orbitMaterial: THREE.MeshBasicMaterial;
  starMaterial: THREE.PointsMaterial;
  rimLight: THREE.PointLight;
  texture: THREE.Texture;
  lastAccentHex: string;
  lastMode: 'light' | 'dark';
  pointerX: number;
  pointerY: number;
};

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing app root.');
}

root.innerHTML = `
  <div class="shell" id="shell" data-authenticated="false">
    <div class="wallpaper-crossfade" aria-hidden="true">
      <div class="wallpaper-layer is-active" id="wallpaperLayerA"></div>
      <div class="wallpaper-layer" id="wallpaperLayerB"></div>
    </div>
    <div class="appearance-transition-overlay" id="appearanceTransitionOverlay" aria-hidden="true"></div>
    <section class="signed-out-screen" id="signedOutScreen" aria-label="Gaia Launcher">
      <canvas class="landing-scene-canvas" id="landingSceneCanvas" aria-hidden="true"></canvas>
      <div class="landing-hero">
        <div class="landing-brand-lockup">
          <span class="landing-brand-mark" aria-hidden="true">
            <img class="gaia-logo landing-brand-logo" src="${GAIA_LOGO_URL}" alt="" decoding="async" draggable="false" />
          </span>
        </div>
        <h1>Gaia Launcher</h1>
        <p class="landing-copy">A polished desktop home for Current servers, Bluesky conversations, and the communities you keep close.</p>
        <div class="landing-actions">
          <button class="signed-out-login" id="signedOutLoginButton" type="button">
            <svg class="bsky-logo" viewBox="0 0 600 530" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M135 49c71 54 145 160 165 201 20-41 94-147 165-201 52-39 135-69 135 28 0 19-11 161-17 184-21 79-100 99-169 87 122 20 153 86 85 152-128 126-184-32-199-72-3-7-4-10-3-7-1-3-2 0-3 7-15 40-71 198-199 72-68-66-37-132 85-152-69 12-148-8-169-87-6-23-17-165-17-184 0-97 83-67 135-28Z"
              />
            </svg>
            <span>Sign in with Bluesky</span>
          </button>
        </div>
      </div>
      <div class="landing-preview" aria-hidden="true">
        <div class="landing-window">
          <div class="landing-window-topbar">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <div class="landing-window-body">
            <aside>
              <b></b>
              <b></b>
              <b></b>
              <b></b>
            </aside>
            <section>
              <span></span>
              <strong></strong>
              <p></p>
              <p></p>
              <p></p>
            </section>
          </div>
        </div>
        <div class="landing-signal-strip">
          <span>Current Servers</span>
          <span>Bluesky Messages</span>
          <span>Local Sessions</span>
        </div>
      </div>
    </section>
    <aside class="server-rail" aria-label="Servers">
      <button class="rail-logo notification-center-trigger" id="notificationCenterButton" type="button" title="Notifications" aria-label="Notifications" aria-expanded="false">
        <img class="gaia-logo rail-logo-image" src="${GAIA_LOGO_URL}" alt="" decoding="async" />
        <span class="notification-badge hidden" id="notificationBadge" aria-hidden="true"></span>
      </button>
      <button class="brand-mark" id="messagesButton" title="Messages" aria-label="Messages">
        <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4.75 6.25h14.5c.83 0 1.5.67 1.5 1.5v8.5c0 .83-.67 1.5-1.5 1.5H4.75c-.83 0-1.5-.67-1.5-1.5v-8.5c0-.83.67-1.5 1.5-1.5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="m4.25 7.25 7.75 5.5 7.75-5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="server-list" id="serverList"></div>
      <button class="rail-action" id="addServerButton" title="Add server" aria-label="Add server">+</button>
      <button class="rail-action settings-rail" id="settingsButton" title="Settings" aria-label="Settings" aria-haspopup="menu" aria-expanded="false">
        <svg class="rail-icon gear-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 8.35a3.65 3.65 0 1 1 0 7.3 3.65 3.65 0 0 1 0-7.3Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M19.45 13.35a7.86 7.86 0 0 0 .05-1.35 7.86 7.86 0 0 0-.05-1.35l1.62-1.27-1.72-2.98-1.92.78a8.28 8.28 0 0 0-2.34-1.35L14.8 3.75h-5.6l-.29 2.08a8.28 8.28 0 0 0-2.34 1.35l-1.92-.78-1.72 2.98 1.62 1.27A7.86 7.86 0 0 0 4.5 12c0 .45.02.9.05 1.35l-1.62 1.27 1.72 2.98 1.92-.78a8.28 8.28 0 0 0 2.34 1.35l.29 2.08h5.6l.29-2.08a8.28 8.28 0 0 0 2.34-1.35l1.92.78 1.72-2.98-1.62-1.27Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.45"
            stroke-linejoin="round"
          />
        </svg>
        <span class="rail-update-badge hidden" id="settingsUpdateBadge" aria-hidden="true">1</span>
      </button>
      <div class="rail-spacer"></div>
      <button class="rail-action logout-rail" id="logoutButton" title="Log out" aria-label="Log out">
        <svg class="logout-door-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 21V3h8.25v2H7v14h6.25v2H5Z" fill="currentColor" />
          <path d="M10 4.25 19 2.75v18.5l-9-1.5V4.25Z" fill="currentColor" />
          <circle cx="16" cy="12" r="0.85" fill="#a31625" />
        </svg>
      </button>
    </aside>
    <main class="workspace">
      <section class="browser-shell" id="browserShell">
        <div class="server-webview-stack workspace-page is-view-hidden" id="serverWebviewStack">
          <webview id="serverWebview" class="server-webview hidden" partition="${CURRENT_PARTITION}" webpreferences="backgroundThrottling=no, contextIsolation=yes, nodeIntegration=no, sandbox=yes"></webview>
          <div class="server-page-loader" id="serverPageLoader" aria-hidden="true" aria-live="polite" aria-busy="false" aria-label="Loading server">
            <div class="server-page-loader-panel" aria-hidden="true">
              <div class="server-page-loader-spinner"></div>
              <div class="server-page-loader-rows">
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
          </div>
        </div>
        <section class="notification-center notifications-view workspace-page is-view-hidden" id="notificationCenter" aria-label="Notification Center">
          <aside class="notifications-sidebar">
            <header class="notification-center-header">
              <div class="notification-center-title">
                <span class="settings-title-logo" aria-hidden="true">
                  <img class="gaia-logo settings-title-logo-image" src="${GAIA_LOGO_URL}" alt="" decoding="async" />
                </span>
                <div>
                  <span>Gaia Launcher</span>
                  <h2>Notifications</h2>
                </div>
              </div>
            </header>
            <div class="notification-center-actions">
              <span id="notificationCenterCount">0 unread</span>
              <div>
                <button class="notification-center-action" id="notificationCenterMarkReadButton" type="button">Mark Read</button>
                <button class="notification-center-action" id="notificationCenterClearButton" type="button">Clear</button>
              </div>
            </div>
            <div class="notification-center-list" id="notificationCenterList"></div>
            <div class="notification-center-empty" id="notificationCenterEmpty">No notifications yet.</div>
          </aside>
          <section class="notifications-detail chat-pane">
            <header class="thread-header chat-header">
              <div class="chat-title-glass-shell glass-panel">
                <span class="thread-eyebrow">Current</span>
                <h1>Notification Center</h1>
                <span class="thread-subtitle">Messages and pings from your Current servers</span>
              </div>
            </header>
            <div class="notifications-detail-body" id="notificationDetailBody">
              <strong>Unread notifications stay here until you read or clear them.</strong>
              <span>Select an item to jump back to its Current server.</span>
            </div>
          </section>
        </section>
        <section class="messages-view workspace-page is-view-hidden" id="messagesView" aria-label="Bluesky messages">
          <aside class="messages-sidebar">
            <header class="messages-header">
              <div>
                <span>Bluesky</span>
                <strong>Messages</strong>
              </div>
              <button class="messages-auth-button" id="startChatButton" type="button">Start A New Chat</button>
            </header>
            <div class="messages-user" id="messagesUser">Not signed in</div>
            <div class="convo-list" id="convoList"></div>
          </aside>
          <section class="message-thread chat-pane" id="messageThread">
            <header class="thread-header chat-header">
              <div class="chat-title-glass-shell glass-panel liquid-surface" id="threadTitleGlassShell">
                <span class="liquid-glass-backdrop channel-title-liquid-glass" id="threadTitleLiquidGlass" aria-hidden="true"></span>
                <span class="thread-eyebrow" id="threadEyebrow">Conversation</span>
                <h1 id="threadTitle">Select a message</h1>
                <span class="thread-subtitle" id="threadId"></span>
              </div>
              <button class="thread-call-button" id="messageCallButton" type="button" title="Start P2P voice call" aria-label="Start P2P voice call" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M6.45 5.25c.39-.39 1.04-.39 1.43 0l2.04 2.04c.35.35.4.9.12 1.31l-.98 1.45a.9.9 0 0 0 .1 1.14l3.65 3.65a.9.9 0 0 0 1.14.1l1.45-.98c.41-.28.96-.23 1.31.12l2.04 2.04c.39.39.39 1.04 0 1.43l-1.1 1.1c-.7.7-1.72.98-2.68.72-5.02-1.34-8.96-5.28-10.3-10.3-.26-.96.02-1.98.72-2.68l1.06-1.14Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <section class="incoming-call-panel hidden" id="p2pIncomingCallPanel" aria-label="Incoming P2P voice call">
              <div class="incoming-call-avatar" id="p2pIncomingCallAvatar"></div>
              <div class="incoming-call-copy">
                <span>Incoming call</span>
                <strong id="p2pIncomingCallTitle">Direct call</strong>
                <p id="p2pIncomingCallSubtitle">Bluesky DM signaling, WebRTC audio.</p>
              </div>
              <div class="incoming-call-actions">
                <button class="direct-call-control direct-call-start" id="p2pAcceptCallButton" type="button">
                  <span>Accept</span>
                </button>
                <button class="direct-call-control direct-call-end" id="p2pRejectCallButton" type="button">
                  <span>Reject</span>
                </button>
              </div>
            </section>
            <section class="direct-call-panel hidden" id="p2pCallPanel" aria-label="Direct P2P voice call">
              <button class="direct-call-close" id="p2pCallCloseButton" type="button" aria-label="Close call panel">×</button>
              <div class="direct-call-hero">
                <div class="direct-call-avatar" id="p2pCallAvatar"></div>
                <div class="direct-call-copy">
                  <span id="p2pVoiceMode">STUN-only</span>
                  <strong id="p2pCallTitle">Direct call</strong>
                  <p id="p2pVoiceStatus">Ready for a direct P2P voice call.</p>
                </div>
              </div>
              <p class="direct-call-error hidden" id="p2pVoiceError"></p>
              <div class="direct-call-stats">
                <span>Local mic <strong id="p2pLocalMicState">Off</strong></span>
                <span>Remote audio <strong id="p2pRemoteAudioState">Waiting</strong></span>
                <span id="p2pVoiceTransportLabel">Direct P2P / STUN-only</span>
              </div>
              <div class="direct-call-actions">
                <button class="direct-call-control direct-call-mic" id="p2pMuteVoiceButton" type="button" disabled>
                  <span>Mute</span>
                </button>
                <button class="direct-call-control direct-call-start" id="p2pJoinVoiceButton" type="button">
                  <span>Start Call</span>
                </button>
                <button class="direct-call-control direct-call-end" id="p2pLeaveVoiceButton" type="button" disabled>
                  <span>End</span>
                </button>
              </div>
              <details class="direct-call-signaling" id="p2pManualSignalingDetails">
                <summary>Manual signaling</summary>
                <div class="direct-call-signal-grid">
                  <label>
                    <span>Local signal</span>
                    <textarea id="p2pLocalSignalOutput" readonly spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>Peer signal</span>
                    <textarea id="p2pPeerSignalInput" spellcheck="false"></textarea>
                  </label>
                </div>
                <div class="direct-call-signal-actions">
                  <button class="settings-secondary-action" id="p2pCopySignalButton" type="button">Copy Local</button>
                  <button class="settings-secondary-action" id="p2pClearSignalButton" type="button">Clear Local</button>
                  <button class="settings-secondary-action" id="p2pApplySignalButton" type="button">Apply Peer</button>
                  <button class="settings-secondary-action" id="p2pClearPeerSignalButton" type="button">Clear Peer</button>
                </div>
              </details>
              <audio id="p2pRemoteAudio" autoplay controls></audio>
            </section>
            <div class="message-list messages-list" id="messageList"></div>
            <form class="composer message-composer" id="messageComposerForm">
              <div class="composer-inline glass-panel composer-glass-panel liquid-surface" id="messageComposerGlassPanel">
                <span class="liquid-glass-backdrop composer-liquid-glass" id="messageComposerLiquidGlass" aria-hidden="true"></span>
                <textarea class="composer-input" id="messageComposerInput" rows="1" maxlength="10000" placeholder="Message"></textarea>
                <div class="inline-actions">
                  <button class="inline-icon gif-picker" id="gifPickerButton" type="button" title="Open GIF picker" aria-label="Open GIF picker">
                    <svg class="picker-icon-svg gif-picker-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6" />
                      <path d="M8.45 10.1H7.4c-1.22 0-2.05.78-2.05 1.9s.83 1.9 2.05 1.9h1.05v-1.5H7.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35" />
                      <path d="M11.45 10.1v3.8M14.55 13.9v-3.8h3.15M14.55 12h2.55" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35" />
                    </svg>
                  </button>
                  <button class="inline-icon emoji-picker" id="emojiPickerButton" type="button" title="Open emoji picker" aria-label="Open emoji picker">
                    <svg class="picker-icon-svg emoji-picker-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="1.7" />
                      <circle cx="9.25" cy="10.45" r="0.85" fill="currentColor" />
                      <circle cx="14.75" cy="10.45" r="0.85" fill="currentColor" />
                      <path d="M8.85 13.65c.72 1.15 1.78 1.72 3.15 1.72s2.43-.57 3.15-1.72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
                    </svg>
                  </button>
                </div>
                <button class="inline-send" id="messageSendButton" type="submit">Send</button>
              </div>
            </form>
          </section>
        </section>
        <section class="settings-view workspace-page is-view-hidden" id="settingsView" aria-label="Gaia Launcher settings">
          <header class="settings-workspace-header">
            <div class="settings-title-pill">
              <span class="settings-title-logo" aria-hidden="true">
                <img class="gaia-logo settings-title-logo-image" src="${GAIA_LOGO_URL}" alt="" decoding="async" />
              </span>
              <div>
                <span>Gaia Launcher</span>
                <h1>Settings</h1>
              </div>
            </div>
            <button class="settings-close" id="settingsCloseButton" type="button">Close</button>
          </header>
          <div class="settings-workspace-shell">
            <aside class="settings-sidebar" aria-label="Settings sections">
              <input class="settings-search" id="settingsSearchInput" autocomplete="off" placeholder="Search settings" />
              <nav class="settings-nav" id="settingsNav"></nav>
            </aside>
            <section class="settings-content-pane">
              <header class="settings-section-heading">
                <div>
                  <span id="settingsSectionEyebrow">Settings</span>
                  <h2 id="settingsSectionTitle">General</h2>
                  <p id="settingsSectionSummary"></p>
                </div>
              </header>
              <div class="settings-section-content" id="settingsContent"></div>
            </section>
          </div>
          <div class="settings-save-bar hidden" id="settingsSaveBar">
            <span>Unsaved changes</span>
            <div>
              <button class="settings-secondary-action" id="settingsResetButton" type="button">Reset</button>
              <button class="settings-primary-action" id="settingsSaveButton" type="button">Save</button>
            </div>
          </div>
        </section>
        <div class="empty-state" id="emptyState">
          <strong>Add a Current server</strong>
          <span>Gaia keeps your server list locally and opens the selected chatroom here.</span>
          <button id="emptyAddServerButton">Add Server</button>
        </div>
      </section>
    </main>
    <span class="status-live" id="statusPill" aria-live="polite">Starting</span>
    <div class="auth-overlay hidden" id="authOverlay">
      <section class="auth-panel">
        <header>
          <img class="gaia-logo auth-panel-logo" src="${GAIA_LOGO_URL}" alt="" decoding="async" />
          <div>
            <span>Gaia ATProto Sign-In</span>
            <strong id="authServerName">Current</strong>
          </div>
          <button class="ghost-button" id="closeAuthButton">Close</button>
        </header>
        <div class="auth-browser-card">
          <div class="auth-card-head">
            <h1>Sign In</h1>
            <p>Gaia opens your account provider in the browser and keeps the signed-in session in the launcher.</p>
          </div>
          <div class="auth-provider-tabs" role="tablist" aria-label="Account provider">
            <button type="button" id="authProviderBlueskyButton" role="tab" aria-selected="true" data-active="true">Bluesky</button>
            <button type="button" id="authProviderCustomButton" role="tab" aria-selected="false" data-active="false">Other</button>
          </div>
          <label class="auth-provider-address hidden" id="authProviderAddressLabel">
            Server address
            <input id="authProviderAddressInput" placeholder="my-server.com" autocomplete="off" autocapitalize="none" spellcheck="false" />
          </label>
          <button class="bsky-login-button" id="authContinueButton">
            <svg class="bsky-logo" viewBox="0 0 600 530" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M135 49c71 54 145 160 165 201 20-41 94-147 165-201 52-39 135-69 135 28 0 19-11 161-17 184-21 79-100 99-169 87 122 20 153 86 85 152-128 126-184-32-199-72-3-7-4-10-3-7-1-3-2 0-3 7-15 40-71 198-199 72-68-66-37-132 85-152-69 12-148-8-169-87-6-23-17-165-17-184 0-97 83-67 135-28Z"
              />
            </svg>
            <span>Sign In With Bluesky</span>
          </button>
          <div class="auth-message" id="authMessage">
            <strong>Ready</strong>
            <span>Continue with Bluesky to sign into this Current server.</span>
          </div>
        </div>
      </section>
    </div>
    <dialog id="serverDialog" class="dialog server-dialog">
      <form method="dialog" id="serverForm" class="server-dialog-form liquid-surface glass-panel">
        <span class="liquid-glass-backdrop modal-liquid-glass" id="serverDialogLiquidGlass" aria-hidden="true"></span>
        <header>
          <h2 id="serverDialogTitle">Add Server</h2>
          <button class="dialog-close" type="button" id="closeServerDialogButton" aria-label="Close">x</button>
        </header>
        <label>
          Server URL
          <input id="serverUrlInput" autocomplete="off" placeholder="http://127.0.0.1:8080" />
        </label>
        <p class="dialog-error" id="serverDialogError"></p>
        <footer>
          <button class="danger-button hidden" type="button" id="deleteServerButton">Delete</button>
          <span></span>
          <button type="button" id="cancelServerDialogButton">Cancel</button>
          <button class="primary-button" id="saveServerButton" type="submit">Save</button>
        </footer>
      </form>
    </dialog>
    <dialog id="identityDialog" class="dialog">
      <form method="dialog" id="identityForm">
        <header>
          <h2>Bluesky Identity</h2>
          <button class="dialog-close" type="button" id="closeIdentityDialogButton" aria-label="Close">x</button>
        </header>
        <label>
          Handle, DID, or provider
          <input id="identityInput" autocomplete="off" placeholder="alice.bsky.social" />
        </label>
        <p class="identity-note">Optional. Gaia uses bsky.social by default, or this value if you want a specific handle, DID, or provider.</p>
        <footer>
          <button class="danger-button" type="button" id="clearIdentityButton">Clear</button>
          <span></span>
          <button type="button" id="cancelIdentityDialogButton">Cancel</button>
          <button class="primary-button" id="saveIdentityButton" type="submit">Save</button>
        </footer>
      </form>
    </dialog>
    <dialog id="newChatDialog" class="dialog new-chat-dialog">
      <form method="dialog" id="newChatForm">
        <header>
          <h2>Start A New Chat</h2>
          <button class="dialog-close" type="button" id="closeNewChatDialogButton" aria-label="Close">x</button>
        </header>
        <label>
          Username
          <input id="newChatSearchInput" autocomplete="off" placeholder="alice.bsky.social" />
        </label>
        <div class="new-chat-results" id="newChatResults"></div>
        <p class="dialog-error" id="newChatError"></p>
        <footer>
          <span></span>
          <button type="button" id="cancelNewChatDialogButton">Cancel</button>
        </footer>
      </form>
    </dialog>
    <div class="context-menu discord-context-menu server-context-menu hidden" id="serverContextMenu" role="menu"></div>
    <div class="context-menu discord-context-menu hidden" id="messageContextMenu" role="menu"></div>
    <div class="context-menu discord-context-menu rail-appearance-menu hidden" id="railAppearanceMenu" role="menu"></div>
    <div class="gif-modal-backdrop hidden" id="gifModalBackdrop">
      <section class="gif-modal" id="gifModal">
        <header class="gif-modal-top">
          <div class="gif-tabs" id="gifTabs"></div>
          <button class="gif-close" id="gifCloseButton" type="button" aria-label="Close">x</button>
        </header>
        <input class="gif-search-input" id="gifSearchInput" autocomplete="off" />
        <div id="gifModalContent"></div>
      </section>
      <div class="emoji-tone-popover hidden" id="emojiTonePopover"></div>
    </div>
  </div>
`;

const shell = document.querySelector<HTMLDivElement>('#shell')!;
const appearanceTransitionOverlay = document.querySelector<HTMLDivElement>('#appearanceTransitionOverlay')!;
const wallpaperLayerA = document.querySelector<HTMLDivElement>('#wallpaperLayerA')!;
const wallpaperLayerB = document.querySelector<HTMLDivElement>('#wallpaperLayerB')!;
const signedOutScreen = document.querySelector<HTMLElement>('#signedOutScreen')!;
const landingSceneCanvas = document.querySelector<HTMLCanvasElement>('#landingSceneCanvas')!;
const signedOutLoginButton = document.querySelector<HTMLButtonElement>('#signedOutLoginButton')!;
const serverList = document.querySelector<HTMLDivElement>('#serverList')!;
const statusPill = document.querySelector<HTMLSpanElement>('#statusPill')!;
const emptyState = document.querySelector<HTMLDivElement>('#emptyState')!;
const serverWebviewStack = document.querySelector<HTMLDivElement>('#serverWebviewStack')!;
const serverPageLoader = document.querySelector<HTMLDivElement>('#serverPageLoader')!;
let serverWebview = document.querySelector<WebviewElement>('#serverWebview')!;
serverWebview.setAttribute('webpreferences', 'backgroundThrottling=no, contextIsolation=yes, nodeIntegration=no, sandbox=yes');
const notificationCenterButton = document.querySelector<HTMLButtonElement>('#notificationCenterButton')!;
const notificationBadge = document.querySelector<HTMLSpanElement>('#notificationBadge')!;
const notificationCenter = document.querySelector<HTMLElement>('#notificationCenter')!;
const notificationCenterCount = document.querySelector<HTMLSpanElement>('#notificationCenterCount')!;
const notificationCenterMarkReadButton = document.querySelector<HTMLButtonElement>('#notificationCenterMarkReadButton')!;
const notificationCenterClearButton = document.querySelector<HTMLButtonElement>('#notificationCenterClearButton')!;
const notificationCenterList = document.querySelector<HTMLDivElement>('#notificationCenterList')!;
const notificationCenterEmpty = document.querySelector<HTMLDivElement>('#notificationCenterEmpty')!;
const notificationDetailBody = document.querySelector<HTMLDivElement>('#notificationDetailBody')!;
const messagesButton = document.querySelector<HTMLButtonElement>('#messagesButton')!;
const messagesView = document.querySelector<HTMLElement>('#messagesView')!;
const messageThread = document.querySelector<HTMLElement>('#messageThread')!;
const messageCallButton = document.querySelector<HTMLButtonElement>('#messageCallButton')!;
const p2pIncomingCallPanel = document.querySelector<HTMLElement>('#p2pIncomingCallPanel')!;
const p2pIncomingCallAvatar = document.querySelector<HTMLDivElement>('#p2pIncomingCallAvatar')!;
const p2pIncomingCallTitle = document.querySelector<HTMLElement>('#p2pIncomingCallTitle')!;
const p2pIncomingCallSubtitle = document.querySelector<HTMLElement>('#p2pIncomingCallSubtitle')!;
const p2pAcceptCallButton = document.querySelector<HTMLButtonElement>('#p2pAcceptCallButton')!;
const p2pRejectCallButton = document.querySelector<HTMLButtonElement>('#p2pRejectCallButton')!;
const p2pCallPanel = document.querySelector<HTMLElement>('#p2pCallPanel')!;
const p2pCallCloseButton = document.querySelector<HTMLButtonElement>('#p2pCallCloseButton')!;
const p2pCallAvatar = document.querySelector<HTMLDivElement>('#p2pCallAvatar')!;
const p2pCallTitle = document.querySelector<HTMLElement>('#p2pCallTitle')!;
const p2pVoiceMode = document.querySelector<HTMLSpanElement>('#p2pVoiceMode')!;
const p2pVoiceStatus = document.querySelector<HTMLElement>('#p2pVoiceStatus')!;
const p2pVoiceError = document.querySelector<HTMLParagraphElement>('#p2pVoiceError')!;
const p2pJoinVoiceButton = document.querySelector<HTMLButtonElement>('#p2pJoinVoiceButton')!;
const p2pMuteVoiceButton = document.querySelector<HTMLButtonElement>('#p2pMuteVoiceButton')!;
const p2pLeaveVoiceButton = document.querySelector<HTMLButtonElement>('#p2pLeaveVoiceButton')!;
const p2pLocalMicState = document.querySelector<HTMLElement>('#p2pLocalMicState')!;
const p2pRemoteAudioState = document.querySelector<HTMLElement>('#p2pRemoteAudioState')!;
const p2pLocalSignalOutput = document.querySelector<HTMLTextAreaElement>('#p2pLocalSignalOutput')!;
const p2pPeerSignalInput = document.querySelector<HTMLTextAreaElement>('#p2pPeerSignalInput')!;
const p2pManualSignalingDetails = document.querySelector<HTMLDetailsElement>('#p2pManualSignalingDetails')!;
const p2pCopySignalButton = document.querySelector<HTMLButtonElement>('#p2pCopySignalButton')!;
const p2pClearSignalButton = document.querySelector<HTMLButtonElement>('#p2pClearSignalButton')!;
const p2pApplySignalButton = document.querySelector<HTMLButtonElement>('#p2pApplySignalButton')!;
const p2pClearPeerSignalButton = document.querySelector<HTMLButtonElement>('#p2pClearPeerSignalButton')!;
const p2pVoiceTransportLabel = document.querySelector<HTMLElement>('#p2pVoiceTransportLabel')!;
const p2pRemoteAudio = document.querySelector<HTMLAudioElement>('#p2pRemoteAudio')!;
const startChatButton = document.querySelector<HTMLButtonElement>('#startChatButton')!;
const messagesUser = document.querySelector<HTMLDivElement>('#messagesUser')!;
const convoList = document.querySelector<HTMLDivElement>('#convoList')!;
const messageList = document.querySelector<HTMLDivElement>('#messageList')!;
const messageComposerForm = document.querySelector<HTMLFormElement>('#messageComposerForm')!;
const messageComposerGlassPanel = document.querySelector<HTMLDivElement>('#messageComposerGlassPanel')!;
const messageComposerLiquidGlass = document.querySelector<HTMLSpanElement>('#messageComposerLiquidGlass')!;
const messageComposerInput = document.querySelector<HTMLTextAreaElement>('#messageComposerInput')!;
const messageSendButton = document.querySelector<HTMLButtonElement>('#messageSendButton')!;
const gifPickerButton = document.querySelector<HTMLButtonElement>('#gifPickerButton')!;
const emojiPickerButton = document.querySelector<HTMLButtonElement>('#emojiPickerButton')!;
const threadTitleGlassShell = document.querySelector<HTMLDivElement>('#threadTitleGlassShell')!;
const threadTitleLiquidGlass = document.querySelector<HTMLSpanElement>('#threadTitleLiquidGlass')!;
const threadEyebrow = document.querySelector<HTMLSpanElement>('#threadEyebrow')!;
const threadTitle = document.querySelector<HTMLElement>('#threadTitle')!;
const threadId = document.querySelector<HTMLElement>('#threadId')!;
const authOverlay = document.querySelector<HTMLDivElement>('#authOverlay')!;
const authMessage = document.querySelector<HTMLDivElement>('#authMessage')!;
const authServerName = document.querySelector<HTMLElement>('#authServerName')!;
const authContinueButton = document.querySelector<HTMLButtonElement>('#authContinueButton')!;
const authProviderBlueskyButton = document.querySelector<HTMLButtonElement>('#authProviderBlueskyButton')!;
const authProviderCustomButton = document.querySelector<HTMLButtonElement>('#authProviderCustomButton')!;
const authProviderAddressLabel = document.querySelector<HTMLLabelElement>('#authProviderAddressLabel')!;
const authProviderAddressInput = document.querySelector<HTMLInputElement>('#authProviderAddressInput')!;
const addServerButton = document.querySelector<HTMLButtonElement>('#addServerButton')!;
const settingsButton = document.querySelector<HTMLButtonElement>('#settingsButton')!;
const settingsUpdateBadge = document.querySelector<HTMLSpanElement>('#settingsUpdateBadge')!;
const emptyAddServerButton = document.querySelector<HTMLButtonElement>('#emptyAddServerButton')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logoutButton')!;
const closeAuthButton = document.querySelector<HTMLButtonElement>('#closeAuthButton')!;
const settingsView = document.querySelector<HTMLElement>('#settingsView')!;
const settingsCloseButton = document.querySelector<HTMLButtonElement>('#settingsCloseButton')!;
const settingsSearchInput = document.querySelector<HTMLInputElement>('#settingsSearchInput')!;
const settingsNav = document.querySelector<HTMLElement>('#settingsNav')!;
const settingsSectionEyebrow = document.querySelector<HTMLSpanElement>('#settingsSectionEyebrow')!;
const settingsSectionTitle = document.querySelector<HTMLHeadingElement>('#settingsSectionTitle')!;
const settingsSectionSummary = document.querySelector<HTMLParagraphElement>('#settingsSectionSummary')!;
const settingsContent = document.querySelector<HTMLDivElement>('#settingsContent')!;
const settingsSaveBar = document.querySelector<HTMLDivElement>('#settingsSaveBar')!;
const settingsResetButton = document.querySelector<HTMLButtonElement>('#settingsResetButton')!;
const settingsSaveButton = document.querySelector<HTMLButtonElement>('#settingsSaveButton')!;
const serverDialog = document.querySelector<HTMLDialogElement>('#serverDialog')!;
const serverForm = document.querySelector<HTMLFormElement>('#serverForm')!;
const serverDialogLiquidGlass = document.querySelector<HTMLSpanElement>('#serverDialogLiquidGlass')!;
const serverDialogTitle = document.querySelector<HTMLHeadingElement>('#serverDialogTitle')!;
const serverUrlInput = document.querySelector<HTMLInputElement>('#serverUrlInput')!;
const serverDialogError = document.querySelector<HTMLParagraphElement>('#serverDialogError')!;
const closeServerDialogButton = document.querySelector<HTMLButtonElement>('#closeServerDialogButton')!;
const cancelServerDialogButton = document.querySelector<HTMLButtonElement>('#cancelServerDialogButton')!;
const deleteServerButton = document.querySelector<HTMLButtonElement>('#deleteServerButton')!;
const identityDialog = document.querySelector<HTMLDialogElement>('#identityDialog')!;
const identityForm = document.querySelector<HTMLFormElement>('#identityForm')!;
const identityInput = document.querySelector<HTMLInputElement>('#identityInput')!;
const closeIdentityDialogButton = document.querySelector<HTMLButtonElement>('#closeIdentityDialogButton')!;
const cancelIdentityDialogButton = document.querySelector<HTMLButtonElement>('#cancelIdentityDialogButton')!;
const clearIdentityButton = document.querySelector<HTMLButtonElement>('#clearIdentityButton')!;
const newChatDialog = document.querySelector<HTMLDialogElement>('#newChatDialog')!;
const newChatForm = document.querySelector<HTMLFormElement>('#newChatForm')!;
const newChatSearchInput = document.querySelector<HTMLInputElement>('#newChatSearchInput')!;
const newChatResults = document.querySelector<HTMLDivElement>('#newChatResults')!;
const newChatError = document.querySelector<HTMLParagraphElement>('#newChatError')!;
const closeNewChatDialogButton = document.querySelector<HTMLButtonElement>('#closeNewChatDialogButton')!;
const cancelNewChatDialogButton = document.querySelector<HTMLButtonElement>('#cancelNewChatDialogButton')!;
const serverContextMenu = document.querySelector<HTMLDivElement>('#serverContextMenu')!;
const messageContextMenu = document.querySelector<HTMLDivElement>('#messageContextMenu')!;
const railAppearanceMenu = document.querySelector<HTMLDivElement>('#railAppearanceMenu')!;
const gifModalBackdrop = document.querySelector<HTMLDivElement>('#gifModalBackdrop')!;
const gifModal = document.querySelector<HTMLElement>('#gifModal')!;
const gifTabs = document.querySelector<HTMLDivElement>('#gifTabs')!;
const gifCloseButton = document.querySelector<HTMLButtonElement>('#gifCloseButton')!;
const gifSearchInput = document.querySelector<HTMLInputElement>('#gifSearchInput')!;
const gifModalContent = document.querySelector<HTMLDivElement>('#gifModalContent')!;
const emojiTonePopover = document.querySelector<HTMLDivElement>('#emojiTonePopover')!;

startRendererPerfProbe('Gaia', 'gaia.perfProbe');

let store: GaiaStore | null = null;
let selectedServerId: string | undefined;
let serverDialogMode: ServerDialogMode = 'add';
let activeView: ActiveView = 'server';
let lastContentView: ContentView = 'server';
let startupViewResolved = false;
let activeSettingsSection: SettingsSectionId = 'general';
let settingsDraft: GaiaSettings | null = null;
let settingsSearchQuery = '';
let settingsSaveInFlight = false;
let updateState: GaiaUpdateState | null = null;
let updateActionInFlight: 'check' | 'download' | 'install' | 'downloads' | null = null;
let updateLiveCheckInFlight = false;
let updateLiveCheckTimer: number | null = null;
let lastUpdateLiveCheckAttemptMs = 0;
let accentPickerDraftColor: string | null = null;
let audioDeviceLoadState: AudioDeviceLoadState = 'idle';
let audioDeviceMessage = '';
let audioInputDevices: AudioDeviceChoice[] = [];
let audioOutputDevices: AudioDeviceChoice[] = [];
let videoInputDevices: VideoDeviceChoice[] = [];
let soundKeyCaptureActive = false;
let outputTestState: OutputTestState = 'idle';
let outputTestMessage = 'Play a notification sound through the selected speakers.';
let outputTestAudio: HTMLAudioElement | null = null;
let notificationCenterState: GaiaNotificationCenterState = { notifications: [], unreadCount: 0 };
let selectedNotificationId: string | null = null;
let bskyNotificationBaselineReady = false;
let spotifyStatus: GaiaSpotifyStatus = {
  configured: false,
  connected: false,
  sharingEnabled: false,
  redirectUri: 'https://gaiachat.github.io/spotify/callback/',
  scope: 'user-read-currently-playing',
};
let spotifyActionInFlight: 'connect' | 'sharing' | 'disconnect' | 'copy' | null = null;
let p2pVoiceSignaling: P2PVoiceSignalingTransport = new ManualP2PVoiceSignalingTransport(handleP2PVoiceOutboundSignal);
let p2pVoiceSignalingConvoId: string | null = null;
let p2pVoiceService = new P2PVoiceCallService({
  signaling: p2pVoiceSignaling,
  iceConfig: p2pVoiceIceConfigFromSettings(DEFAULT_P2P_VOICE_SETTINGS),
});
let p2pVoiceState: P2PVoiceState = p2pVoiceService.getState();
let p2pVoiceOutboundSignals: GaiaP2PVoiceSignalMessage[] = [];
let p2pVoiceActionInFlight: P2PVoiceActionInFlight = null;
let p2pVoiceStateUnsubscribe: (() => void) | null = null;
let p2pVoiceRemoteStreamUnsubscribe: (() => void) | null = null;
let p2pDirectCallOpen = false;
let p2pDirectCallConvoId: string | null = null;
let p2pBskyMonitorTransport: BskyDmP2PVoiceSignalingTransport | null = null;
let p2pBskyMonitorUnsubscribe: (() => void) | null = null;
let p2pBskyMonitorConvoId: string | null = null;
let p2pBskyMonitorLocalDid: string | null = null;
let incomingP2PVoiceOffer: IncomingP2PVoiceOffer | null = null;
let microphoneTestState: MicrophoneTestState = 'idle';
let microphoneTestMessage = 'Start a local mic test to check the selected input.';
let microphoneTestLevel = 0;
let microphoneTestRuntime: MicrophoneTestRuntime | null = null;
let cameraPreviewState: CameraPreviewState = 'idle';
let cameraPreviewMessage = 'Start a camera preview to check your selected webcam.';
let cameraPreviewRuntime: CameraPreviewRuntime | null = null;
let authServerId: string | null = null;
let authRequestId: string | null = null;
let clientAuthStatus: GaiaClientAuthStatus = { authenticated: false };
let clientAuthPending = false;
let authProviderChoice: AuthProviderChoice = 'bluesky';
let pendingClientAuthPurpose: ClientAuthPurpose | null = null;
let pendingClientAuthServerId: string | null = null;
let contextMessageId: string | null = null;
let convos: GaiaBskyConvo[] = [];
let selectedConvoId: string | null = null;
let currentConvoCursor: string | undefined;
let nextConvoCursor: string | undefined;
let convoCursorStack: string[] = [];
let messages: GaiaBskyMessage[] = [];
let currentMessageCursor: string | undefined;
let nextMessageCursor: string | undefined;
let messageCursorStack: string[] = [];
let messagesAutoRefreshTimer: number | undefined;
let messagesAutoRefreshInFlight = false;
let currentAppearanceRefreshTimer: number | undefined;
let currentAppearanceRequestId = 0;
let serverRailIdentityRequestId = 0;
let serverLoadRequestId = 0;
let serverPageRevealTimer: number | undefined;
let visibleWorkspaceView: ActiveView | null = null;
let visibleWorkspaceServerId: string | null = null;
let messagesWorkspaceReady = false;
let landingSceneFrame: number | undefined;
let landingSceneReady = false;
let landingSceneWidth = 0;
let landingSceneHeight = 0;
let landingScenePixelRatio = 1;
let actorSearchTimer: number | undefined;
let actorSearchSequence = 0;
let newChatActors: GaiaBskyActor[] = [];
let pickerOpen = false;
let pickerTab: PickerTab = 'gifs';
let emojiReactionMessageId: string | null = null;
let emojiSearchInputValue = '';
let emojiCatalog: EmojiEntry[] = [];
let emojiToneIndex: EmojiToneIndex = buildEmojiToneIndex([]);
let emojiCatalogLoading = false;
let emojiCatalogLoadPromise: Promise<void> | null = null;
let emojiToneDefaults = loadEmojiToneDefaults();
let emojiTonePicker: EmojiTonePickerState = null;
let emojiLongPressTimer: number | undefined;
let emojiLongPressTriggered = false;
let gifSearchInputValue = '';
let gifSearchQuery = 'Trending GIFs';
let gifSearchTimer: number | undefined;
let gifSearchSequence = 0;
let gifTiles: GifTile[] = [];
let gifProviderWarning = '';
let gifLoading = false;
let recentReactionEmojis = loadRecentReactionEmojis();
let backgroundAnalysisSequence = 0;
let railGlassSampleSequence = 0;
let activeWallpaperLayer = wallpaperLayerA;
let currentWallpaperCss = DEFAULT_BACKGROUND_CSS;
let wallpaperFadeTimer: number | undefined;
let appearanceTransitionTimer: number | undefined;
const convoPageCache = new Map<string, GaiaBskyConvoPage>();
const messagePageCache = new Map<string, GaiaBskyMessagePage>();
const inFlightConvoPages = new Map<string, Promise<GaiaBskyConvoPage>>();
const inFlightMessagePages = new Map<string, Promise<GaiaBskyMessagePage>>();
const bskyNotifiedMessageIds = new Set<string>();
const serverWebviews = new Map<string, WebviewElement>();
const serverWebviewSuspendTimers = new Map<string, number>();
const workspacePageFadeTimers = new Map<HTMLElement, number>();
const serverBackgroundCache = new Map<string, BackgroundSnapshot>();
const serverSessionCache = new Map<string, ServerSessionSnapshot>();
const serverProbeCache = new Map<string, ServerProbeSnapshot>();
const pendingReactionKeys = new Set<string>();
const authAttempts = new Map<string, number>();
const authFailures = new Set<string>();
const manuallyLoggedOutServers = new Set<string>();
const staticAnimatedBackgroundCache = new Map<string, string>();
const pendingStaticAnimatedBackgrounds = new Map<string, Promise<string | undefined>>();
const brightBackgroundCache = new Map<string, boolean>();
const serverRailIdentityCache = new Map<string, {
  iconUrl?: string;
  name?: string;
  sourceUrl: string;
}>();
const landingScenePointer = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  pitch: 0,
  yaw: 0,
};
const LANDING_GLOBE_RADIUS = 1.58;
const LANDING_GLOBE_CITIES: LandingGlobeCity[] = [
  { lat: 40.7128, lon: -74.006 },
  { lat: 34.0522, lon: -118.2437 },
  { lat: 37.7749, lon: -122.4194 },
  { lat: 51.5072, lon: -0.1276 },
  { lat: 48.8566, lon: 2.3522 },
  { lat: 35.6762, lon: 139.6503 },
  { lat: -33.8688, lon: 151.2093 },
  { lat: 1.3521, lon: 103.8198 },
  { lat: 28.6139, lon: 77.209 },
  { lat: -23.5505, lon: -46.6333 },
  { lat: -1.2921, lon: 36.8219 },
  { lat: 55.7558, lon: 37.6173 },
];
const LANDING_GLOBE_ARCS: Array<[number, number]> = [
  [0, 2],
  [0, 3],
  [1, 6],
  [2, 5],
  [3, 4],
  [3, 11],
  [4, 8],
  [5, 7],
  [5, 6],
  [7, 8],
  [7, 10],
  [9, 0],
  [9, 3],
  [10, 4],
];
let landingGlobeRuntime: LandingGlobeRuntime | null = null;
let landingGlobeTextureCache: Partial<Record<LandingGlobeTheme['mode'], THREE.Texture>> = {};
let landingSceneUnavailable = false;
let composerLiquidGlassRoot: Root | null = null;
let composerLiquidGlassOverLight: boolean | null = null;
let composerLiquidGlassFast: boolean | null = null;
const composerLiquidGlassMouseContainer = { current: messageComposerGlassPanel };
let threadTitleLiquidGlassRoot: Root | null = null;
let threadTitleLiquidGlassOverLight: boolean | null = null;
let threadTitleLiquidGlassFast: boolean | null = null;
const threadTitleLiquidGlassMouseContainer = { current: threadTitleGlassShell };
let serverDialogLiquidGlassRoot: Root | null = null;
let serverDialogLiquidGlassOverLight: boolean | null = null;
let serverDialogLiquidGlassFast: boolean | null = null;
const serverDialogLiquidGlassMouseContainer = { current: serverForm };

function fastGraphicsModeEnabled(settings = currentSettings()): boolean {
  return settings.fastGraphicsMode;
}

function renderComposerLiquidGlass(): void {
  const overLight = shell.classList.contains('over-light-background');
  const fastGraphics = fastGraphicsModeEnabled();
  if (
    composerLiquidGlassRoot &&
    composerLiquidGlassOverLight === overLight &&
    composerLiquidGlassFast === fastGraphics
  ) {
    return;
  }

  composerLiquidGlassRoot ??= createRoot(messageComposerLiquidGlass);
  composerLiquidGlassOverLight = overLight;
  composerLiquidGlassFast = fastGraphics;
  composerLiquidGlassRoot.render(
    fastGraphics
      ? createElement('span', { className: 'liquid-glass-fill' })
      : createElement(
      LiquidGlass,
      {
        className: 'liquid-glass-layer',
        style: liquidGlassLayerStyle,
        padding: '0',
        cornerRadius: 14,
        displacementScale: 128,
        blurAmount: 0.1,
        saturation: 145,
        aberrationIntensity: 2,
        elasticity: 0.04,
        mode: 'prominent',
        mouseContainer: composerLiquidGlassMouseContainer,
        overLight,
        children: createElement('span', { className: 'liquid-glass-fill' }),
      },
    ),
  );
}

function renderThreadTitleLiquidGlass(): void {
  const overLight = shell.classList.contains('over-light-background');
  const fastGraphics = fastGraphicsModeEnabled();
  if (
    threadTitleLiquidGlassRoot &&
    threadTitleLiquidGlassOverLight === overLight &&
    threadTitleLiquidGlassFast === fastGraphics
  ) {
    return;
  }

  threadTitleLiquidGlassRoot ??= createRoot(threadTitleLiquidGlass);
  threadTitleLiquidGlassOverLight = overLight;
  threadTitleLiquidGlassFast = fastGraphics;
  threadTitleLiquidGlassRoot.render(
    fastGraphics
      ? createElement('span', { className: 'liquid-glass-fill' })
      : createElement(
      LiquidGlass,
      {
        className: 'liquid-glass-layer',
        style: liquidGlassLayerStyle,
        padding: '0',
        cornerRadius: 999,
        displacementScale: 128,
        blurAmount: 0.1,
        saturation: 145,
        aberrationIntensity: 2,
        elasticity: 0.04,
        mode: 'prominent',
        mouseContainer: threadTitleLiquidGlassMouseContainer,
        overLight,
        children: createElement('span', { className: 'liquid-glass-fill' }),
      },
    ),
  );
}

function renderServerDialogLiquidGlass(): void {
  const overLight = shell.classList.contains('over-light-background');
  const fastGraphics = fastGraphicsModeEnabled();
  serverForm.classList.toggle('over-light-background', overLight);
  if (
    serverDialogLiquidGlassRoot &&
    serverDialogLiquidGlassOverLight === overLight &&
    serverDialogLiquidGlassFast === fastGraphics
  ) {
    return;
  }

  serverDialogLiquidGlassRoot ??= createRoot(serverDialogLiquidGlass);
  serverDialogLiquidGlassOverLight = overLight;
  serverDialogLiquidGlassFast = fastGraphics;
  serverDialogLiquidGlassRoot.render(
    fastGraphics
      ? createElement('span', { className: 'liquid-glass-fill' })
      : createElement(
      LiquidGlass,
      {
        className: 'liquid-glass-layer',
        style: liquidGlassLayerStyle,
        padding: '0',
        cornerRadius: 18,
        displacementScale: 128,
        blurAmount: 0.12,
        saturation: 145,
        aberrationIntensity: 2,
        elasticity: 0.04,
        mode: 'prominent',
        mouseContainer: serverDialogLiquidGlassMouseContainer,
        overLight,
        children: createElement('span', { className: 'liquid-glass-fill' }),
      },
    ),
  );
}

function createMenuLiquidGlassBackdrop(overLight = shell.classList.contains('over-light-background')): HTMLSpanElement {
  const backdrop = document.createElement('span');
  backdrop.className = 'liquid-glass-backdrop menu-liquid-glass';
  backdrop.setAttribute('aria-hidden', 'true');
  createRoot(backdrop).render(
    fastGraphicsModeEnabled()
      ? createElement('span', { className: 'liquid-glass-fill' })
      : createElement(
          LiquidGlass,
          {
            className: 'liquid-glass-layer',
            style: liquidGlassLayerStyle,
            padding: '0',
            cornerRadius: 14,
            displacementScale: 72,
            blurAmount: 0.14,
            saturation: 148,
            aberrationIntensity: 1.4,
            elasticity: 0,
            mode: 'prominent',
            overLight,
            children: createElement('span', { className: 'liquid-glass-fill' }),
          },
        ),
  );
  return backdrop;
}

function createStaticMessageGlassBackdrop(overLight = shell.classList.contains('over-light-background')): HTMLSpanElement {
  const backdrop = document.createElement('span');
  backdrop.className = `liquid-glass-backdrop message-liquid-glass message-liquid-glass-static${overLight ? ' over-light' : ''}`;
  backdrop.setAttribute('aria-hidden', 'true');
  return backdrop;
}

function renderFloatingLiquidGlassSurfaces(): void {
  renderComposerLiquidGlass();
  renderThreadTitleLiquidGlass();
  if (serverDialog.open) {
    renderServerDialogLiquidGlass();
  }
}

function refreshLiquidGlassSurfaceSizes(): void {
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
}

function cloneSettings(settings: GaiaSettings): GaiaSettings {
  const sound = settings.sound ?? DEFAULT_SOUND_SETTINGS;
  const video = settings.video ?? DEFAULT_VIDEO_SETTINGS;
  const p2pVoice = settings.p2pVoice ?? DEFAULT_P2P_VOICE_SETTINGS;
  return {
    ...settings,
    animatedCurrentBackgrounds:
      typeof settings.animatedCurrentBackgrounds === 'boolean'
        ? settings.animatedCurrentBackgrounds
        : DEFAULT_GAIA_SETTINGS.animatedCurrentBackgrounds,
    fastGraphicsMode:
      typeof settings.fastGraphicsMode === 'boolean'
        ? settings.fastGraphicsMode
        : DEFAULT_GAIA_SETTINGS.fastGraphicsMode,
    sound: { ...DEFAULT_SOUND_SETTINGS, ...sound },
    video: { ...DEFAULT_VIDEO_SETTINGS, ...video },
    p2pVoice: {
      turnServers: [...(p2pVoice.turnServers ?? [])],
    },
  };
}

function currentSettings(): GaiaSettings {
  return store?.settings ?? DEFAULT_GAIA_SETTINGS;
}

function p2pVoiceIceConfigFromSettings(settings: GaiaP2PVoiceSettings): GaiaP2PVoiceIceConfig {
  return {
    stunUrls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
    ],
    turnServers: [...(settings.turnServers ?? [])],
  };
}

function normalizeAccentColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function clampColorChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function rgbCss(color: RgbColor): string {
  return `${clampColorChannel(color.red)}, ${clampColorChannel(color.green)}, ${clampColorChannel(color.blue)}`;
}

function rgbaCss(color: RgbColor, alpha: number): string {
  return `rgba(${rgbCss(color)}, ${alpha})`;
}

function hexToRgbColor(hex: string): RgbColor | null {
  const normalized = normalizeAccentColor(hex);
  if (!normalized) {
    return null;
  }

  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHexColor(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixRgbColor(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const weight = Math.min(1, Math.max(0, amount));
  return {
    red: from.red + (to.red - from.red) * weight,
    green: from.green + (to.green - from.green) * weight,
    blue: from.blue + (to.blue - from.blue) * weight,
  };
}

function rgbToHslColor(color: RgbColor): HslColor {
  const red = clampColorChannel(color.red) / 255;
  const green = clampColorChannel(color.green) / 255;
  const blue = clampColorChannel(color.blue) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

function resolveAccentPalette(accentColor = DEFAULT_ACCENT_COLOR, resolvedMode: 'light' | 'dark' = resolveAppearanceMode()): {
  accent: RgbColor;
  accentHex: string;
  alt: RgbColor;
  altHex: string;
  brand: RgbColor;
  brandAlt: RgbColor;
  glow: RgbColor;
  hsl: HslColor;
  light: boolean;
  rail: RgbColor;
} {
  const accentHex = normalizeAccentColor(accentColor) ?? DEFAULT_ACCENT_COLOR;
  const accent = hexToRgbColor(accentHex) ?? hexToRgbColor(DEFAULT_ACCENT_COLOR)!;
  const hsl = rgbToHslColor(accent);
  const alt = hslToRgb((hsl.hue + 310) % 360, Math.min(1, Math.max(0.38, hsl.saturation * 0.92)), 0.62);
  const light = resolvedMode === 'light';
  const brand = light ? mixRgbColor(accent, { red: 0, green: 38, blue: 56 }, 0.42) : accent;
  const brandAlt = light ? mixRgbColor(alt, { red: 0, green: 48, blue: 38 }, 0.4) : alt;
  return {
    accent,
    accentHex,
    alt,
    altHex: rgbToHexColor(alt),
    brand,
    brandAlt,
    glow: mixRgbColor(accent, { red: 255, green: 255, blue: 255 }, light ? 0.34 : 0.16),
    hsl,
    light,
    rail: light ? mixRgbColor(accent, { red: 224, green: 246, blue: 255 }, 0.52) : mixRgbColor(accent, { red: 4, green: 10, blue: 18 }, 0.54),
  };
}

function accentLogoFilter(palette: ReturnType<typeof resolveAccentPalette>): string {
  const hueRotate = 132 + Math.round(palette.hsl.hue - 201);
  const light = palette.light;
  return [
    'sepia(0.26)',
    light ? 'saturate(1.7)' : 'saturate(1.95)',
    `hue-rotate(${hueRotate}deg)`,
    light ? 'brightness(0.92)' : 'brightness(0.82)',
    light ? 'contrast(1.08)' : 'contrast(1.18)',
    `drop-shadow(0 16px 30px ${rgbaCss(palette.brand, light ? 0.14 : 0.18)})`,
  ].join(' ');
}

function applyAccentColor(settings = currentSettings()): void {
  const resolvedMode = resolveAppearanceMode(settings);
  const palette = resolveAccentPalette(settings.accentColor, resolvedMode);
  const light = resolvedMode === 'light';
  const primaryAlpha = light ? 0.34 : 0.24;
  const secondaryAlpha = light ? 0.22 : 0.16;
  const tertiaryAlpha = light ? 0.18 : 0.14;

  shell.style.setProperty('--gaia-accent', palette.accentHex);
  shell.style.setProperty('--gaia-accent-rgb', rgbCss(palette.accent));
  shell.style.setProperty('--gaia-accent-alt', palette.altHex);
  shell.style.setProperty('--gaia-accent-alt-rgb', rgbCss(palette.alt));
  shell.style.setProperty('--brand', rgbToHexColor(palette.brand));
  shell.style.setProperty('--brand-rgb', rgbCss(palette.brand));
  shell.style.setProperty('--brand-alt', rgbToHexColor(palette.brandAlt));
  shell.style.setProperty('--brand-alt-rgb', rgbCss(palette.brandAlt));
  shell.style.setProperty('--gaia-logo-tint', palette.accentHex);
  shell.style.setProperty('--gaia-logo-tint-alt', palette.altHex);
  shell.style.setProperty('--gaia-logo-filter', accentLogoFilter(palette));
  shell.style.setProperty('--glass-control-hover-bg', rgbaCss(palette.accent, light ? 0.18 : 0.16));
  shell.style.setProperty(
    '--gaia-default-bg',
    [
      `radial-gradient(circle at 16% 18%, ${rgbaCss(palette.accent, primaryAlpha)}, transparent 34%)`,
      `radial-gradient(circle at 82% 15%, ${rgbaCss(palette.alt, secondaryAlpha)}, transparent 30%)`,
      `radial-gradient(circle at 72% 86%, ${rgbaCss(palette.glow, tertiaryAlpha)}, transparent 36%)`,
      light
        ? 'linear-gradient(155deg, #f8fcff 0%, #dff5ff 48%, #f5fff9 100%)'
        : 'linear-gradient(155deg, #06080d 0%, #10141d 48%, #171821 100%)',
    ].join(', '),
  );
  shell.style.setProperty(
    '--gaia-landing-bg',
    [
      light
        ? 'radial-gradient(ellipse at 75% 44%, rgba(164, 222, 244, 0.34), transparent 34%)'
        : `radial-gradient(circle at 76% 46%, ${rgbaCss(palette.brand, 0.2)}, transparent 34%)`,
      light
        ? 'radial-gradient(circle at 16% 20%, rgba(238, 229, 194, 0.34), transparent 30%)'
        : `radial-gradient(circle at 18% 18%, ${rgbaCss(palette.accent, 0.22)}, transparent 34%)`,
      light
        ? 'radial-gradient(ellipse at 92% 78%, rgba(125, 205, 173, 0.22), transparent 44%)'
        : `radial-gradient(circle at 82% 16%, ${rgbaCss(palette.alt, 0.14)}, transparent 30%)`,
      light
        ? 'radial-gradient(ellipse at 36% 82%, rgba(115, 190, 210, 0.18), transparent 46%)'
        : `radial-gradient(circle at 50% 92%, ${rgbaCss(palette.brand, 0.12)}, transparent 38%)`,
      light
        ? 'linear-gradient(145deg, #eef9fb 0%, #d7eef5 34%, #cfe8e4 66%, #eef4df 100%)'
        : 'linear-gradient(155deg, #05080d 0%, #0d1720 48%, #151821 100%)',
    ].join(', '),
  );
  shell.style.setProperty(
    '--gaia-messages-bg',
    [
      `radial-gradient(circle at 20% 14%, ${rgbaCss(palette.accent, light ? 0.32 : 0.2)}, transparent 34%)`,
      `radial-gradient(circle at 82% 18%, ${rgbaCss(palette.alt, light ? 0.2 : 0.13)}, transparent 30%)`,
      `radial-gradient(circle at 50% 92%, ${rgbaCss(palette.brand, light ? 0.14 : 0.22)}, transparent 42%)`,
      light
        ? 'linear-gradient(150deg, #f4fbff 0%, #daf5ff 44%, #f2fff8 100%)'
        : 'linear-gradient(150deg, #06111d 0%, #082033 45%, #071019 100%)',
    ].join(', '),
  );
  shell.style.setProperty(
    '--gaia-settings-surface-bg',
    [
      `radial-gradient(circle at 18% 10%, ${rgbaCss(palette.accent, light ? 0.24 : 0.09)}, transparent 32%)`,
      `radial-gradient(circle at 82% 18%, ${rgbaCss(palette.alt, light ? 0.16 : 0.055)}, transparent 28%)`,
      light
        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(146, 219, 255, 0.1) 48%, rgba(242, 255, 249, 0.1))'
        : 'linear-gradient(180deg, rgba(4, 8, 14, 0.12), rgba(4, 8, 14, 0.2))',
    ].join(', '),
  );
  shell.style.setProperty(
    '--gaia-messages-surface-bg',
    [
      `radial-gradient(circle at 18% 10%, ${rgbaCss(palette.accent, light ? 0.2 : 0.09)}, transparent 32%)`,
      light
        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(146, 219, 255, 0.1))'
        : 'linear-gradient(180deg, rgba(4, 8, 14, 0.1), rgba(4, 8, 14, 0.18))',
    ].join(', '),
  );
  shell.style.setProperty(
    '--static-pane-blur-texture',
    [
      `radial-gradient(220px 180px at 18% 12%, ${rgbaCss(palette.glow, light ? 0.18 : 0.1)}, transparent 66%)`,
      `radial-gradient(260px 220px at 84% 34%, ${rgbaCss(palette.alt, light ? 0.09 : 0.055)}, transparent 68%)`,
      `radial-gradient(210px 180px at 52% 86%, ${rgbaCss(palette.accent, light ? 0.095 : 0.055)}, transparent 72%)`,
      light
        ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 42%, rgba(255, 255, 255, 0.04))'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 42%, rgba(255, 255, 255, 0.02))',
    ].join(', '),
  );
  shell.style.setProperty(
    '--static-control-bg',
    `linear-gradient(180deg, rgba(235, 247, 255, ${light ? 0.14 : 0.07}), ${rgbaCss(palette.accent, light ? 0.038 : 0.024)}), ${light ? 'rgba(255, 255, 255, 0.12)' : 'rgba(5, 16, 27, 0.3)'}`,
  );
  shell.style.setProperty(
    '--server-page-loader-spinner-bg',
    `conic-gradient(from 0deg, ${rgbaCss(palette.accent, 0)}, ${rgbaCss(palette.accent, 0.92)}, ${rgbaCss(palette.alt, 0.74)}, ${rgbaCss(palette.accent, 0)}), ${light ? 'rgba(255, 255, 255, 0.62)' : 'rgba(235, 247, 255, 0.06)'}`,
  );
  shell.style.setProperty(
    '--server-page-loader-row-shimmer',
    `linear-gradient(90deg, ${rgbaCss(palette.accent, 0)}, rgba(235, 247, 255, ${light ? 0.36 : 0.42}), ${rgbaCss(palette.alt, 0)})`,
  );

  if (
    !clientAuthStatus.authenticated ||
    activeView === 'messages' ||
    activeView === 'notifications' ||
    activeView === 'settings'
  ) {
    setRailGlassColor(palette.rail.red, palette.rail.green, palette.rail.blue);
  }
}

function settingsEqual(left: GaiaSettings, right: GaiaSettings): boolean {
  return (
    left.startupView === right.startupView &&
    left.lastContentView === right.lastContentView &&
    left.appearanceMode === right.appearanceMode &&
    left.accentColor === right.accentColor &&
    left.density === right.density &&
    left.reducedMotion === right.reducedMotion &&
    left.gifPlayback === right.gifPlayback &&
    left.animatedCurrentBackgrounds === right.animatedCurrentBackgrounds &&
    left.fastGraphicsMode === right.fastGraphicsMode &&
    left.perfProbe === right.perfProbe &&
    soundSettingsEqual(left.sound, right.sound) &&
    videoSettingsEqual(left.video, right.video) &&
    p2pVoiceSettingsEqual(left.p2pVoice, right.p2pVoice)
  );
}

function soundSettingsEqual(left: GaiaSoundSettings, right: GaiaSoundSettings): boolean {
  return (
    left.inputDeviceId === right.inputDeviceId &&
    left.outputDeviceId === right.outputDeviceId &&
    left.outputVolume === right.outputVolume &&
    left.noiseSuppression === right.noiseSuppression &&
    left.echoCancellation === right.echoCancellation &&
    left.autoGainControl === right.autoGainControl &&
    left.pushToTalkMode === right.pushToTalkMode &&
    left.pushToTalkKey === right.pushToTalkKey
  );
}

function videoSettingsEqual(left: GaiaVideoSettings, right: GaiaVideoSettings): boolean {
  return (
    left.cameraDeviceId === right.cameraDeviceId &&
    left.cameraResolution === right.cameraResolution &&
    left.cameraFrameRate === right.cameraFrameRate &&
    left.mirrorPreview === right.mirrorPreview
  );
}

function p2pVoiceSettingsEqual(left: GaiaP2PVoiceSettings, right: GaiaP2PVoiceSettings): boolean {
  if (left.turnServers.length !== right.turnServers.length) {
    return false;
  }
  return left.turnServers.every((server, index) => {
    const other = right.turnServers[index];
    return (
      other &&
      server.turnUrl === other.turnUrl &&
      server.turnsUrl === other.turnsUrl &&
      server.username === other.username &&
      server.credential === other.credential
    );
  });
}

function isSettingsDirty(): boolean {
  return Boolean(settingsDraft && !settingsEqual(settingsDraft, currentSettings()));
}

function syncPerfProbeStorage(enabled: boolean): void {
  if (enabled) {
    window.localStorage.setItem('gaia.perfProbe', '1');
  } else {
    window.localStorage.removeItem('gaia.perfProbe');
  }
}

function shouldPlayGifMedia(): boolean {
  const mode = currentSettings().gifPlayback;
  if (mode === 'never') {
    return false;
  }
  if (mode === 'focused') {
    return document.hasFocus() && activeView === 'messages';
  }
  return true;
}

function syncVisibleGifPlayback(): void {
  shell.dataset.gifPlayback = currentSettings().gifPlayback;
  const play = shouldPlayGifMedia();
  document.querySelectorAll<HTMLVideoElement>('.gif-preview-video').forEach((video) => {
    if (play) {
      void video.play().catch(() => {
        // Browser policy can still veto autoplay; the message remains visible.
      });
    } else {
      video.pause();
    }
  });
}

function resolveAppearanceMode(settings = currentSettings()): 'light' | 'dark' {
  return settings.appearanceMode === 'auto'
    ? systemAppearanceQuery.matches
      ? 'dark'
      : 'light'
    : settings.appearanceMode;
}

function playAppearanceTransition(
  previousMode: 'light' | 'dark' | undefined,
  nextMode: 'light' | 'dark',
  settings = currentSettings(),
): void {
  if (!previousMode || previousMode === nextMode || settings.reducedMotion) {
    return;
  }

  if (appearanceTransitionTimer) {
    window.clearTimeout(appearanceTransitionTimer);
    appearanceTransitionTimer = undefined;
  }

  appearanceTransitionOverlay.dataset.from = previousMode;
  appearanceTransitionOverlay.classList.remove('is-running');
  void appearanceTransitionOverlay.offsetWidth;
  appearanceTransitionOverlay.classList.add('is-running');

  appearanceTransitionTimer = window.setTimeout(() => {
    appearanceTransitionOverlay.classList.remove('is-running');
    appearanceTransitionOverlay.removeAttribute('data-from');
    appearanceTransitionTimer = undefined;
  }, APPEARANCE_TRANSITION_MS + 80);
}

function applyAppearanceMode(settings = currentSettings()): void {
  const previousResolvedMode = shell.dataset.resolvedAppearance as 'light' | 'dark' | undefined;
  const nextResolvedMode = resolveAppearanceMode(settings);
  playAppearanceTransition(previousResolvedMode, nextResolvedMode, settings);
  shell.dataset.appearanceMode = settings.appearanceMode;
  shell.dataset.resolvedAppearance = nextResolvedMode;
}

function applyAppSettings(settings = currentSettings()): void {
  const previousAnimatedBackgrounds = shell.dataset.animatedCurrentBackgrounds;
  applyAppearanceMode(settings);
  applyAccentColor(settings);
  shell.dataset.density = settings.density;
  shell.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  shell.dataset.gifPlayback = settings.gifPlayback;
  shell.dataset.animatedCurrentBackgrounds = settings.animatedCurrentBackgrounds ? 'enabled' : 'disabled';
  shell.dataset.fastGraphics = settings.fastGraphicsMode ? 'true' : 'false';
  syncPerfProbeStorage(settings.perfProbe);
  p2pVoiceService.setIceConfig(p2pVoiceIceConfigFromSettings(settings.p2pVoice));
  syncVisibleGifPlayback();
  renderFloatingLiquidGlassSurfaces();
  if (
    previousAnimatedBackgrounds &&
    previousAnimatedBackgrounds !== shell.dataset.animatedCurrentBackgrounds &&
    activeView === 'server'
  ) {
    const server = selectedServer();
    const cachedBackground = server ? serverBackgroundCache.get(server.id) : undefined;
    if (server && cachedBackground) {
      setServerBackgroundSnapshot(server.id, cachedBackground);
    }
    void refreshCurrentAppearance();
  }
  syncLandingScene(!clientAuthStatus.authenticated);
}

function threeColorFromRgb(color: RgbColor): THREE.Color {
  return new THREE.Color(color.red / 255, color.green / 255, color.blue / 255);
}

function landingGlobeTheme(): LandingGlobeTheme {
  const mode = shell.dataset.resolvedAppearance === 'light' ? 'light' : 'dark';
  const palette = resolveAccentPalette((settingsDraft ?? currentSettings()).accentColor, mode);
  return {
    accentHex: palette.accentHex,
    accent: threeColorFromRgb(palette.accent),
    alt: threeColorFromRgb(palette.alt),
    brand: threeColorFromRgb(palette.brand),
    glow: threeColorFromRgb(palette.glow),
    light: mode === 'light',
    mode,
    palette,
  };
}

function landingOzoneBlue(theme: LandingGlobeTheme): THREE.Color {
  return theme.light ? new THREE.Color(0x74cfff) : new THREE.Color(0x95e8ff);
}

function landingStreamGreen(theme: LandingGlobeTheme): THREE.Color {
  return theme.light ? new THREE.Color(0x58c96f) : new THREE.Color(0x98ee84);
}

function landingGlobePoint(lat: number, lon: number, radius = LANDING_GLOBE_RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function configureLandingGlobeTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createLandingAtmosphereMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.BackSide,
    transparent: true,
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDirection = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewDirection;

      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDirection)));
        float horizon = smoothstep(0.31, 0.4, rim);
        float outwardFade = 1.0 - smoothstep(0.42, 0.98, rim);
        float halo = horizon * outwardFade;
        float band = smoothstep(0.36, 0.96, rim);
        vec3 themeBlue = mix(vec3(0.48, 0.82, 1.0), uColor, 0.28);
        vec3 paleCyan = vec3(0.68, 0.95, 1.0);
        vec3 brightBlue = mix(vec3(0.2, 0.66, 0.94), themeBlue, 0.45);
        vec3 outerBlue = mix(vec3(0.05, 0.28, 0.62), themeBlue, 0.18);
        vec3 haloColor = mix(paleCyan, brightBlue, smoothstep(0.0, 0.18, band));
        haloColor = mix(haloColor, outerBlue, smoothstep(0.5, 1.0, band));
        gl_FragColor = vec4(haloColor, halo * uOpacity);
      }
    `,
  });
}

function createLandingEarthMaterial(theme: LandingGlobeTheme, texture: THREE.Texture): LandingEarthMaterial {
  if (theme.light) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
    });
    material.toneMapped = false;
    return material;
  }

  return new THREE.MeshStandardMaterial({
    color: 0xe9fbff,
    emissive: theme.brand,
    emissiveIntensity: 0.07,
    map: texture,
    metalness: 0.05,
    roughness: 0.5,
  });
}

function applyLandingEarthMaterialTheme(material: LandingEarthMaterial, theme: LandingGlobeTheme): void {
  material.color.set(theme.light ? 0xffffff : 0xe9fbff);
  if (material instanceof THREE.MeshStandardMaterial) {
    material.emissive.copy(theme.brand);
    material.emissiveIntensity = 0.07;
  }
}

function createLandingGlobeTexture(theme: LandingGlobeTheme): THREE.Texture {
  const mode = theme.light ? 'light' : 'dark';
  const cachedTexture = landingGlobeTextureCache[mode];
  if (cachedTexture) {
    return cachedTexture;
  }

  const globeUrl = theme.light ? GAIA_GLOBE_LIGHT_URL : GAIA_GLOBE_URL;
  const texture = new THREE.TextureLoader().load(globeUrl, (loadedTexture) => {
    configureLandingGlobeTexture(loadedTexture);
    if (landingGlobeRuntime?.earthMaterial.map === loadedTexture) {
      landingGlobeRuntime.earthMaterial.needsUpdate = true;
      drawLandingScene();
    }
  });
  landingGlobeTextureCache[mode] = configureLandingGlobeTexture(texture);
  return landingGlobeTextureCache[mode];
}

function createLandingGlobeGridGeometry(radius = LANDING_GLOBE_RADIUS + 0.01): THREE.BufferGeometry {
  const points: number[] = [];
  const pushSegment = (start: THREE.Vector3, end: THREE.Vector3): void => {
    points.push(start.x, start.y, start.z, end.x, end.y, end.z);
  };

  for (let lat = -60; lat <= 60; lat += 15) {
    for (let lon = -180; lon < 180; lon += 6) {
      pushSegment(landingGlobePoint(lat, lon, radius), landingGlobePoint(lat, lon + 6, radius));
    }
  }
  for (let lon = -180; lon < 180; lon += 15) {
    for (let lat = -75; lat < 75; lat += 6) {
      pushSegment(landingGlobePoint(lat, lon, radius), landingGlobePoint(lat + 6, lon, radius));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function createLandingCityGeometry(radius = LANDING_GLOBE_RADIUS + 0.035): THREE.BufferGeometry {
  const points: number[] = [];
  LANDING_GLOBE_CITIES.forEach(({ lat, lon }) => {
    const point = landingGlobePoint(lat, lon, radius);
    points.push(point.x, point.y, point.z);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function createLandingArcGeometry(radius = LANDING_GLOBE_RADIUS + 0.04): THREE.BufferGeometry {
  const points: number[] = [];
  const pushPoint = (point: THREE.Vector3): void => {
    points.push(point.x, point.y, point.z);
  };

  LANDING_GLOBE_ARCS.forEach(([fromIndex, toIndex]) => {
    const from = LANDING_GLOBE_CITIES[fromIndex];
    const to = LANDING_GLOBE_CITIES[toIndex];
    if (!from || !to) {
      return;
    }
    const start = landingGlobePoint(from.lat, from.lon, radius);
    const end = landingGlobePoint(to.lat, to.lon, radius);
    const segments = 28;
    for (let segment = 0; segment < segments; segment += 1) {
      const startT = segment / segments;
      const endT = (segment + 1) / segments;
      const a = start.clone().lerp(end, startT).normalize().multiplyScalar(radius + Math.sin(startT * Math.PI) * 0.44);
      const b = start.clone().lerp(end, endT).normalize().multiplyScalar(radius + Math.sin(endT * Math.PI) * 0.44);
      pushPoint(a);
      pushPoint(b);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function createLandingStarGeometry(): THREE.BufferGeometry {
  const points: number[] = [];
  let seed = 9167;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let index = 0; index < 280; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    const radius = 7.5 + random() * 7;
    points.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius,
      Math.sin(phi) * Math.sin(theta) * radius - 1.4,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function updateLandingGlobeTheme(runtime: LandingGlobeRuntime): void {
  const theme = landingGlobeTheme();
  const ozoneBlue = landingOzoneBlue(theme);
  const streamGreen = landingStreamGreen(theme);
  if (runtime.lastAccentHex !== theme.accentHex || runtime.lastMode !== theme.mode) {
    runtime.lastAccentHex = theme.accentHex;
    runtime.lastMode = theme.mode;
  }

  const texture = createLandingGlobeTexture(theme);
  const shouldUseBasicEarthMaterial = theme.light;
  const materialMatchesMode =
    (shouldUseBasicEarthMaterial && runtime.earthMaterial instanceof THREE.MeshBasicMaterial) ||
    (!shouldUseBasicEarthMaterial && runtime.earthMaterial instanceof THREE.MeshStandardMaterial);
  if (!materialMatchesMode) {
    runtime.earthMaterial.dispose();
    runtime.earthMaterial = createLandingEarthMaterial(theme, texture);
    runtime.earth.material = runtime.earthMaterial;
    runtime.texture = texture;
  } else if (runtime.texture !== texture) {
    runtime.texture = texture;
    runtime.earthMaterial.map = texture;
    runtime.earthMaterial.needsUpdate = true;
  }
  applyLandingEarthMaterialTheme(runtime.earthMaterial, theme);
  runtime.atmosphereMaterial.uniforms.uColor.value.copy(ozoneBlue);
  runtime.atmosphereMaterial.uniforms.uOpacity.value = theme.light ? 0.44 : 0.58;
  runtime.gridMaterial.color.copy(ozoneBlue);
  runtime.gridMaterial.opacity = theme.light ? 0.075 : 0.095;
  runtime.cityMaterial.color.copy(theme.alt);
  runtime.cityMaterial.opacity = theme.light ? 0.54 : 0.66;
  runtime.arcMaterial.color.copy(streamGreen);
  runtime.arcMaterial.opacity = theme.light ? 0.3 : 0.4;
  runtime.orbitMaterial.color.copy(streamGreen);
  runtime.orbitMaterial.opacity = theme.light ? 0.24 : 0.36;
  runtime.rimLight.color.copy(streamGreen);
  runtime.rimLight.intensity = theme.light ? 1.25 : 1.65;
  runtime.starMaterial.color.copy(theme.light ? theme.brand : new THREE.Color(0xc7f1ff));
  runtime.starMaterial.opacity = theme.light ? 0.24 : 0.34;
}

function createLandingGlobeRuntime(): LandingGlobeRuntime {
  const theme = landingGlobeTheme();
  const ozoneBlue = landingOzoneBlue(theme);
  const streamGreen = landingStreamGreen(theme);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas: landingSceneCanvas,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 5.6);

  const texture = createLandingGlobeTexture(theme);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const earthMaterial = createLandingEarthMaterial(theme, texture);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(LANDING_GLOBE_RADIUS, 96, 96), earthMaterial);

  const atmosphereMaterial = createLandingAtmosphereMaterial(ozoneBlue, theme.light ? 0.44 : 0.58);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(LANDING_GLOBE_RADIUS * 1.3, 128, 128), atmosphereMaterial);

  const gridMaterial = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: ozoneBlue,
    depthWrite: false,
    opacity: theme.light ? 0.075 : 0.095,
    transparent: true,
  });
  const gridLines = new THREE.LineSegments(createLandingGlobeGridGeometry(), gridMaterial);

  const cityMaterial = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    color: theme.alt,
    depthWrite: false,
    opacity: theme.light ? 0.54 : 0.66,
    size: 0.035,
    transparent: true,
  });
  const cityPoints = new THREE.Points(createLandingCityGeometry(), cityMaterial);

  const arcMaterial = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: streamGreen,
    depthWrite: false,
    opacity: theme.light ? 0.3 : 0.4,
    transparent: true,
  });
  const connectionArcs = new THREE.LineSegments(createLandingArcGeometry(), arcMaterial);

  const orbitMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: streamGreen,
    depthWrite: false,
    opacity: theme.light ? 0.24 : 0.36,
    transparent: true,
  });
  const orbitRings = new THREE.Group();
  [
    { radius: 2.02, tiltX: 1.08, tiltY: -0.26, tiltZ: 0.26 },
    { radius: 2.18, tiltX: 1.34, tiltY: 0.42, tiltZ: -0.18 },
    { radius: 2.34, tiltX: 0.92, tiltY: -0.62, tiltZ: 0.62 },
  ].forEach((ring) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, 0.0055, 8, 240), orbitMaterial);
    mesh.rotation.set(ring.tiltX, ring.tiltY, ring.tiltZ);
    orbitRings.add(mesh);
  });

  const starMaterial = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    color: theme.light ? theme.brand : new THREE.Color(0xc7f1ff),
    depthWrite: false,
    opacity: theme.light ? 0.24 : 0.34,
    size: 0.025,
    transparent: true,
  });
  const stars = new THREE.Points(createLandingStarGeometry(), starMaterial);
  scene.add(stars);

  const globeRoot = new THREE.Group();
  globeRoot.add(atmosphere, earth, gridLines, connectionArcs, cityPoints, orbitRings);
  scene.add(globeRoot);

  scene.add(new THREE.AmbientLight(0xffffff, theme.light ? 1.08 : 0.64));
  const keyLight = new THREE.DirectionalLight(0xffffff, theme.light ? 1.24 : 0.98);
  keyLight.position.set(-2.2, 2.6, 4.4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(streamGreen, theme.light ? 1.25 : 1.65, 8);
  rimLight.position.set(2.8, -1.8, 2.2);
  scene.add(rimLight);

  return {
    renderer,
    scene,
    camera,
    globeRoot,
    earth,
    atmosphere,
    gridLines,
    cityPoints,
    connectionArcs,
    orbitRings,
    stars,
    earthMaterial,
    atmosphereMaterial,
    gridMaterial,
    cityMaterial,
    arcMaterial,
    orbitMaterial,
    starMaterial,
    rimLight,
    texture,
    lastAccentHex: theme.accentHex,
    lastMode: theme.mode,
    pointerX: 0,
    pointerY: 0,
  };
}

function ensureLandingGlobeRuntime(): LandingGlobeRuntime {
  if (!landingGlobeRuntime) {
    landingGlobeRuntime = createLandingGlobeRuntime();
    landingSceneUnavailable = false;
    landingSceneCanvas.classList.remove('is-unavailable');
  }
  updateLandingGlobeTheme(landingGlobeRuntime);
  return landingGlobeRuntime;
}

function resizeLandingGlobe(runtime: LandingGlobeRuntime): void {
  const rect = landingSceneCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  if (
    width === landingSceneWidth &&
    height === landingSceneHeight &&
    pixelRatio === landingScenePixelRatio &&
    landingSceneReady
  ) {
    return;
  }

  landingSceneWidth = width;
  landingSceneHeight = height;
  landingScenePixelRatio = pixelRatio;
  landingSceneReady = true;
  runtime.renderer.setPixelRatio(pixelRatio);
  runtime.renderer.setSize(width, height, false);
  runtime.camera.aspect = width / height;
  runtime.camera.fov = width < 760 ? 48 : 40;
  runtime.camera.position.z = width < 760 ? 6.25 : 5.45;
  runtime.camera.updateProjectionMatrix();
}

function drawLandingScene(now = performance.now()): void {
  if (landingSceneUnavailable) {
    return;
  }

  let runtime: LandingGlobeRuntime;
  try {
    runtime = ensureLandingGlobeRuntime();
  } catch {
    landingSceneUnavailable = true;
    landingSceneCanvas.classList.add('is-unavailable');
    return;
  }
  resizeLandingGlobe(runtime);

  const time = now / 1000;
  runtime.pointerX = THREE.MathUtils.damp(runtime.pointerX, landingScenePointer.yaw, 5.2, 1 / 60);
  runtime.pointerY = THREE.MathUtils.damp(runtime.pointerY, landingScenePointer.pitch, 5.2, 1 / 60);

  const narrow = landingSceneWidth < 760;
  const scale = narrow ? 1.03 : 1.18;
  runtime.globeRoot.scale.setScalar(scale);
  runtime.globeRoot.position.set(narrow ? 0.78 : 1.34, narrow ? -0.72 : -0.08, 0);
  runtime.globeRoot.rotation.x = -0.1 + runtime.pointerY;
  runtime.globeRoot.rotation.y = -0.74 + time * 0.085 + runtime.pointerX;
  runtime.globeRoot.rotation.z = 0.08;
  runtime.orbitRings.rotation.y = time * -0.11;
  runtime.connectionArcs.rotation.y = Math.sin(time * 0.34) * 0.035;
  runtime.stars.rotation.y = time * 0.012;
  runtime.stars.rotation.x = Math.sin(time * 0.08) * 0.02;

  runtime.renderer.render(runtime.scene, runtime.camera);
}

function isLandingGlobeDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }
  return !target.closest('button, a, input, textarea, select, [role="button"]');
}

function finishLandingGlobeDrag(event?: PointerEvent): void {
  if (!landingScenePointer.dragging) {
    return;
  }
  landingScenePointer.dragging = false;
  signedOutScreen.classList.remove('is-dragging-globe');
  if (event && signedOutScreen.hasPointerCapture(event.pointerId)) {
    signedOutScreen.releasePointerCapture(event.pointerId);
  }
}

function stopLandingScene(): void {
  if (landingSceneFrame) {
    window.cancelAnimationFrame(landingSceneFrame);
    landingSceneFrame = undefined;
  }
}

function tickLandingScene(now: number): void {
  drawLandingScene(now);
  landingSceneFrame = window.requestAnimationFrame(tickLandingScene);
}

function syncLandingScene(visible: boolean): void {
  if (!visible) {
    stopLandingScene();
    return;
  }

  drawLandingScene();
  if (currentSettings().reducedMotion) {
    stopLandingScene();
    return;
  }

  if (!landingSceneFrame) {
    landingSceneFrame = window.requestAnimationFrame(tickLandingScene);
  }
}

function resolveStartupView(settings: GaiaSettings): ContentView {
  if (settings.startupView === 'server' || settings.startupView === 'messages') {
    return settings.startupView;
  }
  return settings.lastContentView;
}

function resolveInitialActiveView(): void {
  if (startupViewResolved) {
    return;
  }

  startupViewResolved = true;
  activeView = resolveStartupView(currentSettings());
  lastContentView = activeView;
}

async function persistSettingsPatch(patch: GaiaSettingsPatch): Promise<void> {
  if (!store) {
    return;
  }

  const hadDirtyDraft = isSettingsDirty();
  try {
    store = await window.gaia.updateSettings(patch);
    if (!hadDirtyDraft) {
      settingsDraft = activeView === 'settings' ? cloneSettings(store.settings) : null;
    }
    applyAppSettings(store.settings);
    if (activeView === 'settings') {
      renderSettingsWorkspace();
    }
  } catch {
    // Last-view persistence is opportunistic; avoid interrupting navigation.
  }
}

function rememberContentView(view: ContentView): void {
  lastContentView = view;
  if (!store || store.settings.lastContentView === view) {
    return;
  }
  void persistSettingsPatch({ lastContentView: view });
}

function notificationBadgeText(count: number): string {
  return count > 20 ? '20+' : String(count);
}

function notificationKindLabel(notification: GaiaNotification): string {
  if (notification.kind === 'current_reply') {
    return 'Reply';
  }
  if (notification.kind === 'current_message') {
    return 'Message';
  }
  return 'Mention';
}

function notificationSourceText(notification: GaiaNotification): string {
  return notification.channelName
    ? `${notification.serverName} / #${notification.channelName}`
    : notification.serverName;
}

function formatNotificationTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) {
    return 'now';
  }

  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function formatNotificationDetailTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function isNotificationUnread(notification: GaiaNotification): boolean {
  return !notification.readAt;
}

function ensureSelectedNotification(): void {
  const notifications = notificationCenterState.notifications;
  if (notifications.length === 0) {
    selectedNotificationId = null;
    return;
  }

  if (selectedNotificationId && notifications.some((notification) => notification.id === selectedNotificationId)) {
    return;
  }

  selectedNotificationId = notifications.find(isNotificationUnread)?.id ?? notifications[0]?.id ?? null;
}

function selectedNotification(): GaiaNotification | null {
  ensureSelectedNotification();
  return (
    notificationCenterState.notifications.find((notification) => notification.id === selectedNotificationId) ?? null
  );
}

function createNotificationAvatar(notification: GaiaNotification, className: string): HTMLSpanElement {
  const avatar = document.createElement('span');
  avatar.className = className;
  if (notification.authorAvatarUrl) {
    avatar.style.backgroundImage = `url("${notification.authorAvatarUrl}")`;
  } else {
    avatar.textContent = notification.authorName.trim().slice(0, 1).toUpperCase() || '?';
  }
  return avatar;
}

function renderNotificationBadge(): void {
  const count = notificationCenterState.unreadCount;
  notificationBadge.classList.toggle('hidden', count <= 0);
  notificationBadge.textContent = count > 0 ? notificationBadgeText(count) : '';
  notificationCenterButton.setAttribute(
    'aria-label',
    count > 0 ? `Notifications, ${notificationBadgeText(count)} unread` : 'Notifications',
  );
}

function createNotificationDetailField(labelText: string, valueText: string): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'notification-detail-field';

  const label = document.createElement('dt');
  label.textContent = labelText;

  const value = document.createElement('dd');
  value.textContent = valueText;

  field.append(label, value);
  return field;
}

function createNotificationEmptyDetail(): HTMLDivElement {
  const empty = document.createElement('div');
  empty.className = 'notification-detail-empty';

  const title = document.createElement('strong');
  title.textContent = 'No notifications yet.';

  const copy = document.createElement('span');
  copy.textContent = 'Messages, replies, and mentions will appear here with their server, channel, sender, and message details.';

  empty.append(title, copy);
  return empty;
}

function createNotificationDetail(notification: GaiaNotification): HTMLElement {
  const unread = isNotificationUnread(notification);
  const detail = document.createElement('article');
  detail.className = 'notification-detail-content';
  detail.dataset.unread = unread ? 'true' : 'false';

  const hero = document.createElement('section');
  hero.className = 'notification-detail-hero';

  const avatar = createNotificationAvatar(notification, 'notification-detail-avatar');

  const copy = document.createElement('div');
  copy.className = 'notification-detail-copy';

  const kicker = document.createElement('div');
  kicker.className = 'notification-detail-kicker';

  const kind = document.createElement('span');
  kind.className = 'notification-kind-chip';
  kind.textContent = notificationKindLabel(notification);

  const status = document.createElement('span');
  status.className = 'notification-status-chip';
  status.dataset.unread = unread ? 'true' : 'false';
  status.textContent = unread ? 'Unread' : 'Read';

  kicker.append(kind, status);

  const title = document.createElement('h2');
  title.textContent = notification.title;

  const source = document.createElement('span');
  source.className = 'notification-detail-source';
  source.textContent = notificationSourceText(notification);

  copy.append(kicker, title, source);
  hero.append(avatar, copy);

  const message = document.createElement('p');
  message.className = 'notification-detail-message';
  message.textContent = notification.body.trim() || 'No message preview was included with this notification.';

  const fields = document.createElement('dl');
  fields.className = 'notification-detail-grid';
  fields.append(
    createNotificationDetailField(
      'From',
      notification.authorHandle ? `${notification.authorName} (${notification.authorHandle})` : notification.authorName,
    ),
    createNotificationDetailField('Server', notification.serverName),
    createNotificationDetailField('Channel', notification.channelName ? `#${notification.channelName}` : 'Server default'),
    createNotificationDetailField('Received', formatNotificationDetailTime(notification.createdAt)),
    createNotificationDetailField('Status', unread ? 'Unread' : `Read ${formatNotificationDetailTime(notification.readAt ?? '')}`),
  );

  const actions = document.createElement('div');
  actions.className = 'notification-detail-actions';

  const openButton = document.createElement('button');
  openButton.className = 'notification-detail-action notification-detail-action-primary';
  openButton.type = 'button';
  openButton.textContent = 'Open Current Server';
  openButton.addEventListener('click', () => {
    void openNotification(notification);
  });

  const markButton = document.createElement('button');
  markButton.className = 'notification-detail-action';
  markButton.type = 'button';
  markButton.textContent = unread ? 'Mark Read' : 'Already Read';
  markButton.disabled = !unread;
  markButton.addEventListener('click', () => {
    void markNotificationRead(notification);
  });

  actions.append(openButton, markButton);
  detail.append(hero, message, fields, actions);
  return detail;
}

function createNotificationItem(notification: GaiaNotification): HTMLButtonElement {
  const unread = isNotificationUnread(notification);
  const item = document.createElement('button');
  item.className = 'notification-item';
  item.type = 'button';
  item.dataset.unread = unread ? 'true' : 'false';
  item.dataset.selected = notification.id === selectedNotificationId ? 'true' : 'false';
  item.dataset.notificationId = notification.id;
  item.setAttribute('aria-pressed', notification.id === selectedNotificationId ? 'true' : 'false');

  const avatar = createNotificationAvatar(notification, 'notification-avatar');

  const body = document.createElement('span');
  body.className = 'notification-copy';

  const meta = document.createElement('span');
  meta.className = 'notification-meta';
  const kind = document.createElement('strong');
  kind.textContent = notificationKindLabel(notification);
  const readState = document.createElement('span');
  readState.className = 'notification-read-state';
  readState.dataset.unread = unread ? 'true' : 'false';
  readState.textContent = unread ? 'Unread' : 'Read';
  const source = document.createElement('span');
  source.textContent = notificationSourceText(notification);
  meta.append(kind, readState, source);

  const title = document.createElement('span');
  title.className = 'notification-title';
  title.textContent = notification.title;

  const preview = document.createElement('span');
  preview.className = 'notification-preview';
  preview.textContent = notification.body;

  body.append(meta, title, preview);

  const time = document.createElement('span');
  time.className = 'notification-time';
  time.textContent = formatNotificationTime(notification.createdAt);

  item.append(avatar, body, time);
  item.addEventListener('click', () => {
    selectNotification(notification.id);
  });
  item.addEventListener('dblclick', () => {
    void openNotification(notification);
  });
  return item;
}

function renderNotificationDetail(): void {
  const notification = selectedNotification();
  notificationDetailBody.replaceChildren(notification ? createNotificationDetail(notification) : createNotificationEmptyDetail());
}

function selectNotification(notificationId: string): void {
  selectedNotificationId = notificationId;
  notificationCenterList.querySelectorAll<HTMLButtonElement>('.notification-item').forEach((item) => {
    const selected = item.dataset.notificationId === notificationId;
    item.dataset.selected = selected ? 'true' : 'false';
    item.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  renderNotificationDetail();
}

function renderNotificationCenter(): void {
  ensureSelectedNotification();
  const unreadCount = notificationCenterState.unreadCount;
  renderNotificationBadge();
  notificationCenterCount.textContent =
    unreadCount === 1 ? '1 unread' : `${notificationBadgeText(unreadCount)} unread`;
  notificationCenterMarkReadButton.disabled = unreadCount === 0;
  notificationCenterClearButton.disabled = notificationCenterState.notifications.length === 0;
  notificationCenterEmpty.classList.toggle('hidden', notificationCenterState.notifications.length > 0);
  notificationCenterList.replaceChildren(
    ...notificationCenterState.notifications.map((notification) => createNotificationItem(notification)),
  );
  renderNotificationDetail();
}

async function loadNotificationCenter(): Promise<void> {
  try {
    notificationCenterState = await window.gaia.getNotifications();
    renderNotificationCenter();
  } catch {
    notificationCenterState = { notifications: [], unreadCount: 0 };
    renderNotificationCenter();
  }
}

async function markNotificationRead(notification: GaiaNotification): Promise<void> {
  selectedNotificationId = notification.id;
  notificationCenterState = await window.gaia.markNotificationsRead([notification.id]);
  renderNotificationCenter();
}

async function openNotification(notification: GaiaNotification): Promise<void> {
  if (store?.servers.some((server) => server.id === notification.serverId)) {
    switchToServerView();
    await selectServer(notification.serverId);
  }
  notificationCenterState = await window.gaia.markNotificationsRead([notification.id]);
  renderNotificationCenter();
}

function filteredSettingsSections() {
  const query = settingsSearchQuery.trim().toLowerCase();
  if (!query) {
    return SETTINGS_SECTIONS;
  }
  return SETTINGS_SECTIONS.filter((section) => {
    return `${section.title} ${section.summary} ${section.searchText}`.toLowerCase().includes(query);
  });
}

function createSettingsCard(title: string, summary: string): HTMLElement {
  const card = document.createElement('section');
  card.className = 'settings-card';
  const header = document.createElement('header');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = summary;
  header.append(heading, copy);
  card.append(header);
  return card;
}

function appendSettingsRow(parent: HTMLElement, title: string, summary: string, control: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const copy = document.createElement('span');
  copy.className = 'settings-row-copy';
  const label = document.createElement('strong');
  label.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = summary;
  copy.append(label, detail);
  row.append(copy, control);
  parent.append(row);
}

function createSegmentedControl<T extends string>(
  label: string,
  options: Array<{ value: T; label: string }>,
  value: T,
  onSelect: (value: T) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.dataset.active = option.value === value ? 'true' : 'false';
    button.setAttribute('aria-pressed', option.value === value ? 'true' : 'false');
    button.addEventListener('click', () => onSelect(option.value));
    group.append(button);
  }
  return group;
}

function createSettingsToggle(label: string, active: boolean, onToggle: (active: boolean) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-toggle';
  button.dataset.active = active ? 'true' : 'false';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-checked', active ? 'true' : 'false');
  button.append(document.createElement('span'));
  button.addEventListener('click', () => onToggle(!active));
  return button;
}

function createSettingsSelect<T extends string>(
  label: string,
  options: Array<{ value: T; label: string }>,
  value: T,
  onSelect: (value: T) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'settings-select';
  select.setAttribute('aria-label', label);
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  select.value = value;
  select.addEventListener('change', () => onSelect(select.value as T));
  return select;
}

function updateAccentDraftColor(value: string, options: { render?: boolean } = {}): void {
  const accentColor = normalizeAccentColor(value);
  if (accentColor) {
    accentPickerDraftColor = accentColor;
    updateSettingsDraft({ accentColor }, options);
  }
}

function createAccentPickerControl(value: string): HTMLElement {
  const accentColor = normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
  accentPickerDraftColor = accentColor;
  const control = document.createElement('div');
  control.className = 'settings-accent-picker';

  const preview = document.createElement('label');
  preview.className = 'settings-accent-preview';
  preview.style.setProperty('--accent-preview', accentColor);
  preview.title = 'Choose accent color';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = accentColor;
  colorInput.setAttribute('aria-label', 'Accent color');
  colorInput.addEventListener('input', () => {
    preview.style.setProperty('--accent-preview', colorInput.value);
    hexInput.value = colorInput.value.toUpperCase();
    hexInput.dataset.invalid = 'false';
    updateAccentDraftColor(colorInput.value, { render: false });
  });
  colorInput.addEventListener('change', () => updateAccentDraftColor(colorInput.value));

  const previewSwirl = document.createElement('span');
  preview.append(colorInput, previewSwirl);

  const hexInput = document.createElement('input');
  hexInput.className = 'settings-accent-hex';
  hexInput.value = accentColor.toUpperCase();
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;
  hexInput.setAttribute('aria-label', 'Accent hex color');
  hexInput.addEventListener('input', () => {
    const normalized = normalizeAccentColor(hexInput.value);
    hexInput.dataset.invalid = normalized ? 'false' : 'true';
    if (normalized) {
      preview.style.setProperty('--accent-preview', normalized);
      colorInput.value = normalized;
      updateAccentDraftColor(normalized, { render: false });
    }
  });
  hexInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateAccentDraftColor(hexInput.value);
    }
  });
  hexInput.addEventListener('change', () => updateAccentDraftColor(hexInput.value));
  hexInput.addEventListener('blur', () => {
    const normalized = normalizeAccentColor(hexInput.value) ?? accentColor;
    hexInput.value = normalized.toUpperCase();
    hexInput.dataset.invalid = 'false';
    preview.style.setProperty('--accent-preview', normalized);
    updateAccentDraftColor(normalized, { render: false });
  });

  const swatches = document.createElement('div');
  swatches.className = 'settings-accent-swatches';
  for (const swatchColor of ACCENT_SWATCHES) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'settings-accent-swatch';
    swatch.style.setProperty('--swatch-color', swatchColor);
    swatch.dataset.active = swatchColor === accentColor ? 'true' : 'false';
    swatch.setAttribute('aria-label', `Use accent ${swatchColor}`);
    swatch.addEventListener('click', () => updateAccentDraftColor(swatchColor));
    swatches.append(swatch);
  }

  const defaultButton = createSettingsAction('Default', () => updateAccentDraftColor(DEFAULT_ACCENT_COLOR), accentColor === DEFAULT_ACCENT_COLOR);
  control.append(preview, hexInput, swatches, defaultButton);
  return control;
}

function createSettingsRange(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  formatValue: (value: number) => string,
): HTMLElement {
  const control = document.createElement('div');
  control.className = 'settings-range-control';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute('aria-label', label);
  const output = document.createElement('span');
  output.textContent = formatValue(value);
  input.addEventListener('input', () => {
    output.textContent = formatValue(input.valueAsNumber);
  });
  input.addEventListener('change', () => onChange(input.valueAsNumber));
  control.append(input, output);
  return control;
}

function createSettingsTextInput(
  label: string,
  value: string,
  placeholder: string,
  onChange: (value: string) => void,
  type: 'text' | 'password' | 'url' = 'text',
): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'settings-text-input';
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onChange(input.value.trim()));
  return input;
}

function defaultDeviceChoice<K extends MediaDeviceChoiceKind>(kind: K): K extends 'videoinput' ? VideoDeviceChoice : AudioDeviceChoice {
  const label =
    kind === 'audioinput'
      ? 'System default microphone'
      : kind === 'audiooutput'
        ? 'System default speakers'
        : 'System default camera';
  return {
    deviceId: 'default',
    label,
    kind,
  } as K extends 'videoinput' ? VideoDeviceChoice : AudioDeviceChoice;
}

function formatDeviceFallbackLabel(kind: MediaDeviceChoiceKind, index: number): string {
  if (kind === 'audioinput') {
    return `Microphone ${index + 1}`;
  }
  if (kind === 'videoinput') {
    return `Camera ${index + 1}`;
  }
  return `Speakers ${index + 1}`;
}

function toAudioDeviceChoices(devices: MediaDeviceInfo[], kind: AudioDeviceChoice['kind']): AudioDeviceChoice[] {
  const filtered = devices.filter((device) => device.kind === kind && device.deviceId && device.deviceId !== 'default');
  return [
    defaultDeviceChoice(kind),
    ...filtered.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || formatDeviceFallbackLabel(kind, index),
      kind,
    })),
  ];
}

function toVideoDeviceChoices(devices: MediaDeviceInfo[]): VideoDeviceChoice[] {
  const filtered = devices.filter((device) => device.kind === 'videoinput' && device.deviceId && device.deviceId !== 'default');
  return [
    defaultDeviceChoice('videoinput'),
    ...filtered.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || formatDeviceFallbackLabel('videoinput', index),
      kind: 'videoinput' as const,
    })),
  ];
}

function withSavedDeviceChoice(
  devices: AudioDeviceChoice[],
  deviceId: string,
  kind: AudioDeviceChoice['kind'],
): AudioDeviceChoice[] {
  const baseDevices = devices.length > 0 ? devices : [defaultDeviceChoice(kind)];
  if (!deviceId || baseDevices.some((device) => device.deviceId === deviceId)) {
    return baseDevices;
  }
  return [
    ...baseDevices,
    {
      deviceId,
      label: kind === 'audioinput' ? 'Saved microphone' : 'Saved speakers',
      kind,
    },
  ];
}

function withSavedVideoDeviceChoice(devices: VideoDeviceChoice[], deviceId: string): VideoDeviceChoice[] {
  const baseDevices = devices.length > 0 ? devices : [defaultDeviceChoice('videoinput')];
  if (!deviceId || baseDevices.some((device) => device.deviceId === deviceId)) {
    return baseDevices;
  }
  return [
    ...baseDevices,
    {
      deviceId,
      label: 'Saved camera',
      kind: 'videoinput',
    },
  ];
}

function audioDeviceChoiceExists(devices: AudioDeviceChoice[], deviceId: string): boolean {
  return deviceId === 'default' || devices.some((device) => device.deviceId === deviceId);
}

async function repairMissingOutputDevice(): Promise<void> {
  if (!store) {
    return;
  }

  const outputDeviceId = store.settings.sound.outputDeviceId;
  if (audioDeviceChoiceExists(audioOutputDevices, outputDeviceId)) {
    return;
  }

  console.warn(`[gaia:sound] Saved output device is unavailable; falling back to default (${outputDeviceId}).`);
  const hadDirtyDraft = isSettingsDirty();
  const nextSound: GaiaSoundSettings = {
    ...store.settings.sound,
    outputDeviceId: 'default',
  };

  store = await window.gaia.updateSettings({
    sound: nextSound,
  });
  if (settingsDraft) {
    settingsDraft = hadDirtyDraft
      ? {
          ...settingsDraft,
          sound: {
            ...settingsDraft.sound,
            outputDeviceId: 'default',
          },
        }
      : cloneSettings(store.settings);
  }
  applyAppSettings(store.settings);
}

async function refreshAudioDevices(requestPermission = false): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    audioDeviceLoadState = 'failed';
    audioDeviceMessage = 'Media devices are unavailable in this renderer.';
    renderSettingsWorkspace();
    return;
  }

  audioDeviceLoadState = 'loading';
  audioDeviceMessage = requestPermission ? 'Requesting device access...' : 'Scanning media devices...';
  renderSettingsWorkspace();

  let stream: MediaStream | undefined;
  try {
    if (requestPermission && navigator.mediaDevices.getUserMedia) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(async () =>
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() =>
          navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
        ),
      );
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioInputDevices = toAudioDeviceChoices(devices, 'audioinput');
    audioOutputDevices = toAudioDeviceChoices(devices, 'audiooutput');
    videoInputDevices = toVideoDeviceChoices(devices);
    await repairMissingOutputDevice();
    audioDeviceLoadState = 'ready';
    audioDeviceMessage =
      devices.some((device) => device.label)
        ? 'Media devices are ready.'
        : 'Device names may appear after access is allowed.';
  } catch (error) {
    audioDeviceLoadState = 'failed';
    audioDeviceMessage = error instanceof Error ? error.message : 'Could not read media devices.';
    audioInputDevices = [defaultDeviceChoice('audioinput')];
    audioOutputDevices = [defaultDeviceChoice('audiooutput')];
    videoInputDevices = [defaultDeviceChoice('videoinput')];
  } finally {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    renderSettingsWorkspace();
  }
}

function isAudioDeviceSelectionError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === 'NotFoundError' ||
    error.name === 'OverconstrainedError' ||
    error.name === 'DevicesNotFoundError' ||
    error.name === 'ConstraintNotSatisfiedError'
  );
}

function createMicrophoneTestConstraints(sound: GaiaSoundSettings, includeDevice: boolean): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    autoGainControl: sound.autoGainControl,
    echoCancellation: sound.echoCancellation,
    noiseSuppression: sound.noiseSuppression,
    channelCount: 1,
  };

  if (includeDevice && sound.inputDeviceId && sound.inputDeviceId !== 'default') {
    constraints.deviceId = { exact: sound.inputDeviceId };
  }

  return constraints;
}

function setMicrophoneTestLevel(level: number): void {
  microphoneTestLevel = Math.min(1, Math.max(0, level));
  const meter = settingsContent.querySelector<HTMLElement>('.sound-test-meter');
  if (meter) {
    meter.style.setProperty('--sound-test-level', microphoneTestLevel.toFixed(3));
  }
  const value = settingsContent.querySelector<HTMLElement>('.sound-test-value');
  if (value) {
    value.textContent = formatVolumeLabel(microphoneTestLevel);
  }
}

function stopMicrophoneTest(options: { render?: boolean } = {}): void {
  const runtime = microphoneTestRuntime;
  if (runtime) {
    window.cancelAnimationFrame(runtime.rafId);
    runtime.source.disconnect();
    runtime.analyser.disconnect();
    void runtime.context.close().catch(() => undefined);
    for (const track of runtime.stream.getTracks()) {
      track.stop();
    }
  }

  microphoneTestRuntime = null;
  microphoneTestState = 'idle';
  microphoneTestMessage = 'Start a local mic test to check the selected input.';
  setMicrophoneTestLevel(0);

  if (options.render !== false) {
    renderSettingsWorkspace();
  }
}

function startMicrophoneTestMeter(runtime: Omit<MicrophoneTestRuntime, 'rafId'>): void {
  const data = runtime.data;
  let smoothed = 0;
  const tick = () => {
    runtime.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / data.length);
    const normalized = Math.min(1, Math.max(0, (rms - 0.006) / 0.075));
    smoothed = smoothed * 0.58 + normalized * 0.42;
    setMicrophoneTestLevel(smoothed < 0.006 ? 0 : smoothed);

    const activeRuntime = microphoneTestRuntime;
    if (activeRuntime) {
      if (activeRuntime.context.state === 'suspended') {
        void activeRuntime.context.resume().catch(() => undefined);
      }
      activeRuntime.rafId = window.requestAnimationFrame(tick);
    }
  };

  microphoneTestRuntime = {
    ...runtime,
    rafId: window.requestAnimationFrame(tick),
  };
}

async function startMicrophoneTest(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    microphoneTestState = 'failed';
    microphoneTestMessage = 'Microphone capture is unavailable in this renderer.';
    renderSettingsWorkspace();
    return;
  }

  stopMicrophoneTest({ render: false });
  microphoneTestState = 'starting';
  microphoneTestMessage = 'Requesting microphone...';
  renderSettingsWorkspace();

  const sound = (settingsDraft ?? currentSettings()).sound;
  let stream: MediaStream;
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: createMicrophoneTestConstraints(sound, true),
        video: false,
      });
    } catch (error) {
      if (sound.inputDeviceId === 'default' || !isAudioDeviceSelectionError(error)) {
        throw error;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: createMicrophoneTestConstraints(sound, false),
        video: false,
      });
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw new Error('AudioContext is unavailable.');
    }

    const context = new AudioContextConstructor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    microphoneTestState = 'active';
    microphoneTestMessage = 'Speak into the selected microphone.';
    renderSettingsWorkspace();
    startMicrophoneTestMeter({
      analyser,
      context,
      data: new Uint8Array(analyser.fftSize),
      source,
      stream,
    });
    void context.resume().catch(() => undefined);
  } catch (error) {
    microphoneTestState = 'failed';
    microphoneTestMessage = error instanceof Error ? error.message : 'Could not start microphone test.';
    setMicrophoneTestLevel(0);
    renderSettingsWorkspace();
  }
}

function cameraResolutionSize(resolution: GaiaVideoSettings['cameraResolution']): { width: number; height: number } {
  if (resolution === '1080p') {
    return { width: 1920, height: 1080 };
  }
  if (resolution === '480p') {
    return { width: 854, height: 480 };
  }
  return { width: 1280, height: 720 };
}

function createCameraPreviewConstraints(video: GaiaVideoSettings, includeDevice: boolean): MediaTrackConstraints {
  const size = cameraResolutionSize(video.cameraResolution);
  const constraints: MediaTrackConstraints = {
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: video.cameraFrameRate, max: Math.max(1, Math.min(60, video.cameraFrameRate)) },
  };

  if (includeDevice && video.cameraDeviceId && video.cameraDeviceId !== 'default') {
    constraints.deviceId = { exact: video.cameraDeviceId };
  }

  return constraints;
}

function stopCameraPreview(options: { render?: boolean } = {}): void {
  const runtime = cameraPreviewRuntime;
  if (runtime) {
    for (const track of runtime.stream.getTracks()) {
      track.stop();
    }
  }

  cameraPreviewRuntime = null;
  cameraPreviewState = 'idle';
  cameraPreviewMessage = 'Start a camera preview to check your selected webcam.';

  if (options.render !== false) {
    renderSettingsWorkspace();
  }
}

async function startCameraPreview(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraPreviewState = 'failed';
    cameraPreviewMessage = 'Camera capture is unavailable in this renderer.';
    renderSettingsWorkspace();
    return;
  }

  stopCameraPreview({ render: false });
  cameraPreviewState = 'starting';
  cameraPreviewMessage = 'Requesting camera...';
  renderSettingsWorkspace();

  const video = (settingsDraft ?? currentSettings()).video;
  try {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: createCameraPreviewConstraints(video, true),
      });
    } catch (error) {
      if (video.cameraDeviceId === 'default' || !isAudioDeviceSelectionError(error)) {
        throw error;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: createCameraPreviewConstraints(video, false),
      });
    }

    cameraPreviewRuntime = { stream };
    cameraPreviewState = 'active';
    cameraPreviewMessage = 'Previewing the selected camera locally.';
    await refreshAudioDevices(false);
    renderSettingsWorkspace();
  } catch (error) {
    cameraPreviewRuntime = null;
    cameraPreviewState = 'failed';
    cameraPreviewMessage = error instanceof Error ? error.message : 'Could not start camera preview.';
    renderSettingsWorkspace();
  }
}

function ensureAudioDevicesLoaded(): void {
  if (audioDeviceLoadState !== 'idle') {
    return;
  }
  void refreshAudioDevices(false);
}

function createSettingsAction(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-secondary-action';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function createSettingsActionGroup(...buttons: HTMLButtonElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-inline-actions';
  group.append(...buttons);
  return group;
}

function hasLauncherUpdateAttention(state: GaiaUpdateState | null = updateState): boolean {
  if (!state?.supported) {
    return false;
  }
  return state.status === 'available' || state.status === 'downloaded' || state.status === 'downloading';
}

function syncLauncherUpdateBadge(): void {
  const hasUpdate = hasLauncherUpdateAttention();
  settingsButton.classList.toggle('has-launcher-update', hasUpdate);
  settingsButton.dataset.updateAvailable = hasUpdate ? 'true' : 'false';
  settingsUpdateBadge.classList.toggle('hidden', !hasUpdate);
  settingsUpdateBadge.textContent = '1';

  if (hasUpdate) {
    const version = updateState?.availableVersion ? ` ${updateState.availableVersion}` : '';
    settingsButton.title = `Settings - Gaia${version} update available`;
    settingsButton.setAttribute('aria-label', `Settings, Gaia${version} update available`);
  } else {
    settingsButton.title = 'Settings';
    settingsButton.setAttribute('aria-label', 'Settings');
  }
}

function createUpdateStatusBadge(state: GaiaUpdateState | null): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'settings-update-badge';
  badge.dataset.status = state?.status ?? 'idle';
  badge.textContent = state ? updateStatusLabel(state) : 'Loading';
  return badge;
}

function createUpdatePill(label: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'settings-update-badge';
  badge.dataset.status = 'idle';
  badge.textContent = label;
  return badge;
}

function createUpdateProgressControl(state: GaiaUpdateState): HTMLElement {
  const progress = state.progress;
  const control = document.createElement('div');
  control.className = 'settings-update-progress';
  const bar = document.createElement('span');
  bar.style.setProperty('--update-progress', `${progress?.percent ?? 0}%`);
  const label = document.createElement('strong');
  label.textContent = progress ? `${Math.round(progress.percent)}%` : 'Ready';
  control.append(bar, label);
  return control;
}

function createUpdateActions(state: GaiaUpdateState | null): HTMLElement {
  const busy = updateActionInFlight !== null || state?.status === 'checking' || state?.status === 'downloading' || state?.status === 'installing';
  return createSettingsActionGroup(
    createSettingsAction(updateActionInFlight === 'check' ? 'Checking...' : 'Check', () => {
      void runUpdateAction('check');
    }, busy || !state?.canCheck),
    createSettingsAction(updateActionInFlight === 'download' ? 'Downloading...' : 'Download', () => {
      void runUpdateAction('download');
    }, busy || !state?.canDownload),
    createSettingsAction(updateActionInFlight === 'install' ? 'Installing...' : 'Restart', () => {
      void runUpdateAction('install');
    }, busy || !state?.canInstall),
    createSettingsAction(updateActionInFlight === 'downloads' ? 'Opening...' : 'Releases', () => {
      void runUpdateAction('downloads');
    }, busy || !state?.canOpenDownloads),
  );
}

function updateStatusLabel(state: GaiaUpdateState): string {
  if (state.status === 'not_available') {
    return 'Current';
  }
  if (state.status === 'available') {
    return 'Available';
  }
  if (state.status === 'downloaded') {
    return 'Ready';
  }
  if (state.status === 'downloading') {
    return 'Downloading';
  }
  if (state.status === 'checking') {
    return 'Checking';
  }
  if (state.status === 'installing') {
    return 'Installing';
  }
  if (state.status === 'error') {
    return 'Needs attention';
  }
  if (state.status === 'unsupported') {
    return 'Manual';
  }
  return 'Idle';
}

function updateInstallModeLabel(state: GaiaUpdateState | null): string {
  if (!state) {
    return 'Detecting package';
  }
  if (state.installMode === 'appimage') {
    return 'AppImage';
  }
  if (state.installMode === 'package-manager') {
    return 'Native package';
  }
  if (state.installMode === 'macos') {
    return 'macOS package';
  }
  if (state.installMode === 'windows') {
    return 'Windows package';
  }
  if (state.installMode === 'store') {
    return 'Store managed';
  }
  if (state.installMode === 'development') {
    return 'Development build';
  }
  return 'Manual package';
}

function updateVersionLabel(state: GaiaUpdateState | null): string {
  if (!state) {
    return 'Loading Gaia version...';
  }
  if (state.availableVersion && state.availableVersion !== state.currentVersion) {
    return `${state.currentVersion} installed, ${state.availableVersion} available.`;
  }
  return `${state.currentVersion} installed.`;
}

function updateProgressSummary(state: GaiaUpdateState): string {
  const progress = state.progress;
  if (!progress) {
    return state.downloadedFile ? 'Downloaded and staged for restart.' : 'No active download.';
  }
  const transferred = formatByteCount(progress.transferred);
  const total = progress.total > 0 ? formatByteCount(progress.total) : 'unknown size';
  const speed = progress.bytesPerSecond > 0 ? `${formatByteCount(progress.bytesPerSecond)}/s` : 'calculating speed';
  return `${transferred} of ${total}, ${speed}.`;
}

function formatByteCount(value: number): string {
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[unitIndex]}`;
}

async function runUpdateAction(action: 'check' | 'download' | 'install' | 'downloads'): Promise<void> {
  updateActionInFlight = action;
  renderSettingsWorkspace();
  try {
    if (action === 'check') {
      updateState = await window.gaia.checkForUpdates();
    } else if (action === 'download') {
      updateState = await window.gaia.downloadUpdate();
    } else if (action === 'install') {
      updateState = await window.gaia.installUpdate();
    } else {
      updateState = await window.gaia.openUpdateDownloads();
    }
    setStatus(updateState.message, updateState.status === 'error' ? 'bad' : 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Update action failed', 'bad');
  } finally {
    updateActionInFlight = null;
    renderSettingsWorkspace();
    syncLauncherUpdateBadge();
  }
}

function updateCheckedAtMs(state: GaiaUpdateState | null): number {
  if (!state?.checkedAt) {
    return 0;
  }
  const parsed = Date.parse(state.checkedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canRunLauncherUpdateLiveCheck(minimumIntervalMs: number): boolean {
  if (!updateState?.canCheck || updateLiveCheckInFlight || updateActionInFlight !== null) {
    return false;
  }
  if (hasLauncherUpdateAttention(updateState)) {
    return false;
  }
  if (updateState.status === 'checking' || updateState.status === 'downloading' || updateState.status === 'installing') {
    return false;
  }

  const lastKnownCheckMs = Math.max(lastUpdateLiveCheckAttemptMs, updateCheckedAtMs(updateState));
  return lastKnownCheckMs === 0 || Date.now() - lastKnownCheckMs >= minimumIntervalMs;
}

async function maybeCheckForLauncherUpdates(minimumIntervalMs = LAUNCHER_UPDATE_LIVE_CHECK_INTERVAL_MS): Promise<void> {
  if (!canRunLauncherUpdateLiveCheck(minimumIntervalMs)) {
    return;
  }

  updateLiveCheckInFlight = true;
  lastUpdateLiveCheckAttemptMs = Date.now();
  try {
    updateState = await window.gaia.checkForUpdates();
  } catch (error) {
    console.warn('[gaia:updates] Background update check failed.', error);
  } finally {
    updateLiveCheckInFlight = false;
    syncLauncherUpdateBadge();
    if (activeView === 'settings' && activeSettingsSection === 'updates') {
      renderSettingsWorkspace();
    }
  }
}

function startLauncherUpdateLiveChecks(): void {
  if (updateLiveCheckTimer !== null) {
    return;
  }

  window.setTimeout(() => {
    void maybeCheckForLauncherUpdates(LAUNCHER_UPDATE_FOCUS_CHECK_INTERVAL_MS);
  }, LAUNCHER_UPDATE_STARTUP_CHECK_DELAY_MS);

  updateLiveCheckTimer = window.setInterval(() => {
    void maybeCheckForLauncherUpdates();
  }, LAUNCHER_UPDATE_LIVE_CHECK_INTERVAL_MS);
}

function stopOutputTest(options: { render?: boolean } = {}): void {
  const audio = outputTestAudio;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  outputTestAudio = null;
  outputTestState = 'idle';
  if (options.render !== false) {
    renderSettingsWorkspace();
  }
}

async function applyAudioOutputSink(
  audio: HTMLAudioElement,
  outputDeviceId: string,
  fallbackContext: string,
): Promise<boolean> {
  const selectableAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (!selectableAudio.setSinkId) {
    return false;
  }

  const sinkId = selectedOutputSinkId(outputDeviceId);
  try {
    await selectableAudio.setSinkId(sinkId);
    return false;
  } catch (error) {
    if (!sinkId) {
      throw error;
    }

    console.warn(
      `[gaia:sound] ${fallbackContext} could not use selected speakers; retrying system default (${outputDeviceId}).`,
    );
    await selectableAudio.setSinkId('');
    return true;
  }
}

async function playGaiaNotificationSound(context: string): Promise<void> {
  const sound = currentSettings().sound;
  const audio = new Audio(GAIA_NOTIFICATION_TEST_URL);
  audio.preload = 'auto';
  audio.volume = clampUnit(sound.outputVolume);

  const releaseAudio = () => {
    audio.removeAttribute('src');
    audio.load();
  };
  audio.addEventListener('ended', releaseAudio, { once: true });
  audio.addEventListener('error', releaseAudio, { once: true });

  try {
    await applyAudioOutputSink(audio, sound.outputDeviceId, context);
    await audio.play();
  } catch (error) {
    releaseAudio();
    console.warn(`[gaia:sound] ${context} sound failed.`, error);
  }
}

async function playOutputTestSound(): Promise<void> {
  stopOutputTest({ render: false });
  outputTestState = 'playing';
  outputTestMessage = 'Playing notification sound...';
  renderSettingsWorkspace();

  const sound = (settingsDraft ?? currentSettings()).sound;
  const audio = new Audio(GAIA_NOTIFICATION_TEST_URL);
  audio.preload = 'auto';
  audio.volume = clampUnit(sound.outputVolume);
  outputTestAudio = audio;

  let usedDefaultFallback = false;
  audio.addEventListener('ended', () => {
    if (outputTestAudio !== audio) {
      return;
    }
    outputTestAudio = null;
    outputTestState = 'idle';
    outputTestMessage = usedDefaultFallback
      ? 'Selected speakers were unavailable; system default worked.'
      : 'Notification test played.';
    renderSettingsWorkspace();
  }, { once: true });
  audio.addEventListener('error', () => {
    if (outputTestAudio !== audio) {
      return;
    }
    outputTestAudio = null;
    outputTestState = 'failed';
    outputTestMessage = audio.error?.message || 'Could not play the notification sound.';
    renderSettingsWorkspace();
  }, { once: true });

  try {
    usedDefaultFallback = await applyAudioOutputSink(audio, sound.outputDeviceId, 'Output test');
    if (usedDefaultFallback) {
      outputTestMessage = 'Selected speakers unavailable; playing through system default.';
      renderSettingsWorkspace();
    }
    await audio.play();
  } catch (error) {
    if (outputTestAudio === audio) {
      outputTestAudio = null;
    }
    outputTestState = 'failed';
    outputTestMessage = error instanceof Error ? error.message : 'Could not play the notification sound.';
    renderSettingsWorkspace();
  }
}

function createOutputTestControl(): HTMLElement {
  const button = createSettingsAction(
    outputTestState === 'playing' ? 'Playing...' : 'Play test',
    () => void playOutputTestSound(),
    outputTestState === 'playing',
  );
  return createSettingsActionGroup(button);
}

function createMicrophoneTestControl(): HTMLElement {
  const control = document.createElement('div');
  control.className = 'sound-test-control';

  const meter = document.createElement('div');
  meter.className = 'sound-test-meter';
  meter.style.setProperty('--sound-test-level', microphoneTestLevel.toFixed(3));
  meter.setAttribute('aria-label', 'Microphone test level');
  for (let index = 0; index < 5; index += 1) {
    meter.append(document.createElement('span'));
  }

  const value = document.createElement('span');
  value.className = 'sound-test-value';
  value.textContent = formatVolumeLabel(microphoneTestLevel);

  const button = createSettingsAction(
    microphoneTestState === 'active' ? 'Stop test' : microphoneTestState === 'starting' ? 'Starting...' : 'Start test',
    () => {
      if (microphoneTestState === 'active') {
        stopMicrophoneTest();
        return;
      }
      void startMicrophoneTest();
    },
    microphoneTestState === 'starting',
  );

  control.append(meter, value, button);
  return control;
}

function createCameraPreviewControl(videoSettings: GaiaVideoSettings): HTMLElement {
  const control = document.createElement('div');
  control.className = 'camera-preview-control';

  const preview = document.createElement('div');
  preview.className = 'camera-preview-frame';
  preview.dataset.state = cameraPreviewState;

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.classList.toggle('mirrored', videoSettings.mirrorPreview);
  if (cameraPreviewRuntime?.stream) {
    video.srcObject = cameraPreviewRuntime.stream;
  }

  const placeholder = document.createElement('span');
  placeholder.textContent =
    cameraPreviewState === 'starting'
      ? 'Starting...'
      : cameraPreviewState === 'failed'
        ? 'Preview unavailable'
        : 'Camera preview';
  preview.append(video, placeholder);

  const button = createSettingsAction(
    cameraPreviewState === 'active'
      ? 'Stop preview'
      : cameraPreviewState === 'starting'
        ? 'Starting...'
        : 'Start preview',
    () => {
      if (cameraPreviewState === 'active') {
        stopCameraPreview();
        return;
      }
      void startCameraPreview();
    },
    cameraPreviewState === 'starting',
  );

  control.append(preview, createSettingsActionGroup(button));
  return control;
}

function formatVolumeLabel(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function selectedOutputSinkId(outputDeviceId: string): string {
  return outputDeviceId === 'default' ? '' : outputDeviceId;
}

function formatKeybindLabel(keybind: string): string {
  return keybind
    .split('+')
    .map((part) => {
      if (part.startsWith('Key') && part.length === 4) {
        return part.slice(3);
      }
      if (part.startsWith('Digit') && part.length === 6) {
        return part.slice(5);
      }
      if (part === 'Space') {
        return 'Space';
      }
      return part.replace(/(Left|Right)$/, '');
    })
    .join(' + ');
}

function keybindFromKeyboardEvent(event: KeyboardEvent): string | null {
  const code = event.code || event.key;
  if (!code || ['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push('Ctrl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  if (event.metaKey) {
    parts.push('Meta');
  }
  parts.push(code);
  return parts.join('+');
}

function updateSoundSettingsDraft(patch: Partial<GaiaSoundSettings>): void {
  if (
    microphoneTestState === 'active' &&
    (patch.inputDeviceId ||
      typeof patch.noiseSuppression === 'boolean' ||
      typeof patch.echoCancellation === 'boolean' ||
      typeof patch.autoGainControl === 'boolean')
  ) {
    stopMicrophoneTest({ render: false });
  }
  const draft = settingsDraft ?? cloneSettings(currentSettings());
  updateSettingsDraft({
    sound: {
      ...draft.sound,
      ...patch,
    },
  });
}

function updateVideoSettingsDraft(patch: Partial<GaiaVideoSettings>): void {
  if (
    cameraPreviewState === 'active' &&
    (patch.cameraDeviceId ||
      patch.cameraResolution ||
      typeof patch.cameraFrameRate === 'number')
  ) {
    stopCameraPreview({ render: false });
  }
  const draft = settingsDraft ?? cloneSettings(currentSettings());
  updateSettingsDraft({
    video: {
      ...draft.video,
      ...patch,
    },
  });
}

function handleSoundKeyCapture(event: KeyboardEvent): void {
  if (!soundKeyCaptureActive) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    soundKeyCaptureActive = false;
    renderSettingsWorkspace();
    return;
  }

  const keybind = keybindFromKeyboardEvent(event);
  if (!keybind) {
    return;
  }

  soundKeyCaptureActive = false;
  updateSoundSettingsDraft({ pushToTalkKey: keybind });
}

function syncSettingsSaveBar(): void {
  const dirty = isSettingsDirty();
  settingsSaveBar.classList.toggle('hidden', !dirty);
  settingsResetButton.disabled = !dirty || settingsSaveInFlight;
  settingsSaveButton.disabled = !dirty || settingsSaveInFlight;
  settingsSaveButton.textContent = settingsSaveInFlight ? 'Saving...' : 'Save';
}

function updateSettingsDraft(patch: GaiaSettingsPatch, options: { render?: boolean } = {}): void {
  const accentColor = normalizeAccentColor(patch.accentColor);
  if (accentColor) {
    accentPickerDraftColor = accentColor;
  }
  settingsDraft = {
    ...cloneSettings(settingsDraft ?? currentSettings()),
    ...patch,
    ...(accentColor ? { accentColor } : {}),
  };
  applyAppearanceMode(settingsDraft);
  applyAccentColor(settingsDraft);
  if (options.render === false) {
    syncSettingsSaveBar();
    return;
  }
  renderSettingsWorkspace();
}

function renderGeneralSettings(draft: GaiaSettings): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const card = createSettingsCard('Startup View', 'Choose where Gaia opens after sign-in.');
  appendSettingsRow(
    card,
    'Open to',
    'Last view remembers whether you were in servers or messages.',
    createSegmentedControl(
      'Startup view',
      [
        { value: 'last', label: 'Last view' },
        { value: 'server', label: 'Servers' },
        { value: 'messages', label: 'Messages' },
      ],
      draft.startupView,
      (startupView) => updateSettingsDraft({ startupView }),
    ),
  );
  fragment.append(card);
  return fragment;
}

function renderAppearanceSettings(draft: GaiaSettings): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const themeCard = createSettingsCard('Theme', 'Choose how Gaia and hosted Current servers handle light and dark materials.');
  appendSettingsRow(
    themeCard,
    'Mode',
    'Auto follows your system color scheme.',
    createSegmentedControl(
      'Appearance mode',
      [
        { value: 'auto', label: 'Auto' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      draft.appearanceMode,
      (appearanceMode) => updateSettingsDraft({ appearanceMode }),
    ),
  );
  fragment.append(themeCard);

  const accentCard = createSettingsCard('Accent Color', 'Tint Gaia backgrounds, rail controls, and logo glow.');
  appendSettingsRow(
    accentCard,
    'Color',
    'Default is Gaia light blue.',
    createAccentPickerControl(draft.accentColor),
  );
  fragment.append(accentCard);

  const densityCard = createSettingsCard('Display Density', 'Tune spacing for repeated launcher surfaces.');
  appendSettingsRow(
    densityCard,
    'Density',
    'Compact mode tightens message rows, sidebars, and controls.',
    createSegmentedControl(
      'Display density',
      [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ],
      draft.density,
      (density) => updateSettingsDraft({ density }),
    ),
  );
  fragment.append(densityCard);

  const motionCard = createSettingsCard('Motion', 'Reduce wallpaper fades and UI motion.');
  appendSettingsRow(
    motionCard,
    'Reduced motion',
    'Shortens transitions while keeping the same material style.',
    createSettingsToggle('Reduced motion', draft.reducedMotion, (reducedMotion) =>
      updateSettingsDraft({ reducedMotion }),
    ),
  );
  appendSettingsRow(
    motionCard,
    'Animated Current backgrounds',
    'Allows animated server wallpaper from Current when available.',
    createSettingsToggle('Animated Current backgrounds', draft.animatedCurrentBackgrounds, (animatedCurrentBackgrounds) =>
      updateSettingsDraft({ animatedCurrentBackgrounds }),
    ),
  );
  fragment.append(motionCard);
  return fragment;
}

function renderMessageSettings(draft: GaiaSettings): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const card = createSettingsCard('GIF Playback', 'Control animated media in Bluesky messages.');
  appendSettingsRow(
    card,
    'Playback',
    'Focused pauses message GIFs when Gaia is not the active window.',
    createSegmentedControl(
      'GIF playback',
      [
        { value: 'always', label: 'Always' },
        { value: 'focused', label: 'While focused' },
        { value: 'never', label: 'Paused' },
      ],
      draft.gifPlayback,
      (gifPlayback) => updateSettingsDraft({ gifPlayback }),
    ),
  );
  fragment.append(card);
  return fragment;
}

function spotifyAccountSummary(status: GaiaSpotifyStatus): string {
  if (!status.configured) {
    return 'Set GAIA_SPOTIFY_CLIENT_ID before connecting Spotify.';
  }
  if (!status.connected) {
    return status.message ?? 'Not connected.';
  }
  return status.displayName ? `Connected as ${status.displayName}.` : 'Connected.';
}

function spotifyActivitySummary(status: GaiaSpotifyStatus): string {
  const activity = status.activity;
  if (!activity) {
    return status.connected ? 'No Spotify audio is playing right now.' : 'Connect Spotify first.';
  }
  const artist = activity.artists.length > 0 ? activity.artists.join(', ') : 'Spotify';
  return `${activity.title} - ${artist}`;
}

async function loadSpotifyStatus(): Promise<void> {
  try {
    spotifyStatus = await window.gaia.getSpotifyStatus();
  } catch (error) {
    spotifyStatus = {
      ...spotifyStatus,
      configured: false,
      connected: false,
      sharingEnabled: false,
      message: error instanceof Error ? error.message : 'Could not read Spotify status.',
    };
  }
  if (activeView === 'settings' && activeSettingsSection === 'connections') {
    renderSettingsWorkspace();
  }
}

async function runSpotifyConnectAction(): Promise<void> {
  spotifyActionInFlight = 'connect';
  renderSettingsWorkspace();
  try {
    await window.gaia.startSpotifyAuth();
    setStatus('Check your browser', 'neutral');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not start Spotify connection.', 'bad');
  } finally {
    spotifyActionInFlight = null;
    await loadSpotifyStatus();
  }
}

async function runSpotifySharingAction(sharingEnabled: boolean): Promise<void> {
  spotifyActionInFlight = 'sharing';
  renderSettingsWorkspace();
  try {
    spotifyStatus = await window.gaia.updateSpotifySharing({ sharingEnabled });
    setStatus(spotifyStatus.message ?? (sharingEnabled ? 'Spotify sharing on' : 'Spotify sharing off'), 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not update Spotify sharing.', 'bad');
  } finally {
    spotifyActionInFlight = null;
    renderSettingsWorkspace();
  }
}

async function runSpotifyDisconnectAction(): Promise<void> {
  spotifyActionInFlight = 'disconnect';
  renderSettingsWorkspace();
  try {
    spotifyStatus = await window.gaia.logoutSpotify();
    setStatus(spotifyStatus.message ?? 'Spotify disconnected', 'warn');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not disconnect Spotify.', 'bad');
  } finally {
    spotifyActionInFlight = null;
    renderSettingsWorkspace();
  }
}

async function copySpotifyRedirectUri(): Promise<void> {
  spotifyActionInFlight = 'copy';
  renderSettingsWorkspace();
  try {
    await navigator.clipboard.writeText(spotifyStatus.redirectUri);
    setStatus('Redirect URI copied', 'good');
  } catch {
    setStatus(spotifyStatus.redirectUri, 'neutral');
  } finally {
    spotifyActionInFlight = null;
    renderSettingsWorkspace();
  }
}

function bindP2PVoiceService(service: P2PVoiceCallService): void {
  p2pVoiceStateUnsubscribe?.();
  p2pVoiceRemoteStreamUnsubscribe?.();
  p2pVoiceState = service.getState();
  p2pVoiceStateUnsubscribe = service.subscribe((state) => {
    p2pVoiceState = state;
    renderIncomingP2PVoicePrompt();
    if (p2pDirectCallOpen) {
      renderP2PDirectCallPanel();
    }
    if (
      state.signalingMode === 'bsky-dm' &&
      p2pVoiceCanJoin(state) &&
      p2pVoiceActionInFlight !== 'join' &&
      p2pVoiceActionInFlight !== 'accept'
    ) {
      window.setTimeout(() => {
        resetIdleBskyDmP2PVoiceService();
      }, 0);
    }
  });
  p2pVoiceRemoteStreamUnsubscribe = service.onRemoteStream((stream) => {
    p2pRemoteAudio.srcObject = stream;
    if (stream) {
      void p2pRemoteAudio.play().catch(() => undefined);
    }
    if (p2pDirectCallOpen) {
      renderP2PDirectCallPanel();
    }
  });
}

function replaceP2PVoiceService(
  signaling: P2PVoiceSignalingTransport,
  signalingConvoId: string | null,
): void {
  p2pVoiceStateUnsubscribe?.();
  p2pVoiceRemoteStreamUnsubscribe?.();
  p2pVoiceStateUnsubscribe = null;
  p2pVoiceRemoteStreamUnsubscribe = null;
  p2pVoiceService.destroy();
  p2pRemoteAudio.srcObject = null;
  p2pVoiceSignaling = signaling;
  p2pVoiceSignalingConvoId = signalingConvoId;
  if (signaling.mode !== 'manual') {
    p2pVoiceOutboundSignals = [];
    syncP2PVoiceSignalOutput();
  }
  p2pVoiceService = new P2PVoiceCallService({
    signaling,
    iceConfig: p2pVoiceIceConfigFromSettings(currentSettings().p2pVoice),
    roomId: signalingConvoId ? `bsky-dm:${signalingConvoId}` : undefined,
  });
  bindP2PVoiceService(p2pVoiceService);
}

function resetP2PVoiceServiceToManual(): void {
  replaceP2PVoiceService(new ManualP2PVoiceSignalingTransport(handleP2PVoiceOutboundSignal), null);
}

function resetIdleBskyDmP2PVoiceService(): void {
  if (
    p2pVoiceState.signalingMode !== 'bsky-dm' ||
    !p2pVoiceCanJoin() ||
    p2pVoiceActionInFlight === 'join' ||
    p2pVoiceActionInFlight === 'accept'
  ) {
    return;
  }
  resetP2PVoiceServiceToManual();
  if (p2pDirectCallOpen) {
    renderP2PDirectCallPanel();
  }
}

function createBskyDmP2PVoiceTransport(
  convoId: string,
  options: {
    processExistingMessages?: boolean;
    ignoreSignalsBefore?: number;
    seenMessageIds?: string[];
    reportErrors?: boolean;
  } = {},
): BskyDmP2PVoiceSignalingTransport {
  return new BskyDmP2PVoiceSignalingTransport({
    convoId,
    localDid: clientAuthStatus.profile?.did,
    pollIntervalMs: BSKY_DM_VOICE_SIGNAL_POLL_MS,
    processExistingMessages: options.processExistingMessages,
    ignoreSignalsBefore: options.ignoreSignalsBefore ?? Date.now() - BSKY_DM_VOICE_SIGNAL_STALE_MS,
    seenMessageIds: options.seenMessageIds,
    onError:
      options.reportErrors === false
        ? undefined
        : (error) => {
            if (p2pDirectCallOpen || p2pVoiceState.signalingMode === 'bsky-dm') {
              setStatus(error.message, 'bad');
            }
          },
  });
}

function ensureBskyDmP2PVoiceService(
  convoId: string,
  options: {
    ignoreSignalsBefore?: number;
    seenMessageIds?: string[];
  } = {},
): void {
  if (p2pVoiceSignaling.mode === 'bsky-dm' && p2pVoiceSignalingConvoId === convoId) {
    return;
  }
  replaceP2PVoiceService(
    createBskyDmP2PVoiceTransport(convoId, {
      processExistingMessages: true,
      ignoreSignalsBefore: options.ignoreSignalsBefore,
      seenMessageIds: options.seenMessageIds,
    }),
    convoId,
  );
}

function closeBskyDmVoiceMonitor(): void {
  p2pBskyMonitorUnsubscribe?.();
  p2pBskyMonitorUnsubscribe = null;
  p2pBskyMonitorTransport?.close();
  p2pBskyMonitorTransport = null;
  p2pBskyMonitorConvoId = null;
  p2pBskyMonitorLocalDid = null;
}

function syncBskyDmVoiceMonitor(): void {
  const convo = selectedConvo();
  const localDid = clientAuthStatus.profile?.did ?? null;
  const nextConvoId = clientAuthStatus.authenticated && localDid && convo && isOneToOneBskyConvo(convo)
    ? convo.id
    : null;
  if (!nextConvoId || !localDid) {
    closeBskyDmVoiceMonitor();
    return;
  }
  if (p2pBskyMonitorConvoId === nextConvoId && p2pBskyMonitorLocalDid === localDid) {
    return;
  }
  closeBskyDmVoiceMonitor();
  try {
    const transport = createBskyDmP2PVoiceTransport(nextConvoId, {
      processExistingMessages: false,
      reportErrors: false,
    });
    p2pBskyMonitorTransport = transport;
    p2pBskyMonitorConvoId = nextConvoId;
    p2pBskyMonitorLocalDid = localDid;
    p2pBskyMonitorUnsubscribe = transport.subscribe((message, source) => {
      handleBskyDmVoiceMonitorSignal(nextConvoId, message, source);
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not start Bluesky DM voice polling.', 'bad');
  }
}

function isOneToOneBskyConvo(convo: GaiaBskyConvo): boolean {
  return conversationMembers(convo).length === 1;
}

function handleBskyDmVoiceMonitorSignal(
  convoId: string,
  message: GaiaP2PVoiceSignalMessage,
  source?: P2PVoiceSignalSource,
): void {
  if (selectedConvoId !== convoId) {
    return;
  }
  if (message.type === 'call-ended' || message.type === 'leave-call' || message.type === 'call-rejected') {
    if (incomingP2PVoiceOffer?.message.callId === message.callId) {
      incomingP2PVoiceOffer = null;
      renderIncomingP2PVoicePrompt();
    }
    return;
  }
  if (message.type !== 'offer') {
    return;
  }
  if (incomingP2PVoiceOffer?.message.callId === message.callId) {
    return;
  }
  if (!p2pVoiceCanJoin()) {
    if (message.callId !== p2pVoiceState.callId) {
      void sendBskyDmP2PVoiceControlSignal(convoId, message, 'call-rejected', 'Already in a call.');
    }
    return;
  }
  incomingP2PVoiceOffer = {
    convoId,
    message,
    sourceMessageId: source?.messageId,
    receivedAt: new Date().toISOString(),
  };
  setStatus('Incoming P2P voice call', 'neutral');
  renderMessagesViewport();
}

function renderIncomingP2PVoicePrompt(): void {
  const incoming = incomingP2PVoiceOffer;
  const convo = incoming ? convos.find((item) => item.id === incoming.convoId) : undefined;
  const visible = Boolean(incoming && convo && selectedConvoId === incoming.convoId && clientAuthStatus.authenticated);
  p2pIncomingCallPanel.classList.toggle('hidden', !visible);
  messageThread.classList.toggle('incoming-call-open', visible);
  if (!visible || !incoming || !convo) {
    return;
  }

  const busy = p2pVoiceActionInFlight === 'accept' || p2pVoiceActionInFlight === 'reject';
  const title = convoTitle(convo);
  p2pIncomingCallAvatar.replaceChildren(buildAvatar(convoPrimaryActor(convo), title, 'md'));
  p2pIncomingCallTitle.textContent = title;
  p2pIncomingCallSubtitle.textContent = 'Direct P2P voice call via Bluesky DM signaling.';
  p2pAcceptCallButton.disabled = busy || !p2pVoiceCanJoin();
  p2pRejectCallButton.disabled = busy;
  p2pAcceptCallButton.querySelector('span')!.textContent =
    p2pVoiceActionInFlight === 'accept' ? 'Accepting...' : 'Accept';
  p2pRejectCallButton.querySelector('span')!.textContent =
    p2pVoiceActionInFlight === 'reject' ? 'Rejecting...' : 'Reject';
}

async function acceptIncomingP2PVoiceCall(): Promise<void> {
  const incoming = incomingP2PVoiceOffer;
  if (!incoming) {
    return;
  }
  if (!p2pVoiceCanJoin()) {
    setStatus('End the current call before accepting another one.', 'warn');
    return;
  }

  p2pVoiceActionInFlight = 'accept';
  renderIncomingP2PVoicePrompt();
  try {
    selectedConvoId = incoming.convoId;
    p2pDirectCallOpen = true;
    p2pDirectCallConvoId = incoming.convoId;
    const createdAt = Date.parse(incoming.message.createdAt);
    ensureBskyDmP2PVoiceService(incoming.convoId, {
      ignoreSignalsBefore: Number.isFinite(createdAt) ? createdAt - 5_000 : Date.now() - BSKY_DM_VOICE_SIGNAL_STALE_MS,
      seenMessageIds: incoming.sourceMessageId ? [incoming.sourceMessageId] : undefined,
    });
    incomingP2PVoiceOffer = null;
    renderMessagesViewport();
    await p2pVoiceService.receiveSignal(incoming.message);
    setStatus('P2P voice answer sent', 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not accept P2P voice call.', 'bad');
  } finally {
    p2pVoiceActionInFlight = null;
    resetIdleBskyDmP2PVoiceService();
    renderMessagesViewport();
  }
}

async function rejectIncomingP2PVoiceCall(): Promise<void> {
  const incoming = incomingP2PVoiceOffer;
  if (!incoming) {
    return;
  }

  p2pVoiceActionInFlight = 'reject';
  renderIncomingP2PVoicePrompt();
  try {
    await sendBskyDmP2PVoiceControlSignal(incoming.convoId, incoming.message, 'call-rejected', 'Call rejected.');
    if (incomingP2PVoiceOffer?.message.callId === incoming.message.callId) {
      incomingP2PVoiceOffer = null;
    }
    setStatus('Call rejected', 'warn');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not reject P2P voice call.', 'bad');
  } finally {
    p2pVoiceActionInFlight = null;
    renderMessagesViewport();
  }
}

async function sendBskyDmP2PVoiceControlSignal(
  convoId: string,
  source: GaiaP2PVoiceSignalMessage,
  type: 'call-rejected',
  reason: string,
): Promise<void> {
  const signal = {
    version: 1,
    type,
    callId: source.callId,
    roomId: source.roomId,
    senderId: p2pVoiceState.localPeerId,
    createdAt: new Date().toISOString(),
    reason,
  } as GaiaP2PVoiceSignalMessage;

  if (p2pBskyMonitorTransport && p2pBskyMonitorConvoId === convoId) {
    await p2pBskyMonitorTransport.send(signal);
    return;
  }
  if (p2pVoiceSignaling.mode === 'bsky-dm' && p2pVoiceSignalingConvoId === convoId) {
    await p2pVoiceSignaling.send(signal);
    return;
  }

  const transport = createBskyDmP2PVoiceTransport(convoId, {
    processExistingMessages: false,
    reportErrors: false,
  });
  try {
    await transport.send(signal);
  } finally {
    transport.close();
  }
}

function handleP2PVoiceOutboundSignal(message: GaiaP2PVoiceSignalMessage): void {
  p2pVoiceOutboundSignals.push(message);
  if (p2pVoiceOutboundSignals.length > 100) {
    p2pVoiceOutboundSignals = p2pVoiceOutboundSignals.slice(-100);
  }
  syncP2PVoiceSignalOutput();
  if (p2pDirectCallOpen) {
    renderP2PDirectCallPanel();
  }
}

function p2pVoiceCanJoin(state = p2pVoiceState): boolean {
  return state.phase === 'idle' || state.phase === 'ended' || state.phase === 'failed';
}

function p2pVoiceCanLeave(state = p2pVoiceState): boolean {
  return !p2pVoiceCanJoin(state);
}

function p2pVoiceModeLabel(state = p2pVoiceState): string {
  if (state.signalingMode === 'bsky-dm') {
    return state.usingTurn ? 'Bluesky DM + TURN optional' : 'Bluesky DM signaling';
  }
  return state.usingTurn ? 'Direct P2P + optional TURN' : 'STUN-only';
}

function p2pVoiceTransportLabelText(state = p2pVoiceState): string {
  if (state.signalingMode === 'bsky-dm') {
    return state.usingTurn
      ? 'WebRTC P2P media, Bluesky DM signaling, optional TURN config available'
      : 'WebRTC P2P media, Bluesky DM signaling, STUN-only ICE';
  }
  return state.usingTurn
    ? 'Direct P2P first, with optional community TURN config available'
    : 'Direct P2P / STUN-only';
}

function syncP2PVoiceSignalOutput(): void {
  p2pLocalSignalOutput.value = formatP2PVoiceSignalBundle(p2pVoiceOutboundSignals);
}

function selectedP2PCallTitle(): string {
  const convo = selectedConvo();
  return convo ? convoTitle(convo) : 'Direct call';
}

function renderP2PCallAvatar(): void {
  const convo = selectedConvo();
  if (!convo) {
    p2pCallAvatar.replaceChildren();
    return;
  }
  p2pCallAvatar.replaceChildren(buildAvatar(convoPrimaryActor(convo), convoTitle(convo), 'md'));
}

function renderP2PDirectCallPanel(): void {
  const convo = selectedConvo();
  const canCall = clientAuthStatus.authenticated && Boolean(convo && isOneToOneBskyConvo(convo));
  const incomingForCurrentConvo = incomingP2PVoiceOffer?.convoId === selectedConvoId;
  messageCallButton.disabled = !canCall || incomingForCurrentConvo;
  messageCallButton.classList.toggle('active', p2pDirectCallOpen);
  messageCallButton.setAttribute('aria-pressed', p2pDirectCallOpen ? 'true' : 'false');
  messageCallButton.title = incomingForCurrentConvo
    ? 'Accept or reject the incoming call'
    : canCall
      ? 'Start P2P voice call'
      : 'Calls are available in 1:1 Bluesky DMs';
  p2pCallPanel.classList.toggle('hidden', !p2pDirectCallOpen);
  messageThread.classList.toggle('direct-call-open', p2pDirectCallOpen);
  p2pManualSignalingDetails.hidden = p2pVoiceState.signalingMode !== 'manual';
  if (!p2pDirectCallOpen) {
    return;
  }

  syncP2PVoiceSignalOutput();
  const busy = p2pVoiceActionInFlight !== null;
  const error = p2pVoiceState.error;
  renderP2PCallAvatar();
  p2pCallTitle.textContent = selectedP2PCallTitle();
  p2pCallPanel.dataset.phase = p2pVoiceState.phase;
  p2pVoiceMode.textContent = p2pVoiceModeLabel();
  p2pVoiceStatus.textContent = p2pVoiceState.status;
  p2pVoiceError.textContent = error ?? '';
  p2pVoiceError.classList.toggle('hidden', !error);
  p2pVoiceTransportLabel.textContent = p2pVoiceTransportLabelText();

  p2pJoinVoiceButton.disabled = busy || incomingForCurrentConvo || !p2pVoiceCanJoin();
  p2pJoinVoiceButton.querySelector('span')!.textContent =
    p2pVoiceActionInFlight === 'join' ? 'Calling...' : 'Start Call';
  p2pLeaveVoiceButton.disabled = busy || !p2pVoiceCanLeave();
  p2pLeaveVoiceButton.querySelector('span')!.textContent =
    p2pVoiceActionInFlight === 'leave' ? 'Ending...' : 'End';
  p2pMuteVoiceButton.disabled = busy || !p2pVoiceState.localStreamActive;
  p2pMuteVoiceButton.classList.toggle('muted', p2pVoiceState.muted);
  p2pMuteVoiceButton.querySelector('span')!.textContent = p2pVoiceState.muted ? 'Unmute' : 'Mute';

  p2pLocalMicState.textContent = p2pVoiceState.localStreamActive
    ? p2pVoiceState.muted
      ? 'Muted'
      : 'On'
    : 'Off';
  p2pRemoteAudioState.textContent = p2pVoiceState.remoteStreamActive
    ? 'Receiving'
    : p2pVoiceState.phase === 'connected'
      ? 'No remote track'
      : 'Waiting';
  p2pCopySignalButton.disabled = busy || p2pVoiceOutboundSignals.length === 0;
  p2pClearSignalButton.disabled = busy || p2pVoiceOutboundSignals.length === 0;
  p2pApplySignalButton.disabled = busy || p2pPeerSignalInput.value.trim().length === 0;
  p2pClearPeerSignalButton.disabled = busy || p2pPeerSignalInput.value.trim().length === 0;
}

function openP2PDirectCall(autoJoin = false): void {
  const convo = selectedConvo();
  if (!selectedConvoId || !convo) {
    setStatus('Select a conversation before starting a call.', 'warn');
    return;
  }
  if (!isOneToOneBskyConvo(convo)) {
    setStatus('Calls are available in 1:1 Bluesky DMs.', 'warn');
    return;
  }
  if (incomingP2PVoiceOffer?.convoId === selectedConvoId) {
    setStatus('Accept or reject the incoming call first.', 'warn');
    renderIncomingP2PVoicePrompt();
    return;
  }
  p2pDirectCallOpen = true;
  p2pDirectCallConvoId = selectedConvoId;
  incomingP2PVoiceOffer = incomingP2PVoiceOffer?.convoId === selectedConvoId ? incomingP2PVoiceOffer : null;
  renderP2PDirectCallPanel();
  if (autoJoin && p2pVoiceCanJoin()) {
    void joinP2PVoice();
  }
}

function closeP2PDirectCall(options: { leave?: boolean } = {}): void {
  if (options.leave && p2pVoiceCanLeave()) {
    p2pVoiceService.leaveVoice();
  }
  p2pDirectCallOpen = false;
  p2pDirectCallConvoId = null;
  renderP2PDirectCallPanel();
}

function syncP2PDirectCallConversation(nextConvoId: string | null): void {
  if (!p2pDirectCallOpen || p2pDirectCallConvoId === nextConvoId) {
    return;
  }
  if (p2pVoiceCanLeave()) {
    p2pVoiceService.leaveVoice();
  }
  p2pDirectCallOpen = false;
  p2pDirectCallConvoId = null;
  resetP2PVoiceServiceToManual();
}

function updateP2PVoiceTurnDraft(patch: Partial<GaiaP2PVoiceSettings['turnServers'][number]>): void {
  const draft = cloneSettings(settingsDraft ?? currentSettings());
  const current = draft.p2pVoice.turnServers[0] ?? {};
  const next = {
    ...current,
    ...patch,
  };
  const normalized = {
    turnUrl: next.turnUrl?.trim() || undefined,
    turnsUrl: next.turnsUrl?.trim() || undefined,
    username: next.username?.trim() || undefined,
    credential: next.credential?.trim() || undefined,
  };
  updateSettingsDraft({
    p2pVoice: {
      turnServers: normalized.turnUrl || normalized.turnsUrl ? [normalized] : [],
    },
  });
}

function appendP2PVoiceTurnSettings(card: HTMLElement, draft: GaiaSettings): void {
  const turn = draft.p2pVoice.turnServers[0] ?? {};
  appendSettingsRow(
    card,
    'TURN URL',
    'Optional community relay URL. Leave blank for STUN-only P2P.',
    createSettingsTextInput('TURN URL', turn.turnUrl ?? '', 'turn:relay.example.org:3478', (turnUrl) =>
      updateP2PVoiceTurnDraft({ turnUrl }),
    'url'),
  );
  appendSettingsRow(
    card,
    'TURNS URL',
    'Optional TLS relay URL for networks that require it.',
    createSettingsTextInput('TURNS URL', turn.turnsUrl ?? '', 'turns:relay.example.org:5349', (turnsUrl) =>
      updateP2PVoiceTurnDraft({ turnsUrl }),
    'url'),
  );
  appendSettingsRow(
    card,
    'Username',
    'Optional relay username. Gaia ships with none.',
    createSettingsTextInput('TURN username', turn.username ?? '', 'community-user', (username) =>
      updateP2PVoiceTurnDraft({ username }),
    ),
  );
  appendSettingsRow(
    card,
    'Credential',
    'Optional relay credential. Do not paste paid service secrets here.',
    createSettingsTextInput('TURN credential', turn.credential ?? '', 'community credential', (credential) =>
      updateP2PVoiceTurnDraft({ credential }),
    'password'),
  );
}

async function joinP2PVoice(): Promise<void> {
  if (!p2pDirectCallOpen) {
    openP2PDirectCall(false);
  }
  if (!selectedConvoId) {
    setStatus('Select a conversation before starting a call.', 'warn');
    return;
  }
  p2pVoiceActionInFlight = 'join';
  ensureBskyDmP2PVoiceService(selectedConvoId, {
    ignoreSignalsBefore: Date.now() - BSKY_DM_VOICE_SIGNAL_STALE_MS,
  });
  renderP2PDirectCallPanel();
  try {
    await p2pVoiceService.joinVoice();
    setStatus('P2P voice offer ready', 'neutral');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start P2P voice.';
    setStatus(message, 'bad');
  } finally {
    p2pVoiceActionInFlight = null;
    resetIdleBskyDmP2PVoiceService();
    renderP2PDirectCallPanel();
  }
}

async function toggleP2PVoiceMute(): Promise<void> {
  p2pVoiceActionInFlight = 'mute';
  renderP2PDirectCallPanel();
  try {
    await p2pVoiceService.setMuted(!p2pVoiceState.muted);
  } finally {
    p2pVoiceActionInFlight = null;
    renderP2PDirectCallPanel();
  }
}

function leaveP2PVoice(): void {
  p2pVoiceActionInFlight = 'leave';
  renderP2PDirectCallPanel();
  p2pVoiceService.leaveVoice();
  p2pVoiceActionInFlight = null;
  renderP2PDirectCallPanel();
}

async function copyP2PVoiceSignal(): Promise<void> {
  const signal = p2pLocalSignalOutput.value.trim();
  if (!signal) {
    return;
  }
  p2pVoiceActionInFlight = 'copy-signal';
  renderP2PDirectCallPanel();
  try {
    await navigator.clipboard.writeText(signal);
    setStatus('P2P voice signal copied', 'good');
  } catch {
    p2pLocalSignalOutput.focus();
    p2pLocalSignalOutput.select();
    setStatus('Select and copy the signal manually', 'warn');
  } finally {
    p2pVoiceActionInFlight = null;
    renderP2PDirectCallPanel();
  }
}

function clearP2PVoiceSignal(): void {
  p2pVoiceOutboundSignals = [];
  syncP2PVoiceSignalOutput();
  renderP2PDirectCallPanel();
}

async function applyP2PVoiceSignal(): Promise<void> {
  if (!(p2pVoiceSignaling instanceof ManualP2PVoiceSignalingTransport)) {
    setStatus('Manual signaling is not active for this call.', 'warn');
    return;
  }
  p2pVoiceActionInFlight = 'apply-signal';
  renderP2PDirectCallPanel();
  try {
    const parsed = parseP2PVoiceSignalText(p2pPeerSignalInput.value);
    if (parsed.errors.length > 0) {
      setStatus(parsed.errors[0] ?? 'Could not read peer signal.', 'bad');
      return;
    }
    for (const message of parsed.messages) {
      p2pVoiceSignaling.receive(message);
    }
    p2pPeerSignalInput.value = '';
    setStatus(`Applied ${parsed.messages.length} P2P signal${parsed.messages.length === 1 ? '' : 's'}`, 'good');
  } finally {
    p2pVoiceActionInFlight = null;
    renderP2PDirectCallPanel();
  }
}

function renderConnectionsSettings(draft: GaiaSettings): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const busy = spotifyActionInFlight !== null;

  const spotifyCard = createSettingsCard('Spotify', 'Share currently playing Spotify audio with Current profile popouts.');
  const connectLabel =
    spotifyActionInFlight === 'connect'
      ? 'Opening...'
      : spotifyStatus.connected
        ? 'Reconnect'
        : 'Connect';
  const accountActions = spotifyStatus.connected
    ? createSettingsActionGroup(
        createSettingsAction(connectLabel, () => void runSpotifyConnectAction(), busy || !spotifyStatus.configured),
        createSettingsAction(
          spotifyActionInFlight === 'disconnect' ? 'Disconnecting...' : 'Disconnect',
          () => void runSpotifyDisconnectAction(),
          busy,
        ),
      )
    : createSettingsActionGroup(
        createSettingsAction(connectLabel, () => void runSpotifyConnectAction(), busy || !spotifyStatus.configured),
      );

  appendSettingsRow(
    spotifyCard,
    'Account',
    spotifyAccountSummary(spotifyStatus),
    accountActions,
  );

  const sharingToggle = createSettingsToggle('Share Spotify listening activity', spotifyStatus.sharingEnabled, (sharingEnabled) => {
    void runSpotifySharingAction(sharingEnabled);
  });
  sharingToggle.disabled = busy || !spotifyStatus.connected;
  appendSettingsRow(
    spotifyCard,
    'Share activity',
    spotifyStatus.connected
      ? 'Shows your current Spotify audio when people open your Current profile.'
      : 'Connect Spotify before sharing activity.',
    sharingToggle,
  );

  appendSettingsRow(
    spotifyCard,
    'Now playing',
    spotifyActivitySummary(spotifyStatus),
    createUpdatePill(spotifyStatus.activity ? 'Live' : 'Idle'),
  );

  appendSettingsRow(
    spotifyCard,
    'Redirect URI',
    spotifyStatus.redirectUri,
    createSettingsAction(
      spotifyActionInFlight === 'copy' ? 'Copied' : 'Copy',
      () => void copySpotifyRedirectUri(),
      busy,
    ),
  );

  const p2pCard = createSettingsCard('Experimental P2P Voice', 'Direct microphone calls for 1-on-1 or tiny rooms.');
  appendSettingsRow(
    p2pCard,
    'ICE mode',
    draft.p2pVoice.turnServers.length > 0
      ? 'STUN plus optional community TURN configuration.'
      : 'STUN-only. No relay credentials are configured.',
    createUpdatePill(draft.p2pVoice.turnServers.length > 0 ? 'TURN optional' : 'STUN-only'),
  );
  appendP2PVoiceTurnSettings(p2pCard, draft);

  fragment.append(spotifyCard, p2pCard);
  return fragment;
}

function renderSoundSettings(draft: GaiaSettings): DocumentFragment {
  ensureAudioDevicesLoaded();
  const fragment = document.createDocumentFragment();
  const sound = draft.sound;
  const video = draft.video;
  const inputDevices = withSavedDeviceChoice(audioInputDevices, sound.inputDeviceId, 'audioinput');
  const outputDevices = withSavedDeviceChoice(audioOutputDevices, sound.outputDeviceId, 'audiooutput');
  const cameraDevices = withSavedVideoDeviceChoice(videoInputDevices, video.cameraDeviceId);
  const devicesLoading = audioDeviceLoadState === 'loading';

  const devicesCard = createSettingsCard('Audio Devices', 'Choose the microphone and speakers used by Current voice.');
  appendSettingsRow(
    devicesCard,
    'Microphone',
    'Input device for voice channels.',
    createSettingsSelect(
      'Microphone device',
      inputDevices.map((device) => ({ value: device.deviceId, label: device.label })),
      sound.inputDeviceId,
      (inputDeviceId) => updateSoundSettingsDraft({ inputDeviceId }),
    ),
  );
  appendSettingsRow(
    devicesCard,
    'Speakers',
    'Output device for voice channels.',
    createSettingsSelect(
      'Speaker device',
      outputDevices.map((device) => ({ value: device.deviceId, label: device.label })),
      sound.outputDeviceId,
      (outputDeviceId) => updateSoundSettingsDraft({ outputDeviceId }),
    ),
  );
  appendSettingsRow(
    devicesCard,
    'Device list',
    audioDeviceMessage || 'Scan for connected media devices.',
    createSettingsActionGroup(
      createSettingsAction('Refresh', () => void refreshAudioDevices(false), devicesLoading),
      createSettingsAction('Allow labels', () => void refreshAudioDevices(true), devicesLoading),
    ),
  );
  fragment.append(devicesCard);

  const videoCard = createSettingsCard('Video', 'Choose the camera used for Current lounge webcam sharing.');
  appendSettingsRow(
    videoCard,
    'Camera',
    'Input device for webcam sharing.',
    createSettingsSelect(
      'Camera device',
      cameraDevices.map((device) => ({ value: device.deviceId, label: device.label })),
      video.cameraDeviceId,
      (cameraDeviceId) => updateVideoSettingsDraft({ cameraDeviceId }),
    ),
  );
  appendSettingsRow(
    videoCard,
    'Resolution',
    'Preview and sharing prefer this size, subject to server limits.',
    createSegmentedControl<GaiaVideoSettings['cameraResolution']>(
      'Camera resolution',
      [
        { value: '480p', label: '480p' },
        { value: '720p', label: '720p' },
        { value: '1080p', label: '1080p' },
      ],
      video.cameraResolution,
      (cameraResolution) => updateVideoSettingsDraft({ cameraResolution }),
    ),
  );
  appendSettingsRow(
    videoCard,
    'Frame rate',
    'Lower values are easier on small servers and laptops.',
    createSegmentedControl<'15' | '30' | '60'>(
      'Camera frame rate',
      [
        { value: '15', label: '15' },
        { value: '30', label: '30' },
        { value: '60', label: '60' },
      ],
      video.cameraFrameRate === 15 || video.cameraFrameRate === 60
        ? (String(video.cameraFrameRate) as '15' | '60')
        : '30',
      (cameraFrameRate) => updateVideoSettingsDraft({ cameraFrameRate: Number(cameraFrameRate) }),
    ),
  );
  appendSettingsRow(
    videoCard,
    'Mirror preview',
    'Applies to your local preview only.',
    createSettingsToggle('Mirror camera preview', video.mirrorPreview, (mirrorPreview) =>
      updateVideoSettingsDraft({ mirrorPreview }),
    ),
  );
  appendSettingsRow(
    videoCard,
    'Preview',
    cameraPreviewMessage,
    createCameraPreviewControl(video),
  );
  fragment.append(videoCard);

  const testCard = createSettingsCard('Microphone Test', 'Check the selected input without joining a voice channel.');
  appendSettingsRow(
    testCard,
    'Input level',
    microphoneTestMessage,
    createMicrophoneTestControl(),
  );
  fragment.append(testCard);

  const outputCard = createSettingsCard('Output', 'Set voice playback level inside Gaia.');
  appendSettingsRow(
    outputCard,
    'Speaker test',
    outputTestMessage,
    createOutputTestControl(),
  );
  appendSettingsRow(
    outputCard,
    'Voice volume',
    'Applies to remote voice audio from Current servers.',
    createSettingsRange(
      'Voice output volume',
      sound.outputVolume,
      0,
      1,
      0.01,
      (outputVolume) => updateSoundSettingsDraft({ outputVolume }),
      formatVolumeLabel,
    ),
  );
  fragment.append(outputCard);

  const processingCard = createSettingsCard('Microphone Processing', 'Tune browser audio processing for voice chat.');
  appendSettingsRow(
    processingCard,
    'Noise suppression',
    'Reduces steady background noise before voice is sent.',
    createSettingsToggle('Noise suppression', sound.noiseSuppression, (noiseSuppression) =>
      updateSoundSettingsDraft({ noiseSuppression }),
    ),
  );
  appendSettingsRow(
    processingCard,
    'Echo cancellation',
    'Helps prevent speaker audio from feeding back into the microphone.',
    createSettingsToggle('Echo cancellation', sound.echoCancellation, (echoCancellation) =>
      updateSoundSettingsDraft({ echoCancellation }),
    ),
  );
  appendSettingsRow(
    processingCard,
    'Auto gain',
    'Lets the browser smooth microphone volume changes.',
    createSettingsToggle('Auto gain control', sound.autoGainControl, (autoGainControl) =>
      updateSoundSettingsDraft({ autoGainControl }),
    ),
  );
  fragment.append(processingCard);

  const pttCard = createSettingsCard('Push To Talk', 'Choose how Gaia controls voice transmission.');
  appendSettingsRow(
    pttCard,
    'Input mode',
    'Toggle keeps the microphone open until the key is pressed again.',
    createSegmentedControl<GaiaPushToTalkMode>(
      'Push to talk mode',
      [
        { value: 'voice_activity', label: 'Voice' },
        { value: 'hold', label: 'Hold' },
        { value: 'toggle', label: 'Toggle' },
      ],
      sound.pushToTalkMode,
      (pushToTalkMode) => updateSoundSettingsDraft({ pushToTalkMode }),
    ),
  );
  appendSettingsRow(
    pttCard,
    'Keybind',
    'Used for hold and toggle push-to-talk modes.',
    createSettingsAction(
      soundKeyCaptureActive ? 'Press a key...' : formatKeybindLabel(sound.pushToTalkKey),
      () => {
        soundKeyCaptureActive = true;
        renderSettingsWorkspace();
      },
    ),
  );
  fragment.append(pttCard);

  return fragment;
}

function renderPerformanceSettings(draft: GaiaSettings): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const graphicsCard = createSettingsCard('Graphics', 'Prefer simpler materials on slower GPUs.');
  appendSettingsRow(
    graphicsCard,
    'Graphics mode',
    'Fancy keeps liquid glass effects. Fast uses static panels in Gaia and hosted Current servers.',
    createSegmentedControl(
      'Graphics mode',
      [
        { value: 'fancy', label: 'Fancy' },
        { value: 'fast', label: 'Fast' },
      ],
      draft.fastGraphicsMode ? 'fast' : 'fancy',
      (graphicsMode) => updateSettingsDraft({ fastGraphicsMode: graphicsMode === 'fast' }),
    ),
  );
  appendSettingsRow(
    graphicsCard,
    'Pause animated backgrounds',
    'Freezes animated Current server wallpapers on a still frame.',
    createSettingsToggle('Pause animated backgrounds', !draft.animatedCurrentBackgrounds, (paused) =>
      updateSettingsDraft({ animatedCurrentBackgrounds: !paused }),
    ),
  );
  fragment.append(graphicsCard);

  const card = createSettingsCard('Renderer Diagnostics', 'Log frame-budget data from the renderer.');
  appendSettingsRow(
    card,
    'Perf probe',
    'Writes localStorage.gaia.perfProbe and applies after reload.',
    createSettingsToggle('Renderer perf probe', draft.perfProbe, (perfProbe) =>
      updateSettingsDraft({ perfProbe }),
    ),
  );
  fragment.append(card);
  return fragment;
}

function renderUpdateSettings(): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const statusCard = createSettingsCard('Gaia Version', updateState?.message ?? 'Loading updater status.');
  appendSettingsRow(
    statusCard,
    'Installed',
    updateVersionLabel(updateState),
    createUpdateStatusBadge(updateState),
  );
  appendSettingsRow(
    statusCard,
    'Package',
    updateInstallModeLabel(updateState),
    createUpdateActions(updateState),
  );
  if (updateState?.status === 'downloading' || updateState?.status === 'downloaded') {
    appendSettingsRow(
      statusCard,
      'Download',
      updateProgressSummary(updateState),
      createUpdateProgressControl(updateState),
    );
  }
  fragment.append(statusCard);

  const desktopCard = createSettingsCard(
    'Desktop Builds',
    'Gaia publishes update metadata for Windows, macOS, and Linux packages.',
  );
  appendSettingsRow(
    desktopCard,
    'Windows',
    'Installer builds fetch beta.yml and can download updates from the latest release assets.',
    createUpdatePill('Auto update'),
  );
  appendSettingsRow(
    desktopCard,
    'macOS',
    'DMG and zip builds fetch beta-mac.yml from the latest release assets.',
    createUpdatePill('Auto update'),
  );
  fragment.append(desktopCard);

  const linuxCard = createSettingsCard('Linux Builds', 'AppImage is the primary no-terminal updater across Linux desktops.');
  appendSettingsRow(
    linuxCard,
    'Portable',
    'Use the AppImage on Fedora, Bazzite, Arch, CachyOS, Debian, Ubuntu, and similar distros.',
    createUpdatePill('Primary'),
  );
  appendSettingsRow(
    linuxCard,
    'Native',
    'DEB, RPM, Pacman, and tar.gz artifacts are built for distro-native installs.',
    createSettingsAction('Releases', () => {
      void runUpdateAction('downloads');
    }, updateActionInFlight !== null),
  );
  fragment.append(linuxCard);
  return fragment;
}

function renderActiveSettingsSection(sectionId: SettingsSectionId, draft: GaiaSettings): DocumentFragment {
  if (sectionId === 'appearance') {
    return renderAppearanceSettings(draft);
  }
  if (sectionId === 'messages') {
    return renderMessageSettings(draft);
  }
  if (sectionId === 'connections') {
    return renderConnectionsSettings(draft);
  }
  if (sectionId === 'sound') {
    return renderSoundSettings(draft);
  }
  if (sectionId === 'updates') {
    return renderUpdateSettings();
  }
  if (sectionId === 'performance') {
    return renderPerformanceSettings(draft);
  }
  return renderGeneralSettings(draft);
}

function renderSettingsWorkspace(): void {
  if (!store) {
    return;
  }

  const draft = settingsDraft ?? cloneSettings(currentSettings());
  settingsDraft ??= draft;
  settingsSearchInput.value = settingsSearchQuery;

  const sections = filteredSettingsSections();
  if (sections.length > 0 && !sections.some((section) => section.id === activeSettingsSection)) {
    activeSettingsSection = sections[0].id;
  }

  const navFragment = document.createDocumentFragment();
  for (const section of sections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.active = section.id === activeSettingsSection ? 'true' : 'false';
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector('strong')!.textContent = section.title;
    button.querySelector('span')!.textContent = section.summary;
    button.addEventListener('click', () => {
      soundKeyCaptureActive = false;
      if (activeSettingsSection === 'sound' && section.id !== 'sound') {
        stopMicrophoneTest({ render: false });
        stopCameraPreview({ render: false });
      }
      activeSettingsSection = section.id;
      renderSettingsWorkspace();
    });
    navFragment.append(button);
  }
  if (sections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    empty.textContent = 'No settings match.';
    navFragment.append(empty);
  }
  settingsNav.replaceChildren(navFragment);

  const section = SETTINGS_SECTIONS.find((item) => item.id === activeSettingsSection) ?? SETTINGS_SECTIONS[0];
  settingsSectionEyebrow.textContent = 'App Settings';
  settingsSectionTitle.textContent = section.title;
  settingsSectionSummary.textContent = section.summary;
  settingsContent.replaceChildren(renderActiveSettingsSection(section.id, draft));

  syncSettingsSaveBar();
}

function currentAccentPickerValue(): string | null {
  const hexInput = settingsContent.querySelector<HTMLInputElement>('.settings-accent-hex');
  const colorInput = settingsContent.querySelector<HTMLInputElement>('.settings-accent-preview input[type="color"]');
  return (
    normalizeAccentColor(hexInput?.value) ??
    normalizeAccentColor(colorInput?.value) ??
    normalizeAccentColor(accentPickerDraftColor)
  );
}

function settingsDraftForSave(): GaiaSettings | null {
  if (!store) {
    return null;
  }

  const draft = cloneSettings(settingsDraft ?? currentSettings());
  const accentColor = currentAccentPickerValue();
  if (accentColor) {
    draft.accentColor = accentColor;
  }
  return draft;
}

function settingsPatchForSave(draft: GaiaSettings): GaiaSettingsPatch {
  const current = currentSettings();
  const patch: GaiaSettingsPatch = {};

  if (draft.startupView !== current.startupView) {
    patch.startupView = draft.startupView;
  }
  if (draft.lastContentView !== current.lastContentView) {
    patch.lastContentView = draft.lastContentView;
  }
  if (draft.appearanceMode !== current.appearanceMode) {
    patch.appearanceMode = draft.appearanceMode;
  }
  if (draft.accentColor !== current.accentColor) {
    patch.accentColor = draft.accentColor;
  }
  if (draft.density !== current.density) {
    patch.density = draft.density;
  }
  if (draft.reducedMotion !== current.reducedMotion) {
    patch.reducedMotion = draft.reducedMotion;
  }
  if (draft.gifPlayback !== current.gifPlayback) {
    patch.gifPlayback = draft.gifPlayback;
  }
  if (draft.animatedCurrentBackgrounds !== current.animatedCurrentBackgrounds) {
    patch.animatedCurrentBackgrounds = draft.animatedCurrentBackgrounds;
  }
  if (draft.fastGraphicsMode !== current.fastGraphicsMode) {
    patch.fastGraphicsMode = draft.fastGraphicsMode;
  }
  if (draft.perfProbe !== current.perfProbe) {
    patch.perfProbe = draft.perfProbe;
  }
  if (!soundSettingsEqual(draft.sound, current.sound)) {
    patch.sound = { ...draft.sound };
  }
  if (!videoSettingsEqual(draft.video, current.video)) {
    patch.video = { ...draft.video };
  }
  if (!p2pVoiceSettingsEqual(draft.p2pVoice, current.p2pVoice)) {
    patch.p2pVoice = {
      turnServers: [...draft.p2pVoice.turnServers],
    };
  }

  return patch;
}

async function saveSettingsDraft(): Promise<void> {
  if (!store) {
    return;
  }

  const draft = settingsDraftForSave();
  if (!draft || settingsEqual(draft, currentSettings())) {
    return;
  }
  const patch = settingsPatchForSave(draft);
  if (Object.keys(patch).length === 0) {
    return;
  }

  settingsDraft = draft;
  soundKeyCaptureActive = false;
  stopCameraPreview({ render: false });
  settingsSaveInFlight = true;
  renderSettingsWorkspace();
  try {
    store = await window.gaia.updateSettings(patch);
    settingsDraft = cloneSettings(store.settings);
    lastContentView = store.settings.lastContentView;
    applyAppSettings(store.settings);
    renderMessages();
    setStatus('Settings saved', 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Settings failed', 'bad');
  } finally {
    settingsSaveInFlight = false;
    renderSettingsWorkspace();
  }
}

function resetSettingsDraft(): void {
  soundKeyCaptureActive = false;
  stopMicrophoneTest({ render: false });
  stopCameraPreview({ render: false });
  settingsDraft = cloneSettings(currentSettings());
  applyAppearanceMode(settingsDraft);
  applyAccentColor(settingsDraft);
  renderSettingsWorkspace();
}

function selectedServer(): GaiaServer | undefined {
  return store?.servers.find((server) => server.id === selectedServerId);
}

function serverRailIdentity(server: GaiaServer) {
  const identity = serverRailIdentityCache.get(server.id);
  return identity?.sourceUrl === server.url ? identity : undefined;
}

function serverRailName(server: GaiaServer): string {
  return serverRailIdentity(server)?.name ?? server.name;
}

function serverRailIconUrl(server: GaiaServer): string | undefined {
  return serverRailIdentity(server)?.iconUrl;
}

function updateServerRailIdentity(server: GaiaServer, appearance: GaiaCurrentAppearance): boolean {
  const currentIdentity = serverRailIdentityCache.get(server.id);
  const nextName = appearance.serverName?.trim() || undefined;
  const nextIconUrl = appearance.serverIconUrl;

  if (!nextName && !nextIconUrl) {
    if (currentIdentity && currentIdentity.sourceUrl !== server.url) {
      serverRailIdentityCache.delete(server.id);
      return true;
    }
    return false;
  }

  const nextIdentity = {
    sourceUrl: server.url,
    name: nextName,
    iconUrl: nextIconUrl,
  };
  const changed =
    currentIdentity?.sourceUrl !== nextIdentity.sourceUrl ||
    currentIdentity?.name !== nextIdentity.name ||
    currentIdentity?.iconUrl !== nextIdentity.iconUrl;

  if (changed) {
    serverRailIdentityCache.set(server.id, nextIdentity);
  }

  return changed;
}

async function refreshServerRailIdentities(): Promise<void> {
  if (!store?.servers.length || !clientAuthStatus.authenticated) {
    return;
  }

  const requestId = ++serverRailIdentityRequestId;
  const servers = [...store.servers];
  const results = await Promise.allSettled(
    servers.map(async (server) => ({
      appearance: await window.gaia.getCurrentAppearance(server.url),
      server,
    })),
  );
  if (requestId !== serverRailIdentityRequestId) {
    return;
  }

  let changed = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') {
      continue;
    }
    changed = updateServerRailIdentity(result.value.server, result.value.appearance) || changed;
  }

  if (changed) {
    render();
  }
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number) => {
    let t = normalizedHue + offset;
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  };

  return {
    red: Math.round(channel(1 / 3) * 255),
    green: Math.round(channel(0) * 255),
    blue: Math.round(channel(-1 / 3) * 255),
  };
}

function serverAccentColor(server: GaiaServer): RgbColor {
  const hash = hashText(`${server.id}:${server.name}:${server.url}`);
  return hslToRgb(hash % 360, 0.54, 0.36);
}

function serverFallbackBackgroundCss(server: GaiaServer): string {
  const hash = hashText(`${server.id}:${server.url}`);
  const primary = serverAccentColor(server);
  const secondary = hslToRgb((hash >>> 8) % 360, 0.42, 0.32);
  const tertiary = hslToRgb((hash >>> 16) % 360, 0.36, 0.24);
  return [
    `radial-gradient(circle at 18% 16%, rgba(${primary.red}, ${primary.green}, ${primary.blue}, 0.28), transparent 34%)`,
    `radial-gradient(circle at 82% 18%, rgba(${secondary.red}, ${secondary.green}, ${secondary.blue}, 0.2), transparent 31%)`,
    `radial-gradient(circle at 70% 86%, rgba(${tertiary.red}, ${tertiary.green}, ${tertiary.blue}, 0.22), transparent 36%)`,
    'linear-gradient(155deg, #050a12 0%, #0a121e 48%, #11141e 100%)',
  ].join(', ');
}

function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) {
    return '?';
  }
  const words = cleaned.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

function sameOrigin(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).origin === new URL(urlB).origin;
  } catch {
    return false;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSameServerUrl(server: GaiaServer, url: string): boolean {
  try {
    return new URL(server.url).origin === new URL(url).origin;
  } catch {
    return false;
  }
}

function isSameUrl(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).toString() === new URL(urlB).toString();
  } catch {
    return false;
  }
}

function isAuthTicketCleanupNavigation(currentUrl: string, nextUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);
    return (
      current.origin === next.origin &&
      current.searchParams.has('current_auth_ticket') &&
      !next.searchParams.has('current_auth_ticket')
    );
  } catch {
    return false;
  }
}

function isBlueskyAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'bsky.social' ||
      hostname.endsWith('.bsky.social') ||
      hostname === 'bsky.app' ||
      hostname.endsWith('.bsky.app')
    );
  } catch {
    return false;
  }
}

function setStatus(text: string, tone: 'neutral' | 'good' | 'warn' | 'bad' = 'neutral'): void {
  statusPill.textContent = text;
  statusPill.dataset.tone = tone;
}

function serverById(serverId: string | null): GaiaServer | undefined {
  return serverId ? store?.servers.find((server) => server.id === serverId) : undefined;
}

function isServerWebviewLoadedForServer(webview: WebviewElement, server: GaiaServer): boolean {
  return webview.src !== 'about:blank' && isSameServerUrl(server, webview.src);
}

function serverForWebview(webview: WebviewElement): GaiaServer | undefined {
  return serverById(webview.dataset.serverId ?? null);
}

function serverPageLoadPhase(webview: WebviewElement): ServerPageLoadPhase {
  const phase = webview.dataset.pageLoadPhase;
  return phase === 'loading' || phase === 'ready' || phase === 'failed' ? phase : 'idle';
}

function isWorkspacePageVisible(page: HTMLElement): boolean {
  return !page.classList.contains('is-view-hidden') || page.classList.contains('is-view-fading-out');
}

function hasLoadedServerWebviews(): boolean {
  for (const webview of serverWebviews.values()) {
    if (webview.src !== 'about:blank') {
      return true;
    }
  }
  return false;
}

function setWorkspacePageVisible(page: HTMLElement, visible: boolean, fade: boolean): void {
  page.classList.remove('hidden');
  if (visible) {
    const timer = workspacePageFadeTimers.get(page);
    if (timer) {
      window.clearTimeout(timer);
      workspacePageFadeTimers.delete(page);
    }
    page.classList.remove('is-view-hidden', 'is-view-fading-out');
    page.classList.add('is-view-active');
    return;
  }

  page.classList.remove('is-view-active');
  if (!fade && page.classList.contains('is-view-fading-out')) {
    return;
  }

  const timer = workspacePageFadeTimers.get(page);
  if (timer) {
    window.clearTimeout(timer);
    workspacePageFadeTimers.delete(page);
  }

  if (fade && isWorkspacePageVisible(page)) {
    page.classList.add('is-view-fading-out', 'is-view-hidden');
    const fadeTimer = window.setTimeout(() => {
      page.classList.remove('is-view-fading-out');
      workspacePageFadeTimers.delete(page);
      syncServerWebviewVisibility();
    }, WORKSPACE_PAGE_FADE_MS + 40);
    workspacePageFadeTimers.set(page, fadeTimer);
    return;
  }

  page.classList.remove('is-view-fading-out');
  page.classList.add('is-view-hidden');
}

function isServerWorkspaceReady(serverId: string | null): boolean {
  const server = serverById(serverId);
  const webview = serverId ? serverWebviews.get(serverId) : undefined;
  return Boolean(
    server &&
      webview &&
      isServerWebviewLoadedForServer(webview, server) &&
      serverPageLoadPhase(webview) === 'ready',
  );
}

function isWorkspaceViewReady(view: ActiveView | null, serverId: string | null): boolean {
  if (!view) {
    return false;
  }
  if (view === 'server') {
    return isServerWorkspaceReady(serverId);
  }
  if (view === 'messages') {
    return messagesWorkspaceReady || convos.length > 0 || convoPageCache.size > 0;
  }
  if (view === 'notifications') {
    return true;
  }
  return Boolean(store);
}

function shouldFadeWorkspaceTransition(
  previousView: ActiveView | null,
  nextView: ActiveView | null,
  previousServerId: string | null,
  nextServerId: string | null,
): boolean {
  return Boolean(
    previousView &&
      nextView &&
      previousView !== nextView &&
      !currentSettings().reducedMotion &&
      isWorkspaceViewReady(previousView, previousServerId) &&
      isWorkspaceViewReady(nextView, nextServerId),
  );
}

function clearServerPageRevealTimer(): void {
  if (!serverPageRevealTimer) {
    return;
  }
  window.clearTimeout(serverPageRevealTimer);
  serverPageRevealTimer = undefined;
}

function isActiveServerWebview(webview: WebviewElement): boolean {
  const server = serverForWebview(webview);
  return Boolean(server && selectedServerId === server.id && activeView === 'server' && serverWebview === webview);
}

function syncServerPageLoader(): void {
  const activeServer = selectedServer();
  const stackVisible = isWorkspacePageVisible(serverWebviewStack);
  const phase = serverPageLoadPhase(serverWebview);
  const shouldBlockPage = Boolean(
    activeServer &&
      stackVisible &&
      serverForWebview(serverWebview)?.id === activeServer.id &&
      (phase === 'idle' || phase === 'loading'),
  );

  serverWebviewStack.classList.toggle('is-page-loading', shouldBlockPage);
  serverPageLoader.classList.toggle('is-visible', shouldBlockPage);
  serverPageLoader.setAttribute('aria-hidden', shouldBlockPage ? 'false' : 'true');
  serverPageLoader.setAttribute('aria-busy', shouldBlockPage ? 'true' : 'false');
}

function setServerPageLoadPhase(webview: WebviewElement, phase: ServerPageLoadPhase): void {
  if (phase === 'loading') {
    clearServerPageRevealTimer();
  }
  webview.dataset.pageLoadPhase = phase;
  if (isActiveServerWebview(webview)) {
    syncServerPageLoader();
  }
}

function revealServerPageWhenSettled(webview: WebviewElement): void {
  clearServerPageRevealTimer();
  serverPageRevealTimer = window.setTimeout(() => {
    serverPageRevealTimer = undefined;
    window.requestAnimationFrame(() => {
      if (serverPageLoadPhase(webview) !== 'loading') {
        return;
      }
      setServerPageLoadPhase(webview, 'ready');
    });
  }, SERVER_PAGE_REVEAL_DELAY_MS);
}

function allowNextServerWebviewNavigation(webview: WebviewElement): void {
  webview.dataset.allowServerNavigationUntil = String(Date.now() + SERVER_WEBVIEW_ALLOWED_NAVIGATION_MS);
}

function consumeAllowedServerWebviewNavigation(webview: WebviewElement): boolean {
  const allowedUntil = Number(webview.dataset.allowServerNavigationUntil ?? 0);
  if (!Number.isFinite(allowedUntil) || Date.now() > allowedUntil) {
    delete webview.dataset.allowServerNavigationUntil;
    return false;
  }

  delete webview.dataset.allowServerNavigationUntil;
  return true;
}

function cancelServerWebviewSuspend(serverId: string): void {
  const timer = serverWebviewSuspendTimers.get(serverId);
  if (!timer) {
    return;
  }
  window.clearTimeout(timer);
  serverWebviewSuspendTimers.delete(serverId);
}

function scheduleServerWebviewSuspend(serverId: string): void {
  if (serverWebviewSuspendTimers.has(serverId)) {
    return;
  }
  const webview = serverWebviews.get(serverId);
  if (!webview || webview.src === 'about:blank') {
    return;
  }

  const timer = window.setTimeout(() => {
    serverWebviewSuspendTimers.delete(serverId);
    if (activeView === 'server' && selectedServerId === serverId && isWorkspacePageVisible(serverWebviewStack)) {
      return;
    }
    const currentWebview = serverWebviews.get(serverId);
    if (currentWebview && currentWebview.src !== 'about:blank') {
      void isServerWebviewInVoiceSession(currentWebview).then((inVoiceSession) => {
        if (serverWebviews.get(serverId) !== currentWebview) {
          return;
        }
        if (activeView === 'server' && selectedServerId === serverId && isWorkspacePageVisible(serverWebviewStack)) {
          return;
        }
        if (!inVoiceSession) {
          currentWebview.dataset.suspendedUrl = currentWebview.src;
          setServerPageLoadPhase(currentWebview, 'idle');
          currentWebview.src = 'about:blank';
          syncServerWebviewVisibility();
          return;
        }
        scheduleServerWebviewSuspend(serverId);
        syncServerWebviewVisibility();
      });
    }
  }, SERVER_WEBVIEW_SUSPEND_MS);
  serverWebviewSuspendTimers.set(serverId, timer);
}

async function isServerWebviewInVoiceSession(webview: WebviewElement): Promise<boolean> {
  if (webview.src === 'about:blank') {
    webview.dataset.voiceSessionActive = 'false';
    return false;
  }

  try {
    const connected = await webview.executeJavaScript<boolean>(CURRENT_VOICE_SESSION_QUERY, true);
    const isConnected = connected === true;
    webview.dataset.voiceSessionActive = isConnected ? 'true' : 'false';
    return isConnected;
  } catch {
    return webview.dataset.voiceSessionActive === 'true';
  }
}

function configureServerWebview(webview: WebviewElement): void {
  if (webview.dataset.configured === 'true') {
    return;
  }

  webview.dataset.configured = 'true';
  webview.setAttribute('partition', CURRENT_PARTITION);
  webview.setAttribute('webpreferences', 'backgroundThrottling=no, contextIsolation=yes, nodeIntegration=no, sandbox=yes');

  webview.addEventListener('did-start-loading', () => {
    if (serverPageLoadPhase(webview) !== 'ready') {
      setServerPageLoadPhase(webview, 'loading');
    }
  });
  webview.addEventListener('did-stop-loading', () => {
    if (serverPageLoadPhase(webview) !== 'loading') {
      void isServerWebviewInVoiceSession(webview);
      return;
    }
    const server = serverForWebview(webview);
    if (!server || selectedServerId !== server.id || activeView !== 'server') {
      setServerPageLoadPhase(webview, 'ready');
      void isServerWebviewInVoiceSession(webview);
      return;
    }
    revealServerPageWhenSettled(webview);
    void isServerWebviewInVoiceSession(webview);
  });
  webview.addEventListener('did-finish-load', () => {
    const server = serverForWebview(webview);
    if (!server || selectedServerId !== server.id || activeView !== 'server') {
      setServerPageLoadPhase(webview, 'ready');
      void isServerWebviewInVoiceSession(webview);
      return;
    }
    revealServerPageWhenSettled(webview);
    queueCurrentAppearanceRefreshes();
    void isServerWebviewInVoiceSession(webview);
  });
  webview.addEventListener('will-navigate', (event: Event) => {
    handleServerExternalNavigation(event as WebviewNavigationEvent, webview, true);
  });
  webview.addEventListener('did-navigate', (event: Event) => {
    handleServerExternalNavigation(event as WebviewNavigationEvent, webview, false);
  });
  webview.addEventListener('did-fail-load', (event: Event) => {
    const loadEvent = event as Event & { errorCode?: number; isMainFrame?: boolean };
    if (loadEvent.errorCode === -3 || loadEvent.isMainFrame === false) {
      return;
    }
    const server = serverForWebview(webview);
    if (!server || selectedServerId !== server.id || activeView !== 'server') {
      setServerPageLoadPhase(webview, 'failed');
      return;
    }
    setServerPageLoadPhase(webview, 'failed');
    setStatus('Load failed', 'bad');
  });
  webview.addEventListener('media-started-playing', () => {
    void isServerWebviewInVoiceSession(webview).then((inVoiceSession) => {
      const server = serverForWebview(webview);
      if (server && inVoiceSession) {
        cancelServerWebviewSuspend(server.id);
      }
    });
  });
  webview.addEventListener('media-paused', () => {
    void isServerWebviewInVoiceSession(webview).then(() => {
      const server = serverForWebview(webview);
      const visibleActiveServer =
        server &&
        activeView === 'server' &&
        selectedServerId === server.id &&
        webview === serverWebview &&
        isWorkspacePageVisible(serverWebviewStack);
      if (server && !visibleActiveServer) {
        scheduleServerWebviewSuspend(server.id);
      }
    });
  });
}

function createServerWebview(server: GaiaServer): WebviewElement {
  const reusableWebview = !serverWebview.dataset.serverId && serverWebviews.size === 0
    ? serverWebview
    : document.createElement('webview') as WebviewElement;

  reusableWebview.id = reusableWebview === serverWebview ? 'serverWebview' : `serverWebview-${server.id}`;
  reusableWebview.className = 'server-webview hidden';
  reusableWebview.dataset.serverId = server.id;
  reusableWebview.dataset.serverUrl = server.url;
  configureServerWebview(reusableWebview);
  if (!reusableWebview.parentElement) {
    serverWebviewStack.append(reusableWebview);
  }
  serverWebviews.set(server.id, reusableWebview);
  return reusableWebview;
}

function ensureServerWebview(server: GaiaServer): WebviewElement {
  const webview = serverWebviews.get(server.id) ?? createServerWebview(server);
  configureServerWebview(webview);
  cancelServerWebviewSuspend(server.id);
  if (webview.dataset.serverUrl !== server.url) {
    webview.dataset.serverUrl = server.url;
    webview.dataset.suspendedUrl = '';
    setServerPageLoadPhase(webview, 'idle');
    if (webview.src !== 'about:blank') {
      webview.src = 'about:blank';
    }
    serverSessionCache.delete(server.id);
    serverProbeCache.delete(server.id);
    serverBackgroundCache.delete(server.id);
  }
  return webview;
}

function pruneServerWebviews(): void {
  const liveServerIds = new Set(store?.servers.map((server) => server.id) ?? []);
  for (const [serverId, webview] of serverWebviews) {
    if (liveServerIds.has(serverId)) {
      continue;
    }
    cancelServerWebviewSuspend(serverId);
    webview.remove();
    serverWebviews.delete(serverId);
    serverSessionCache.delete(serverId);
    serverProbeCache.delete(serverId);
    serverBackgroundCache.delete(serverId);
    serverRailIdentityCache.delete(serverId);
  }
}

function syncServerWebviewVisibility(fade = false): void {
  const showServerWebview =
    clientAuthStatus.authenticated &&
    activeView === 'server' &&
    Boolean(selectedServer()) &&
    Boolean(store?.servers.length);
  const keepServerWebviewsMounted =
    clientAuthStatus.authenticated &&
    !showServerWebview &&
    hasLoadedServerWebviews();
  setWorkspacePageVisible(serverWebviewStack, showServerWebview || keepServerWebviewsMounted, fade && !keepServerWebviewsMounted);
  serverWebviewStack.classList.toggle('is-background-mounted', keepServerWebviewsMounted);
  const keepFadingServerWebview = serverWebviewStack.classList.contains('is-view-fading-out');

  for (const [serverId, webview] of serverWebviews) {
    const isActive = (showServerWebview || keepFadingServerWebview) && webview === serverWebview;
    webview.classList.toggle('hidden', !isActive);
    if (isActive) {
      cancelServerWebviewSuspend(serverId);
    } else {
      scheduleServerWebviewSuspend(serverId);
    }
  }
  syncServerPageLoader();
}

function setActiveServerWebview(server: GaiaServer): WebviewElement {
  const webview = ensureServerWebview(server);
  serverWebview = webview;
  return webview;
}

function activateServerWebview(server: GaiaServer): WebviewElement {
  const webview = setActiveServerWebview(server);
  syncServerWebviewVisibility();
  return webview;
}

function loadServerWebview(server: GaiaServer, options: { force?: boolean } = {}): void {
  const webview = activateServerWebview(server);
  if (!options.force && isServerWebviewLoadedForServer(webview, server)) {
    if (serverPageLoadPhase(webview) === 'idle') {
      setServerPageLoadPhase(webview, 'ready');
    }
    return;
  }
  setServerPageLoadPhase(webview, 'loading');
  allowNextServerWebviewNavigation(webview);
  webview.src = server.url;
}

function rememberServerProbe(server: GaiaServer, probe: GaiaServerProbe): ServerProbeSnapshot {
  const snapshot = {
    ...probe,
    checkedAt: Date.now(),
  };
  serverProbeCache.set(server.id, snapshot);
  serverSessionCache.set(server.id, {
    authenticated: Boolean(probe.authenticated),
    checkedAt: snapshot.checkedAt,
  });
  return snapshot;
}

async function probeCurrentServer(server: GaiaServer, force = false): Promise<ServerProbeSnapshot> {
  const cached = serverProbeCache.get(server.id);
  if (!force && cached && Date.now() - cached.checkedAt < SERVER_PROBE_CACHE_TTL_MS) {
    return cached;
  }

  const probe = await window.gaia.probeServer(server.url);
  return rememberServerProbe(server, probe);
}

function selectedConvo(): GaiaBskyConvo | undefined {
  return convos.find((convo) => convo.id === selectedConvoId);
}

function cacheKey(cursor?: string): string {
  return cursor ?? '__first__';
}

function messageCacheKey(convoId: string, cursor?: string): string {
  return `${convoId}::${cursor ?? '__first__'}`;
}

function messageSentTime(message: GaiaBskyMessage): number {
  const time = Date.parse(message.sentAt);
  return Number.isNaN(time) ? 0 : time;
}

function orderMessagesForThread(nextMessages: GaiaBskyMessage[]): GaiaBskyMessage[] {
  return [...nextMessages].sort((a, b) => messageSentTime(a) - messageSentTime(b) || a.id.localeCompare(b.id));
}

function latestMessageId(nextMessages: GaiaBskyMessage[]): string | undefined {
  return orderMessagesForThread(nextMessages).at(-1)?.id;
}

function rememberBskyNotificationMessageId(messageId: string): void {
  bskyNotifiedMessageIds.delete(messageId);
  bskyNotifiedMessageIds.add(messageId);
  while (bskyNotifiedMessageIds.size > BSKY_NOTIFICATION_TRACK_LIMIT) {
    const oldestMessageId = bskyNotifiedMessageIds.values().next().value;
    if (!oldestMessageId) {
      return;
    }
    bskyNotifiedMessageIds.delete(oldestMessageId);
  }
}

function primeBskyNotificationBaseline(nextConvos: GaiaBskyConvo[]): void {
  const ownDid = clientAuthStatus.profile?.did;
  if (!ownDid) {
    bskyNotificationBaselineReady = false;
    bskyNotifiedMessageIds.clear();
    return;
  }

  for (const convo of nextConvos) {
    const lastMessage = convo.lastMessage;
    if (lastMessage && lastMessage.senderDid !== ownDid && (convo.unreadCount ?? 0) > 0) {
      rememberBskyNotificationMessageId(lastMessage.id);
    }
  }
  bskyNotificationBaselineReady = true;
}

type BskyMessageDesktopNotification = {
  convoId: string;
  messageId: string;
  title: string;
  body: string;
  icon?: string;
};

function bskyMessagePreview(text: string | undefined): string {
  const preview = text?.replace(/\s+/g, ' ').trim();
  if (!preview) {
    return 'Sent a message.';
  }
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

function createBskyMessageDesktopNotification(convo: GaiaBskyConvo): BskyMessageDesktopNotification | null {
  const lastMessage = convo.lastMessage;
  if (!lastMessage) {
    return null;
  }

  const actor = convo.members.find((member) => member.did === lastMessage.senderDid);
  const senderName = actor ? displayActor(actor) : 'Bluesky user';
  return {
    convoId: convo.id,
    messageId: lastMessage.id,
    title: senderName,
    body: bskyMessagePreview(lastMessage.text),
    icon: actor?.avatar,
  };
}

async function showBskyMessageDesktopNotification(item: BskyMessageDesktopNotification): Promise<void> {
  if (!('Notification' in window) || Notification.permission === 'denied') {
    return;
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return;
  }

  const toast = new Notification(item.title, {
    body: item.body,
    icon: item.icon,
  });
  toast.onclick = () => {
    window.focus();
    selectedConvoId = item.convoId;
    switchToMessagesView();
    void loadMessagesPage(undefined, true);
    toast.close();
  };
}

function shouldPlayBskyMessageNotification(
  previousConvos: GaiaBskyConvo[],
  nextConvos: GaiaBskyConvo[],
): BskyMessageDesktopNotification[] {
  const ownDid = clientAuthStatus.profile?.did;
  if (!ownDid) {
    return [];
  }

  if (!bskyNotificationBaselineReady) {
    primeBskyNotificationBaseline(nextConvos);
    return [];
  }

  const previousById = new Map(previousConvos.map((convo) => [convo.id, convo]));
  const notifications: BskyMessageDesktopNotification[] = [];

  for (const convo of nextConvos) {
    const lastMessage = convo.lastMessage;
    if (!lastMessage || lastMessage.senderDid === ownDid || (convo.unreadCount ?? 0) <= 0) {
      continue;
    }

    const previousConvo = previousById.get(convo.id);
    const previousLastMessageId = previousConvo?.lastMessage?.id;
    if (previousLastMessageId === lastMessage.id || bskyNotifiedMessageIds.has(lastMessage.id)) {
      continue;
    }

    rememberBskyNotificationMessageId(lastMessage.id);
    const notification = createBskyMessageDesktopNotification(convo);
    if (notification) {
      notifications.push(notification);
    }
  }

  return notifications;
}

function keepExistingConvoOrder(nextConvos: GaiaBskyConvo[]): GaiaBskyConvo[] {
  if (convos.length === 0) {
    return nextConvos;
  }

  const incomingById = new Map(nextConvos.map((convo) => [convo.id, convo]));
  const seen = new Set<string>();
  const ordered: GaiaBskyConvo[] = [];

  for (const existing of convos) {
    const convo = incomingById.get(existing.id);
    if (!convo || seen.has(convo.id)) {
      continue;
    }
    ordered.push(convo);
    seen.add(convo.id);
  }

  for (const convo of nextConvos) {
    if (seen.has(convo.id)) {
      continue;
    }
    ordered.push(convo);
    seen.add(convo.id);
  }

  return ordered;
}

function convoStorageKey(): string | undefined {
  const did = clientAuthStatus.profile?.did;
  return did ? `gaia:bsky:convos:${did}` : undefined;
}

function persistConvosCache(): void {
  const key = convoStorageKey();
  if (!key) {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        cachedAt: Date.now(),
        convos: convos.slice(0, CONVO_CACHE_LIMIT),
      }),
    );
  } catch {
    // Local cache is an optimization only.
  }
}

function restoreConvosCache(): boolean {
  const key = convoStorageKey();
  if (!key || convos.length > 0) {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as { convos?: GaiaBskyConvo[] };
    if (!Array.isArray(parsed.convos) || parsed.convos.length === 0) {
      return false;
    }

    convos = parsed.convos.slice(0, CONVO_CACHE_LIMIT);
    messagesWorkspaceReady = true;
    nextConvoCursor = undefined;
    convoPageCache.set(cacheKey(), {
      convos,
      cursor: undefined,
    });
    selectedConvoId = selectedConvoId ?? convos[0]?.id ?? null;
    primeBskyNotificationBaseline(convos);
    return true;
  } catch {
    return false;
  }
}

function setConvos(nextConvos: GaiaBskyConvo[], cursor?: string): void {
  messagesWorkspaceReady = true;
  convos = keepExistingConvoOrder(nextConvos).slice(0, CONVO_CACHE_LIMIT);
  nextConvoCursor = cursor;
  convoPageCache.set(cacheKey(), {
    convos,
    cursor,
  });
  persistConvosCache();
}

function upsertConvo(convo: GaiaBskyConvo): void {
  const existingIndex = convos.findIndex((item) => item.id === convo.id);
  if (existingIndex >= 0) {
    setConvos(
      convos.map((item) => (item.id === convo.id ? convo : item)),
      nextConvoCursor,
    );
    return;
  }
  setConvos([...convos, convo], nextConvoCursor);
}

function updateConvoLastMessage(convoId: string, lastMessage: GaiaBskyMessage): void {
  convos = convos.map((convo) => (convo.id === convoId ? { ...convo, lastMessage } : convo));
  convoPageCache.set(cacheKey(), {
    convos,
    cursor: nextConvoCursor,
  });
  persistConvosCache();
}

function updateConvoReadState(convoId: string, unreadCount: number): void {
  convos = convos.map((convo) => (convo.id === convoId ? { ...convo, unreadCount } : convo));
  convoPageCache.set(cacheKey(), {
    convos,
    cursor: nextConvoCursor,
  });
  persistConvosCache();
}

function displayActor(actor: { did: string; handle?: string; displayName?: string }): string {
  return actor.displayName?.trim() || actor.handle?.trim() || 'Bluesky user';
}

function conversationMembers(convo: GaiaBskyConvo): GaiaBskyConvo['members'] {
  const ownDid = clientAuthStatus.profile?.did;
  const others = ownDid ? convo.members.filter((member) => member.did !== ownDid) : convo.members;
  return others.length > 0 ? others : convo.members;
}

function convoTitle(convo: GaiaBskyConvo): string {
  return conversationMembers(convo).map(displayActor).join(', ') || 'Conversation';
}

function handleLabel(actor: GaiaBskyConvo['members'][number] | GaiaBskyProfile | undefined): string {
  if (!actor?.handle) {
    return '';
  }
  return actor.handle.startsWith('@') ? actor.handle : `@${actor.handle}`;
}

function convoSubtitle(convo: GaiaBskyConvo): string {
  const members = conversationMembers(convo);
  if (members.length === 1) {
    return handleLabel(members[0]) || 'Direct message';
  }
  return `${members.length} people`;
}

function actorForDid(did: string): GaiaBskyConvo['members'][number] | undefined {
  if (clientAuthStatus.profile?.did === did) {
    return clientAuthStatus.profile;
  }
  return selectedConvo()?.members.find((member) => member.did === did);
}

function avatarInitials(name: string): string {
  return initials(name).slice(0, 2);
}

function buildAvatar(
  actor: GaiaBskyConvo['members'][number] | undefined,
  fallback: string,
  size: 'sm' | 'md' = 'md',
): HTMLElement {
  const name = actor ? displayActor(actor) : fallback;
  if (actor?.avatar) {
    const image = document.createElement('img');
    image.className = `avatar avatar-${size}`;
    image.src = actor.avatar;
    image.alt = name;
    image.loading = 'lazy';
    return image;
  }

  const avatar = document.createElement('span');
  avatar.className = `avatar avatar-${size}`;
  avatar.textContent = avatarInitials(name);
  avatar.title = name;
  return avatar;
}

function didLabel(did: string): string {
  const actor = actorForDid(did);
  return actor ? displayActor(actor) : 'Bluesky user';
}

function convoPrimaryActor(convo: GaiaBskyConvo): GaiaBskyConvo['members'][number] | undefined {
  return conversationMembers(convo)[0];
}

function actorForConvoDid(convo: GaiaBskyConvo, did: string): GaiaBskyConvo['members'][number] {
  if (clientAuthStatus.profile?.did === did) {
    return clientAuthStatus.profile;
  }
  return convo.members.find((member) => member.did === did) ?? { did };
}

function messageSenderLabel(message: GaiaBskyMessage): string {
  return didLabel(message.senderDid);
}

function hasOwnReaction(message: GaiaBskyMessage, value: string): boolean {
  const ownDid = clientAuthStatus.profile?.did;
  if (!ownDid) {
    return false;
  }
  return Boolean(message.reactions?.some((reaction) => reaction.value === value && reaction.senderDids.includes(ownDid)));
}

function reactionPendingKey(convoId: string, messageId: string, value: string): string {
  return `${convoId}:${messageId}:${value}`;
}

function loadRecentReactionEmojis(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_REACTION_STORAGE_KEY) ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      const recent = parsed.filter((emoji): emoji is string => typeof emoji === 'string' && emoji.trim().length > 0);
      if (recent.length > 0) {
        return recent.slice(0, 3);
      }
    }
  } catch {
    // Recent reactions are cosmetic.
  }
  return [...DEFAULT_RECENT_REACTION_EMOJIS];
}

function loadEmojiToneDefaults(): Record<string, string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EMOJI_TONE_DEFAULTS_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => {
        return typeof entry[0] === 'string' && typeof entry[1] === 'string';
      }),
    );
  } catch {
    return {};
  }
}

function saveEmojiToneDefault(group: EmojiToneGroup, variant: EmojiToneVariant): void {
  emojiToneDefaults = {
    ...emojiToneDefaults,
    [group.baseEmoji]: variant.emoji,
  };

  try {
    window.localStorage.setItem(EMOJI_TONE_DEFAULTS_STORAGE_KEY, JSON.stringify(emojiToneDefaults));
  } catch {
    // Skin tone defaults are local UI preferences.
  }
}

function clearEmojiLongPressTimer(): void {
  if (emojiLongPressTimer === undefined) {
    return;
  }
  window.clearTimeout(emojiLongPressTimer);
  emojiLongPressTimer = undefined;
}

function ensureEmojiCatalog(): Promise<void> {
  if (emojiCatalog.length > 0) {
    return Promise.resolve();
  }

  if (emojiCatalogLoadPromise) {
    return emojiCatalogLoadPromise;
  }

  emojiCatalogLoading = true;
  renderPicker();
  emojiCatalogLoadPromise = import('./emoji-catalog')
    .then(({ EMOJI_CATALOG }) => {
      emojiCatalog = EMOJI_CATALOG;
      emojiToneIndex = buildEmojiToneIndex(emojiCatalog);
    })
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Emoji failed to load', 'bad');
    })
    .finally(() => {
      emojiCatalogLoading = false;
      emojiCatalogLoadPromise = null;
      renderPicker();
    });

  return emojiCatalogLoadPromise;
}

function rememberReactionEmoji(emoji: string): void {
  recentReactionEmojis = [emoji, ...recentReactionEmojis.filter((item) => item !== emoji)].slice(0, 3);
  try {
    window.localStorage.setItem(RECENT_REACTION_STORAGE_KEY, JSON.stringify(recentReactionEmojis));
  } catch {
    // Recent reactions are cosmetic.
  }
}

function filteredEmojiEntries(): EmojiEntry[] {
  const query = emojiSearchInputValue.trim().toLowerCase();
  return emojiCatalog.filter((entry) => {
    if (!shouldShowEmojiEntry(entry, emojiToneIndex)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const toneGroup = getEmojiToneGroupForEntry(entry, emojiToneIndex);
    const toneMatches = toneGroup?.variants.some((variant) => {
      return (
        variant.emoji.includes(query) ||
        variant.name.includes(query) ||
        variant.label.toLowerCase().includes(query)
      );
    });

    return (
      entry.emoji.includes(query) ||
      entry.name.includes(query) ||
      entry.keywords.some((keyword) => keyword.includes(query)) ||
      Boolean(toneMatches)
    );
  });
}

function gifTileFromResult(result: GaiaGifResult, index: number): GifTile | undefined {
  const selectUrl = result.mediaFormats.mp4?.url ?? result.mediaFormats.gif?.url;
  const previewUrl = result.mediaFormats.tinygif?.url ?? result.mediaFormats.gif?.url ?? selectUrl;
  if (!selectUrl || !previewUrl) {
    return undefined;
  }
  return {
    id: result.id ?? `${gifSearchQuery}-${index}`,
    selectUrl,
    previewUrl,
    label: result.contentDescription ?? gifSearchQuery,
  };
}

function isVideoMediaUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|mov)$/i.test(pathname);
  } catch {
    return /\.(mp4|webm|mov)$/i.test(url);
  }
}

function extractGifUrl(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.toLowerCase();
    if (/\.(gif|mp4|webm|mov)$/i.test(pathname) || parsed.hostname.includes('giphy') || parsed.hostname.includes('tenor')) {
      return trimmed;
    }
  } catch {
    // Not a URL.
  }
  return undefined;
}

function createPausedGifPreview(url: string): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'gif-preview-paused';
  placeholder.title = url;
  const label = currentSettings().gifPlayback === 'focused' ? 'GIF paused while unfocused' : 'GIF paused';
  placeholder.textContent = label;
  return placeholder;
}

function createEmojiPickerIcon(): SVGSVGElement {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = `
    <svg class="picker-icon-svg emoji-picker-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="1.7"></circle>
      <circle cx="9.25" cy="10.45" r="0.85" fill="currentColor"></circle>
      <circle cx="14.75" cy="10.45" r="0.85" fill="currentColor"></circle>
      <path d="M8.85 13.65c.72 1.15 1.78 1.72 3.15 1.72s2.43-.57 3.15-1.72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"></path>
    </svg>
  `;
  return wrapper.firstElementChild as SVGSVGElement;
}

function applyMessageUpdate(updatedMessage: GaiaBskyMessage): void {
  messages = messages.map((message) => (message.id === updatedMessage.id ? updatedMessage : message));
  convos = convos.map((convo) =>
    convo.lastMessage?.id === updatedMessage.id
      ? {
          ...convo,
          lastMessage: updatedMessage,
        }
      : convo,
  );
  persistConvosCache();

  for (const [key, page] of messagePageCache.entries()) {
    if (!page.messages.some((message) => message.id === updatedMessage.id)) {
      continue;
    }
    messagePageCache.set(key, {
      ...page,
      messages: page.messages.map((message) => (message.id === updatedMessage.id ? updatedMessage : message)),
    });
  }

  for (const [key, page] of convoPageCache.entries()) {
    if (!page.convos.some((convo) => convo.lastMessage?.id === updatedMessage.id)) {
      continue;
    }
    convoPageCache.set(key, {
      ...page,
      convos: page.convos.map((convo) =>
        convo.lastMessage?.id === updatedMessage.id
          ? {
              ...convo,
              lastMessage: updatedMessage,
            }
          : convo,
      ),
    });
  }
}

function clearMessagesState(): void {
  messagesWorkspaceReady = false;
  convos = [];
  messages = [];
  selectedConvoId = null;
  currentConvoCursor = undefined;
  nextConvoCursor = undefined;
  currentMessageCursor = undefined;
  nextMessageCursor = undefined;
  convoCursorStack = [];
  messageCursorStack = [];
  convoPageCache.clear();
  messagePageCache.clear();
  inFlightConvoPages.clear();
  inFlightMessagePages.clear();
  pendingReactionKeys.clear();
  bskyNotificationBaselineReady = false;
  bskyNotifiedMessageIds.clear();
  if (messagesAutoRefreshTimer) {
    window.clearInterval(messagesAutoRefreshTimer);
    messagesAutoRefreshTimer = undefined;
  }
}

function formatTimestamp(value: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return messageTimeFormatter.format(date);
}

function cssImageUrl(value: string): string {
  return `url("${value.replace(/["\\\n\r\f]/g, (match) => `\\${match}`)}")`;
}

function firstCssImageUrl(value: string): string | undefined {
  const match = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^'")]+))\s*\)/.exec(value);
  const rawUrl = match?.[1] ?? match?.[2] ?? match?.[3];
  return rawUrl?.replace(/\\(["'\\])/g, '$1');
}

function isAnimatedBackgroundUrl(url: string | undefined, mimeType?: string): boolean {
  if (mimeType?.split(';')[0]?.trim().toLowerCase() === 'image/gif') {
    return true;
  }
  if (!url) {
    return false;
  }
  if (/^data:image\/gif[;,]/i.test(url) || /\.gif(?:[?#]|$)/i.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.searchParams.get('format')?.toLowerCase() === 'gif';
  } catch {
    return false;
  }
}

function rememberStaticAnimatedBackground(sourceUrl: string, staticUrl: string): string {
  while (staticAnimatedBackgroundCache.size >= STATIC_ANIMATED_BACKGROUND_CACHE_LIMIT) {
    const oldestKey = staticAnimatedBackgroundCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    staticAnimatedBackgroundCache.delete(oldestKey);
  }
  staticAnimatedBackgroundCache.set(sourceUrl, staticUrl);
  return staticUrl;
}

function freezeAnimatedBackgroundFrame(sourceUrl: string): Promise<string | undefined> {
  const cached = staticAnimatedBackgroundCache.get(sourceUrl);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingStaticAnimatedBackgrounds.get(sourceUrl);
  if (pending) {
    return pending;
  }

  const promise = new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        if (naturalWidth <= 0 || naturalHeight <= 0) {
          resolve(undefined);
          return;
        }

        const scale = Math.min(1, STATIC_ANIMATED_BACKGROUND_MAX_EDGE / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(undefined);
          return;
        }

        context.imageSmoothingEnabled = scale < 1;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        resolve(rememberStaticAnimatedBackground(sourceUrl, canvas.toDataURL('image/png')));
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = sourceUrl;
  }).finally(() => {
    pendingStaticAnimatedBackgrounds.delete(sourceUrl);
  });

  pendingStaticAnimatedBackgrounds.set(sourceUrl, promise);
  return promise;
}

function setServerBackgroundSnapshot(serverId: string, snapshot: BackgroundSnapshot): void {
  if (selectedServerId !== serverId || activeView !== 'server') {
    return;
  }

  if (!snapshot.animated || currentSettings().animatedCurrentBackgrounds) {
    setCurrentBackgroundCss(snapshot.css, snapshot.analysisUrl);
    return;
  }

  if (snapshot.staticCss) {
    setCurrentBackgroundCss(snapshot.staticCss, snapshot.staticAnalysisUrl ?? firstCssImageUrl(snapshot.staticCss));
    return;
  }

  const sourceUrl = snapshot.analysisUrl ?? firstCssImageUrl(snapshot.css);
  if (!sourceUrl) {
    setCurrentBackgroundCss(snapshot.css, snapshot.analysisUrl);
    return;
  }

  void freezeAnimatedBackgroundFrame(sourceUrl).then((staticUrl) => {
    if (
      selectedServerId !== serverId ||
      activeView !== 'server' ||
      currentSettings().animatedCurrentBackgrounds ||
      serverBackgroundCache.get(serverId) !== snapshot
    ) {
      return;
    }

    if (!staticUrl) {
      setCurrentBackgroundCss(snapshot.css, snapshot.analysisUrl);
      return;
    }

    snapshot.staticCss = cssImageUrl(staticUrl);
    snapshot.staticAnalysisUrl = staticUrl;
    setCurrentBackgroundCss(snapshot.staticCss, snapshot.staticAnalysisUrl);
  });
}

function launcherRailWidth(): number {
  const parsedWidth = Number.parseFloat(getComputedStyle(shell).getPropertyValue('--rail-width'));
  return Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 76;
}

async function syncServerWebviewRailInset(): Promise<void> {
  const server = selectedServer();
  if (!server || serverWebview.src === 'about:blank') {
    return;
  }

  const railInset = `${Math.round(launcherRailWidth())}px`;
  const styleText = `
:root {
  --gaia-launcher-rail-inset: ${railInset};
}

body > #app > .shell,
body > #root > .shell,
.shell {
  --gaia-launcher-base-floating-inset: var(--floating-panel-inset, 18px);
  --gaia-launcher-left-floating-inset: calc(var(--gaia-launcher-rail-inset) + var(--gaia-launcher-base-floating-inset));
  --chat-content-left: calc(
    var(--gaia-launcher-left-floating-inset) +
    var(--channels-pane-width, 260px) +
    var(--floating-panel-gap, 18px)
  ) !important;
}

.channels-pane {
  left: var(--gaia-launcher-left-floating-inset) !important;
}
`;

  await serverWebview.executeJavaScript(
    `(() => {
      let style = document.getElementById('gaia-launcher-rail-inset-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'gaia-launcher-rail-inset-style';
        document.head.append(style);
      }
      style.textContent = ${JSON.stringify(styleText)};
    })()`,
    true,
  );
}

function setRailGlassColor(red: number, green: number, blue: number): void {
  const glassRed = Math.round(red * 0.82 + 4 * 0.18);
  const glassGreen = Math.round(green * 0.82 + 10 * 0.18);
  const glassBlue = Math.round(blue * 0.82 + 18 * 0.18);
  shell.style.setProperty('--rail-glass-bg', `rgba(${glassRed}, ${glassGreen}, ${glassBlue}, 0.2)`);
  shell.style.setProperty('--rail-glass-sheen', `rgba(${Math.min(255, glassRed + 20)}, ${Math.min(255, glassGreen + 24)}, ${Math.min(255, glassBlue + 28)}, 0.1)`);
}

function averageRailSamplePixels(pixels: Uint8ClampedArray): { red: number; green: number; blue: number } | undefined {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let weightTotal = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha < 16) {
      continue;
    }

    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const weight = 1 + saturation / 255 + (luminance > 24 ? 0.35 : 0);
    redTotal += red * weight;
    greenTotal += green * weight;
    blueTotal += blue * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) {
    return undefined;
  }

  return {
    red: Math.round(redTotal / weightTotal),
    green: Math.round(greenTotal / weightTotal),
    blue: Math.round(blueTotal / weightTotal),
  };
}

function averageRailSampleDataUrl(dataUrl: string): Promise<{ red: number; green: number; blue: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(36, Math.max(1, image.naturalWidth));
        canvas.height = Math.min(72, Math.max(1, image.naturalHeight));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(undefined);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(averageRailSamplePixels(context.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => {
      resolve(undefined);
    };
    image.src = dataUrl;
  });
}

async function refreshRailGlassFromWebviewSample(): Promise<void> {
  const capturePage = serverWebview.capturePage;
  const server = selectedServer();
  if (activeView !== 'server' || !capturePage || !server || serverWebview.src === 'about:blank') {
    return;
  }

  const sequence = ++railGlassSampleSequence;
  const bounds = serverWebview.getBoundingClientRect();
  if (bounds.width < 8 || bounds.height < 8) {
    return;
  }

  try {
    const sampleWidth = Math.min(220, Math.max(48, Math.round(bounds.width * 0.18)));
    const sampleHeight = Math.min(520, Math.max(160, Math.round(bounds.height * 0.72)));
    const image = await capturePage.call(serverWebview, {
      x: 0,
      y: 0,
      width: sampleWidth,
      height: sampleHeight,
    });
    if (sequence !== railGlassSampleSequence || selectedServerId !== server.id || activeView !== 'server') {
      return;
    }

    const average = await averageRailSampleDataUrl(image.toDataURL());
    if (!average || sequence !== railGlassSampleSequence || selectedServerId !== server.id || activeView !== 'server') {
      return;
    }

    setRailGlassColor(average.red, average.green, average.blue);
  } catch {
    // Sampling is best-effort; the CSS fallback remains usable.
  }
}

function resolveBrightBackgroundFromPixels(pixels: Uint8ClampedArray): boolean {
  let luminanceTotal = 0;
  let brightPixels = 0;
  let sampledPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha < 16) {
      continue;
    }

    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminanceTotal += luminance;
    sampledPixels += 1;
    if (luminance > 190) {
      brightPixels += 1;
    }
  }

  if (sampledPixels === 0) {
    return false;
  }

  const averageLuminance = luminanceTotal / sampledPixels;
  const brightPixelRatio = brightPixels / sampledPixels;
  return averageLuminance > BRIGHT_BACKGROUND_THRESHOLD || (averageLuminance > 138 && brightPixelRatio > 0.58);
}

function detectBrightBackgroundImage(backgroundUrl: string): Promise<boolean> {
  const cached = brightBackgroundCache.get(backgroundUrl);
  if (typeof cached === 'boolean') {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = Math.min(BACKGROUND_SAMPLE_SIZE, Math.max(1, image.naturalWidth));
        const height = Math.min(BACKGROUND_SAMPLE_SIZE, Math.max(1, image.naturalHeight));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(false);
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        const isBright = resolveBrightBackgroundFromPixels(context.getImageData(0, 0, width, height).data);
        brightBackgroundCache.set(backgroundUrl, isBright);
        resolve(isBright);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => {
      resolve(false);
    };
    image.src = backgroundUrl;
  });
}

function transitionWallpaperBackground(backgroundCss?: string): void {
  const nextBackgroundCss = backgroundCss?.trim() || DEFAULT_BACKGROUND_CSS;
  if (nextBackgroundCss === currentWallpaperCss) {
    activeWallpaperLayer.style.backgroundImage = nextBackgroundCss;
    return;
  }

  currentWallpaperCss = nextBackgroundCss;
  const previousLayer = activeWallpaperLayer;
  const nextLayer = previousLayer === wallpaperLayerA ? wallpaperLayerB : wallpaperLayerA;

  if (wallpaperFadeTimer) {
    window.clearTimeout(wallpaperFadeTimer);
    wallpaperFadeTimer = undefined;
  }

  nextLayer.style.transition = 'none';
  nextLayer.classList.remove('is-active');
  nextLayer.style.backgroundImage = nextBackgroundCss;
  void nextLayer.offsetWidth;
  nextLayer.style.transition = '';
  nextLayer.classList.add('is-active');
  previousLayer.classList.remove('is-active');
  activeWallpaperLayer = nextLayer;

  wallpaperFadeTimer = window.setTimeout(() => {
    if (activeWallpaperLayer !== previousLayer) {
      previousLayer.style.backgroundImage = nextBackgroundCss;
    }
    wallpaperFadeTimer = undefined;
  }, WALLPAPER_FADE_MS + 120);
}

function setCurrentBackgroundCss(backgroundCss?: string, analysisUrl?: string): void {
  const analysisSequence = ++backgroundAnalysisSequence;
  shell.classList.remove('over-light-background');

  if (!backgroundCss) {
    shell.style.removeProperty('--gaia-current-bg');
    shell.style.removeProperty('--current-app-bg');
    transitionWallpaperBackground();
    return;
  }

  shell.style.setProperty('--gaia-current-bg', backgroundCss);
  shell.style.setProperty('--current-app-bg', backgroundCss);
  transitionWallpaperBackground(backgroundCss);
  const brightnessSource = analysisUrl ?? firstCssImageUrl(backgroundCss);
  if (!brightnessSource) {
    return;
  }

  void detectBrightBackgroundImage(brightnessSource).then((isBright) => {
    if (analysisSequence !== backgroundAnalysisSequence) {
      return;
    }
    shell.classList.toggle('over-light-background', isBright);
  });
}

function setCurrentBackground(backgroundUrl?: string): void {
  setCurrentBackgroundCss(backgroundUrl ? cssImageUrl(backgroundUrl) : undefined, backgroundUrl);
}

function activeAccentPalette(): ReturnType<typeof resolveAccentPalette> {
  const settings = settingsDraft ?? currentSettings();
  return resolveAccentPalette(settings.accentColor, resolveAppearanceMode(settings));
}

function applyDefaultBackground(): void {
  currentAppearanceRequestId += 1;
  railGlassSampleSequence += 1;
  const palette = activeAccentPalette();
  setRailGlassColor(palette.rail.red, palette.rail.green, palette.rail.blue);
  setCurrentBackground();
}

function applyMessagesBackground(): void {
  currentAppearanceRequestId += 1;
  railGlassSampleSequence += 1;
  const palette = activeAccentPalette();
  setRailGlassColor(palette.rail.red, palette.rail.green, palette.rail.blue);
  setCurrentBackgroundCss(MESSAGES_BACKGROUND_CSS);
}

function applyServerBackground(server: GaiaServer | undefined): void {
  if (!server) {
    applyDefaultBackground();
    return;
  }

  const cachedBackground = serverBackgroundCache.get(server.id);
  const accent = serverAccentColor(server);
  railGlassSampleSequence += 1;
  setRailGlassColor(accent.red, accent.green, accent.blue);

  if (cachedBackground) {
    setServerBackgroundSnapshot(server.id, cachedBackground);
    return;
  }

  setCurrentBackgroundCss(serverFallbackBackgroundCss(server));
}

function applyActiveBackground(): void {
  if (!clientAuthStatus.authenticated) {
    applyDefaultBackground();
    return;
  }

  if (activeView === 'messages' || activeView === 'notifications' || activeView === 'settings') {
    applyMessagesBackground();
    return;
  }

  applyServerBackground(selectedServer());
}

async function refreshCurrentBackgroundFromWebview(): Promise<boolean> {
  const server = selectedServer();
  if (activeView !== 'server' || !server || serverWebview.src === 'about:blank' || !isSameServerUrl(server, serverWebview.src)) {
    return false;
  }

  try {
    const backgroundCss = await serverWebview.executeJavaScript<string>(
      `(() => {
        const toAbsoluteBackground = (value) => {
          const match = /url\\(\\s*(?:"([^"]+)"|'([^']+)'|([^'")]+))\\s*\\)/.exec(value || '');
          const rawUrl = match && (match[1] || match[2] || match[3]);
          if (!rawUrl) {
            return '';
          }
          try {
            const absoluteUrl = new URL(rawUrl.replace(/\\\\(["'\\\\])/g, '$1'), location.href).toString();
            return 'url("' + absoluteUrl.replace(/["\\\\\\n\\r\\f]/g, (match) => '\\\\' + match) + '")';
          } catch {
            return '';
          }
        };
        const shell = document.querySelector('.shell');
        const target = shell || document.body || document.documentElement;
        if (!target) {
          return '';
        }
        const style = getComputedStyle(target);
        const currentBackground = style.getPropertyValue('--current-app-bg').trim();
        const currentBackgroundUrl = toAbsoluteBackground(currentBackground);
        if (currentBackgroundUrl) {
          return currentBackgroundUrl;
        }
        const backgroundImage = style.backgroundImage.trim();
        return toAbsoluteBackground(backgroundImage);
      })()`,
      true,
    );
    const normalizedBackground = typeof backgroundCss === 'string' ? backgroundCss.trim() : '';
    if (!normalizedBackground || selectedServerId !== server.id || activeView !== 'server') {
      return false;
    }
    const snapshot: BackgroundSnapshot = {
      css: normalizedBackground,
      analysisUrl: firstCssImageUrl(normalizedBackground),
      animated: isAnimatedBackgroundUrl(firstCssImageUrl(normalizedBackground)),
    };
    serverBackgroundCache.set(server.id, snapshot);
    setServerBackgroundSnapshot(server.id, snapshot);
    return true;
  } catch {
    return false;
  }
}

async function refreshCurrentAppearance(): Promise<void> {
  const server = selectedServer();
  const requestId = ++currentAppearanceRequestId;
  if (!clientAuthStatus.authenticated) {
    applyDefaultBackground();
    return;
  }

  if (activeView === 'messages' || activeView === 'notifications' || activeView === 'settings') {
    applyMessagesBackground();
    return;
  }

  if (!server) {
    applyDefaultBackground();
    return;
  }

  const serverId = server.id;
  try {
    const appearance = await window.gaia.getCurrentAppearance(server.url);
    if (updateServerRailIdentity(server, appearance)) {
      render();
    }
    if (requestId !== currentAppearanceRequestId || selectedServerId !== serverId || activeView !== 'server') {
      return;
    }
    if (appearance.backgroundUrl) {
      const snapshot: BackgroundSnapshot = {
        css: cssImageUrl(appearance.backgroundUrl),
        analysisUrl: appearance.backgroundUrl,
        animated: isAnimatedBackgroundUrl(appearance.backgroundUrl, appearance.backgroundMimeType),
      };
      serverBackgroundCache.set(server.id, snapshot);
      setServerBackgroundSnapshot(server.id, snapshot);
      return;
    }

    if (await refreshCurrentBackgroundFromWebview()) {
      return;
    }

    serverBackgroundCache.delete(server.id);
    setCurrentBackgroundCss(serverFallbackBackgroundCss(server));
  } catch {
    if (requestId === currentAppearanceRequestId && selectedServerId === serverId && activeView === 'server') {
      if (await refreshCurrentBackgroundFromWebview()) {
        return;
      }
      setCurrentBackgroundCss(serverFallbackBackgroundCss(server));
    }
  }
}

function queueCurrentAppearanceRefreshes(): void {
  void syncServerWebviewRailInset().finally(() => {
    void refreshCurrentAppearance();
    void refreshRailGlassFromWebviewSample();
  });
  for (const delay of [250, 900, 2_000]) {
    window.setTimeout(() => {
      void syncServerWebviewRailInset().finally(() => {
        void refreshCurrentAppearance();
        void refreshRailGlassFromWebviewSample();
      });
    }, delay);
  }
}

function syncCurrentAppearanceRefresh(): void {
  const shouldRefresh = activeView === 'server' && clientAuthStatus.authenticated && Boolean(selectedServer());
  if (!shouldRefresh) {
    if (currentAppearanceRefreshTimer) {
      window.clearInterval(currentAppearanceRefreshTimer);
      currentAppearanceRefreshTimer = undefined;
    }
    return;
  }

  if (!currentAppearanceRefreshTimer) {
    currentAppearanceRefreshTimer = window.setInterval(() => {
      void refreshCurrentAppearance();
    }, CURRENT_APPEARANCE_REFRESH_MS);
  }
}

function updateViewVisibility(): void {
  const hasServers = Boolean(store?.servers.length);
  const showingMessages = activeView === 'messages';
  const showingNotifications = activeView === 'notifications';
  const showingSettings = activeView === 'settings';
  const authenticated = clientAuthStatus.authenticated;
  const showServerWorkspace = authenticated && activeView === 'server' && hasServers && Boolean(selectedServer());
  const showMessagesWorkspace = authenticated && showingMessages;
  const showNotificationsWorkspace = authenticated && showingNotifications;
  const showSettingsWorkspace = authenticated && showingSettings;
  if (!authenticated) {
    closeP2PDirectCall({ leave: true });
  }
  const nextWorkspaceView: ActiveView | null = showServerWorkspace
    ? 'server'
    : showMessagesWorkspace
      ? 'messages'
      : showNotificationsWorkspace
        ? 'notifications'
        : showSettingsWorkspace
          ? 'settings'
          : null;
  const nextWorkspaceServerId = nextWorkspaceView === 'server' ? selectedServerId ?? null : null;
  const previousWorkspaceView = visibleWorkspaceView;
  const previousWorkspaceServerId = visibleWorkspaceServerId;
  const fadeWorkspace = shouldFadeWorkspaceTransition(
    previousWorkspaceView,
    nextWorkspaceView,
    previousWorkspaceServerId,
    nextWorkspaceServerId,
  );
  shell.dataset.authenticated = authenticated ? 'true' : 'false';
  shell.dataset.view = activeView;
  signedOutScreen.classList.toggle('hidden', authenticated);
  syncLandingScene(!authenticated);
  signedOutLoginButton.disabled = clientAuthPending;
  signedOutLoginButton.querySelector('span')!.textContent = clientAuthPending
    ? 'Opening Bluesky...'
    : 'Sign In With Bluesky';
  notificationCenterButton.dataset.active = showingNotifications ? 'true' : 'false';
  notificationCenterButton.setAttribute('aria-expanded', showingNotifications ? 'true' : 'false');
  messagesButton.dataset.active = showingMessages ? 'true' : 'false';
  settingsButton.dataset.active = showingSettings ? 'true' : 'false';
  serverList.querySelectorAll<HTMLButtonElement>('.server-button').forEach((button) => {
    button.dataset.active =
      activeView === 'server' && button.dataset.serverId === selectedServerId ? 'true' : 'false';
  });
  setWorkspacePageVisible(
    messagesView,
    showMessagesWorkspace,
    fadeWorkspace && (previousWorkspaceView === 'messages' || nextWorkspaceView === 'messages'),
  );
  setWorkspacePageVisible(
    notificationCenter,
    showNotificationsWorkspace,
    fadeWorkspace && (previousWorkspaceView === 'notifications' || nextWorkspaceView === 'notifications'),
  );
  setWorkspacePageVisible(
    settingsView,
    showSettingsWorkspace,
    fadeWorkspace && (previousWorkspaceView === 'settings' || nextWorkspaceView === 'settings'),
  );
  emptyState.classList.toggle(
    'hidden',
    !authenticated || showingMessages || showingNotifications || showingSettings || hasServers,
  );
  syncServerWebviewVisibility(fadeWorkspace && (previousWorkspaceView === 'server' || nextWorkspaceView === 'server'));
  visibleWorkspaceView = nextWorkspaceView;
  visibleWorkspaceServerId = nextWorkspaceServerId;
  applyActiveBackground();
  if (authenticated && showingSettings) {
    renderSettingsWorkspace();
  }
  if (authenticated && showingMessages) {
    renderP2PDirectCallPanel();
    renderFloatingLiquidGlassSurfaces();
    refreshLiquidGlassSurfaceSizes();
  }
  if (authenticated && showingNotifications) {
    renderNotificationCenter();
  }
  syncMessagesAutoRefresh();
  syncCurrentAppearanceRefresh();
}

function syncMessagesAutoRefresh(): void {
  const shouldRefresh = clientAuthStatus.authenticated;
  if (!shouldRefresh) {
    if (messagesAutoRefreshTimer) {
      window.clearInterval(messagesAutoRefreshTimer);
      messagesAutoRefreshTimer = undefined;
    }
    return;
  }

  if (!messagesAutoRefreshTimer) {
    messagesAutoRefreshTimer = window.setInterval(() => {
      void refreshMessagesSilently();
    }, MESSAGES_AUTO_REFRESH_MS);
    void refreshMessagesSilently();
  }
}

function switchToServerView(options: { remember?: boolean } = {}): void {
  activeView = 'server';
  const server = selectedServer();
  if (server && clientAuthStatus.authenticated) {
    setActiveServerWebview(server);
  }
  if (options.remember !== false) {
    rememberContentView('server');
  }
  updateViewVisibility();
}

function switchToMessagesView(options: { remember?: boolean } = {}): void {
  activeView = 'messages';
  if (clientAuthStatus.authenticated && restoreConvosCache()) {
    renderMessagesViewport();
  }
  if (options.remember !== false) {
    rememberContentView('messages');
  }
  updateViewVisibility();
  void loadMessagesViewport();
}

function switchToNotificationsView(): void {
  activeView = 'notifications';
  hideServerContextMenu();
  hideMessageContextMenu();
  hideRailAppearanceMenu();
  renderNotificationCenter();
  updateViewVisibility();
}

function switchToSettingsView(options: { section?: SettingsSectionId; clearSearch?: boolean } = {}): void {
  if (activeView === 'server' || activeView === 'messages') {
    lastContentView = activeView;
  }
  if (options.section) {
    if (options.clearSearch) {
      settingsSearchQuery = '';
    }
    soundKeyCaptureActive = false;
    if (activeSettingsSection === 'sound' && options.section !== 'sound') {
      stopMicrophoneTest({ render: false });
      stopCameraPreview({ render: false });
    }
    activeSettingsSection = options.section;
  }
  activeView = 'settings';
  hideServerContextMenu();
  hideMessageContextMenu();
  hideRailAppearanceMenu();
  renderSettingsWorkspace();
  updateViewVisibility();
}

function closeSettingsView(): void {
  soundKeyCaptureActive = false;
  stopMicrophoneTest({ render: false });
  stopCameraPreview({ render: false });
  if (lastContentView === 'messages') {
    switchToMessagesView({ remember: false });
    return;
  }
  switchToServerView({ remember: false });
}

function hideServerContextMenu(): void {
  serverContextMenu.classList.add('hidden');
  serverContextMenu.replaceChildren();
}

function hideMessageContextMenu(): void {
  messageContextMenu.classList.add('hidden');
  messageContextMenu.replaceChildren();
  contextMessageId = null;
}

function hideRailAppearanceMenu(): void {
  railAppearanceMenu.classList.add('hidden');
  railAppearanceMenu.replaceChildren();
  settingsButton.setAttribute('aria-expanded', 'false');
}

function serverNotificationSetting(serverId: string): GaiaServerNotificationSetting {
  return store?.serverNotificationSettings?.[serverId] ?? DEFAULT_SERVER_NOTIFICATION_SETTING;
}

function serverNotificationLevelLabel(level: GaiaServerNotificationLevel): string {
  if (level === 'mentions') {
    return 'Only @mentions';
  }
  if (level === 'nothing') {
    return 'Nothing';
  }
  return 'All Messages';
}

function isServerNotificationMuted(setting: GaiaServerNotificationSetting): boolean {
  if (!setting.mutedUntil) {
    return false;
  }
  const mutedUntil = Date.parse(setting.mutedUntil);
  return Number.isFinite(mutedUntil) && mutedUntil > Date.now();
}

function openServerContextMenu(server: GaiaServer, x: number, y: number): void {
  hideMessageContextMenu();
  hideRailAppearanceMenu();
  renderServerContextMenu(serverContextMenuSections(server));
  serverContextMenu.style.left = `${x}px`;
  serverContextMenu.style.top = `${y}px`;
  serverContextMenu.classList.remove('hidden');
  const menuRect = serverContextMenu.getBoundingClientRect();
  const position = clampMenuPosition(x, y, menuRect.width, menuRect.height);
  serverContextMenu.style.left = `${position.x}px`;
  serverContextMenu.style.top = `${position.y}px`;
}

function clampMenuPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const margin = 8;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin)),
  };
}

function appearanceModeLabel(appearanceMode: GaiaAppearanceMode): string {
  if (appearanceMode === 'light') {
    return 'Light';
  }
  if (appearanceMode === 'dark') {
    return 'Dark';
  }
  return 'Auto';
}

function activeAppearanceMode(): GaiaAppearanceMode {
  return (settingsDraft ?? currentSettings()).appearanceMode;
}

async function switchAppearanceModeFromRail(appearanceMode: GaiaAppearanceMode): Promise<void> {
  if (!store) {
    return;
  }

  const previousDraft = settingsDraft ? cloneSettings(settingsDraft) : null;
  try {
    if (currentSettings().appearanceMode !== appearanceMode) {
      store = await window.gaia.updateSettings({ appearanceMode });
    }

    if (previousDraft) {
      settingsDraft = {
        ...previousDraft,
        appearanceMode,
        sound: { ...previousDraft.sound },
        video: { ...previousDraft.video },
      };
    } else {
      settingsDraft = activeView === 'settings' ? cloneSettings(store.settings) : null;
    }

    applyAppSettings(settingsDraft ?? store.settings);
    if (activeView === 'settings') {
      renderSettingsWorkspace();
    }
    setStatus(`${appearanceModeLabel(appearanceMode)} mode`, 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Theme switch failed', 'bad');
  }
}

function railAppearanceMenuSections(): ContextMenuSection[] {
  const appearanceMode = activeAppearanceMode();
  return [
    {
      id: 'rail-appearance',
      items: [
        {
          id: 'rail-appearance-light',
          label: 'Light Mode',
          icon: appearanceMode === 'light' ? '✓' : '☀',
          disabled: appearanceMode === 'light',
          disabledReason: 'Light mode is already active.',
          run: () => switchAppearanceModeFromRail('light'),
        },
        {
          id: 'rail-appearance-dark',
          label: 'Dark Mode',
          icon: appearanceMode === 'dark' ? '✓' : '☾',
          disabled: appearanceMode === 'dark',
          disabledReason: 'Dark mode is already active.',
          run: () => switchAppearanceModeFromRail('dark'),
        },
      ],
    },
  ];
}

async function copyToClipboard(value: string, label: string): Promise<void> {
  const text = value.trim();
  if (!text) {
    setStatus(`No ${label.toLowerCase()} to copy`, 'warn');
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setStatus(`${label} copied`, 'good');
  } catch {
    setStatus(`Could not copy ${label.toLowerCase()}`, 'bad');
  }
}

async function updateServerNotificationSetting(
  server: GaiaServer,
  patch: { level?: GaiaServerNotificationLevel; mutedUntil?: string | null },
): Promise<void> {
  store = await window.gaia.updateServerNotificationSettings(server.id, patch);
  selectedServerId = store.selectedServerId;
  render();

  const setting = serverNotificationSetting(server.id);
  const muted = isServerNotificationMuted(setting);
  setStatus(
    muted ? `${serverRailName(server)} muted` : `${serverNotificationLevelLabel(setting.level)} for ${serverRailName(server)}`,
    'good',
  );
}

async function leaveServerFromRail(server: GaiaServer): Promise<void> {
  const serverName = serverRailName(server);
  const shouldLeave = window.confirm(`Leave ${serverName}? Gaia will remove it from your launcher rail.`);
  if (!shouldLeave) {
    return;
  }

  store = await window.gaia.removeServer(server.id);
  selectedServerId = store.selectedServerId;
  serverRailIdentityCache.delete(server.id);
  serverBackgroundCache.delete(server.id);
  serverSessionCache.delete(server.id);
  serverProbeCache.delete(server.id);
  const webview = serverWebviews.get(server.id);
  if (webview) {
    webview.remove();
    serverWebviews.delete(server.id);
  }
  loadSelectedServer();
  setStatus(`Left ${serverName}`, 'warn');
}

function serverContextMenuSections(server: GaiaServer): ContextMenuSection[] {
  const setting = serverNotificationSetting(server.id);
  const muted = isServerNotificationMuted(setting);
  const activeLevel = setting.level;
  const levelItem = (level: GaiaServerNotificationLevel): ContextMenuItem => ({
    id: `server-notification-${level}`,
    label: serverNotificationLevelLabel(level),
    icon: activeLevel === level && !muted ? '✓' : level === 'mentions' ? '@' : level === 'nothing' ? '-' : '#',
    disabled: activeLevel === level && !muted,
    disabledReason: `${serverNotificationLevelLabel(level)} is already selected.`,
    run: () => updateServerNotificationSetting(server, { level, mutedUntil: null }),
  });

  return [
    {
      id: 'server-notifications',
      items: [
        levelItem('all'),
        levelItem('mentions'),
        levelItem('nothing'),
        {
          id: 'server-mute',
          label: muted ? 'Unmute Server' : 'Mute Server',
          icon: muted ? '✓' : '!',
          run: () =>
            updateServerNotificationSetting(server, {
              mutedUntil: muted ? null : SERVER_MUTE_FOREVER_UNTIL,
            }),
        },
      ],
    },
    {
      id: 'server-actions',
      items: [
        {
          id: 'server-refresh',
          label: 'Refresh',
          icon: '↻',
          run: () => refreshServer(server),
        },
        {
          id: 'server-edit',
          label: 'Edit Server',
          icon: '✎',
          run: async () => {
            await selectServer(server.id);
            openServerDialog('edit');
          },
        },
        {
          id: 'server-sign-in',
          label: 'Sign In',
          icon: '→',
          run: async () => {
            await selectServer(server.id);
            await startLauncherAuth(server);
          },
        },
      ],
    },
    {
      id: 'server-danger',
      items: [
        {
          id: 'server-leave',
          label: 'Leave Server',
          icon: '×',
          variant: 'danger',
          run: () => leaveServerFromRail(server),
        },
      ],
    },
  ];
}

function senderProfileUrl(actor: GaiaBskyConvo['members'][number] | GaiaBskyProfile | undefined): string | undefined {
  const identifier = actor?.handle?.trim() || actor?.did?.trim();
  if (!identifier) {
    return undefined;
  }
  return `https://bsky.app/profile/${encodeURIComponent(identifier.replace(/^@+/, ''))}`;
}

function messageContextMenuSections(message: GaiaBskyMessage): ContextMenuSection[] {
  const convoId = selectedConvoId;
  const actor = actorForDid(message.senderDid) ?? (message.senderDid !== 'unknown' ? { did: message.senderDid } : undefined);
  const profileUrl = senderProfileUrl(actor);
  const hasText = message.text.trim().length > 0;
  const canDeleteForSelf = Boolean(convoId && message.senderDid !== 'unknown');

  return [
    {
      id: 'message-primary',
      items: [
        {
          id: 'add-reaction',
          label: 'Add Reaction',
          icon: '😊',
          run: () => openPicker('emoji', message.id),
        },
        {
          id: 'mark-read-here',
          label: 'Mark Read Here',
          icon: '✓',
          disabled: !convoId,
          disabledReason: 'Select a conversation first.',
          run: () => {
            if (convoId) {
              void markConvoRead(convoId, message.id, true);
            }
          },
        },
      ],
    },
    {
      id: 'message-copy',
      items: [
        {
          id: 'copy-message-text',
          label: 'Copy Text',
          icon: '⧉',
          disabled: !hasText,
          disabledReason: 'This message has no copyable text.',
          run: () => copyToClipboard(message.text, 'Message text'),
        },
        {
          id: 'copy-message-id',
          label: 'Copy Message ID',
          icon: '#',
          run: () => copyToClipboard(message.id, 'Message ID'),
        },
        {
          id: 'copy-sender-handle',
          label: 'Copy Sender Handle',
          icon: '@',
          hidden: !actor?.handle,
          run: () => copyToClipboard(handleLabel(actor), 'Sender handle'),
        },
        {
          id: 'copy-sender-did',
          label: 'Copy Sender DID',
          icon: '◇',
          disabled: message.senderDid === 'unknown',
          disabledReason: 'This message does not expose a sender DID.',
          run: () => copyToClipboard(message.senderDid, 'Sender DID'),
        },
      ],
    },
    {
      id: 'message-profile',
      items: [
        {
          id: 'open-sender-profile',
          label: 'Open Sender Profile',
          icon: '↗',
          hidden: !profileUrl,
          run: () => {
            if (profileUrl) {
              void window.gaia.openExternal(profileUrl);
            }
          },
        },
      ],
    },
    {
      id: 'message-manage',
      items: [
        {
          id: 'delete-message-for-self',
          label: 'Delete For Me',
          icon: '×',
          variant: 'danger',
          disabled: !canDeleteForSelf,
          disabledReason: 'System messages cannot be deleted.',
          run: () => deleteMessageForSelf(message),
        },
      ],
    },
  ];
}

function renderContextMenu(menu: HTMLDivElement, sections: ContextMenuSection[], options: ContextMenuRenderOptions): void {
  const overLight = shell.classList.contains('over-light-background');
  const wasHidden = menu.classList.contains('hidden');
  menu.className = `context-menu discord-context-menu ${options.className} liquid-surface ${
    overLight ? 'over-light-background' : ''
  }`;
  if (wasHidden) {
    menu.classList.add('hidden');
  }

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.hidden),
    }))
    .filter((section) => section.items.length > 0);
  const fragment = document.createDocumentFragment();
  const glassBackdrop = createMenuLiquidGlassBackdrop(overLight);

  visibleSections.forEach((section, sectionIndex) => {
    const group = document.createElement('div');
    group.className = 'context-menu-section';
    group.setAttribute('role', 'group');
    if (sectionIndex > 0) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      separator.setAttribute('role', 'separator');
      group.append(separator);
    }

    for (const item of section.items) {
      const row = document.createElement('div');
      row.className = 'context-menu-row-wrap';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'context-menu-item';
      button.classList.toggle('danger', item.variant === 'danger');
      button.disabled = Boolean(item.disabled);
      button.setAttribute('role', 'menuitem');
      if (item.disabledReason && item.disabled) {
        button.title = item.disabledReason;
      }
      const icon = document.createElement('span');
      icon.className = 'context-menu-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon;
      const label = document.createElement('span');
      label.className = 'context-menu-label';
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener('click', () => {
        if (item.disabled) {
          return;
        }
        options.dismiss();
        void Promise.resolve(item.run()).catch((error) => {
          setStatus(error instanceof Error ? error.message : options.errorMessage, 'bad');
        });
      });
      row.append(button);
      group.append(row);
    }
    fragment.append(group);
  });

  menu.replaceChildren(glassBackdrop, fragment);
}

function renderMessageContextMenu(sections: ContextMenuSection[]): void {
  renderContextMenu(messageContextMenu, sections, {
    className: 'context-menu-message',
    dismiss: hideMessageContextMenu,
    errorMessage: 'Message action failed',
  });
}

function renderServerContextMenu(sections: ContextMenuSection[]): void {
  renderContextMenu(serverContextMenu, sections, {
    className: 'server-context-menu',
    dismiss: hideServerContextMenu,
    errorMessage: 'Server action failed',
  });
}

function renderRailAppearanceMenu(): void {
  renderContextMenu(railAppearanceMenu, railAppearanceMenuSections(), {
    className: 'rail-appearance-menu',
    dismiss: hideRailAppearanceMenu,
    errorMessage: 'Theme switch failed',
  });
}

function openRailAppearanceMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  hideServerContextMenu();
  hideMessageContextMenu();
  renderRailAppearanceMenu();
  railAppearanceMenu.style.left = `${event.clientX}px`;
  railAppearanceMenu.style.top = `${event.clientY}px`;
  railAppearanceMenu.classList.remove('hidden');
  settingsButton.setAttribute('aria-expanded', 'true');
  const rect = railAppearanceMenu.getBoundingClientRect();
  const position = clampMenuPosition(event.clientX, event.clientY, rect.width, rect.height);
  railAppearanceMenu.style.left = `${position.x}px`;
  railAppearanceMenu.style.top = `${position.y}px`;
}

function openMessageContextMenu(event: MouseEvent, message: GaiaBskyMessage): void {
  event.preventDefault();
  event.stopPropagation();
  hideServerContextMenu();
  hideRailAppearanceMenu();
  contextMessageId = message.id;
  renderMessageContextMenu(messageContextMenuSections(message));
  messageContextMenu.style.left = `${event.clientX}px`;
  messageContextMenu.style.top = `${event.clientY}px`;
  messageContextMenu.classList.remove('hidden');
  const rect = messageContextMenu.getBoundingClientRect();
  const position = clampMenuPosition(event.clientX, event.clientY, rect.width, rect.height);
  messageContextMenu.style.left = `${position.x}px`;
  messageContextMenu.style.top = `${position.y}px`;
}

function refreshServer(server: GaiaServer): void {
  hideServerContextMenu();
  if (selectedServerId !== server.id) {
    void selectServer(server.id);
    return;
  }
  setStatus('Refreshing', 'neutral');
  serverProbeCache.delete(server.id);
  serverSessionCache.delete(server.id);
  loadServerWebview(server, { force: true });
  void probeCurrentServer(server, true).then((probe) => {
    if (selectedServerId !== server.id || activeView !== 'server') {
      return;
    }
    if (!probe.reachable) {
      setStatus('Offline', 'bad');
    } else if (probe.authenticated) {
      setStatus('Connected', 'good');
    } else {
      setStatus('Needs server sign-in', 'warn');
    }
  });
}

function handleServerExternalNavigation(
  event: WebviewNavigationEvent,
  webview = serverWebview,
  canPrevent = true,
): void {
  const nextUrl = event.url;
  const server = serverForWebview(webview) ?? selectedServer();
  if (!server || !nextUrl || nextUrl === 'about:blank') {
    return;
  }

  if (isSameServerUrl(server, nextUrl)) {
    if (
      consumeAllowedServerWebviewNavigation(webview) ||
      isAuthTicketCleanupNavigation(webview.src, nextUrl)
    ) {
      return;
    }

    if (!canPrevent) {
      return;
    }

    if (
      webview.src !== 'about:blank' &&
      isServerWebviewLoadedForServer(webview, server) &&
      (serverPageLoadPhase(webview) === 'ready' || isSameUrl(webview.src, nextUrl))
    ) {
      event.preventDefault?.();
      setServerPageLoadPhase(webview, 'ready');
      void isServerWebviewInVoiceSession(webview);
      console.warn(`[gaia:current-webview] blocked unexpected same-server navigation url=${nextUrl}`);
    }
    return;
  }

  event.preventDefault?.();

  if (!isHttpUrl(nextUrl)) {
    setStatus('Blocked unsafe navigation', 'warn');
  } else if (isBlueskyAuthUrl(nextUrl)) {
    setStatus('Opening browser', 'neutral');
    if (authServerId !== server.id) {
      void startLauncherAuth(server);
    }
  } else {
    void window.gaia.openExternal(nextUrl);
  }

  window.setTimeout(() => {
    if (serverById(server.id) && !isSameServerUrl(server, webview.src)) {
      setServerPageLoadPhase(webview, 'loading');
      webview.src = server.url;
    }
  }, 50);
}

async function logoutSelectedServer(): Promise<void> {
  const server = selectedServer();
  hideServerContextMenu();
  closeAuthOverlay();
  setStatus('Logging out', 'neutral');

  const clientResult = await window.gaia.logoutClientAuth();
  clientAuthStatus = { authenticated: false };
  clearMessagesState();
  for (const webview of serverWebviews.values()) {
    setServerPageLoadPhase(webview, 'idle');
    webview.src = 'about:blank';
  }
  serverSessionCache.clear();
  serverProbeCache.clear();
  updateViewVisibility();
  renderMessagesViewport();

  if (!server) {
    setStatus(clientResult.message, clientResult.ok ? 'warn' : 'bad');
    return;
  }

  manuallyLoggedOutServers.add(server.id);
  authFailures.delete(server.id);

  const result = await window.gaia.logoutServer(server.url);
  setStatus(result.ok ? clientResult.message : result.message, result.ok && clientResult.ok ? 'warn' : 'bad');
}

function render(): void {
  if (!store) {
    return;
  }

  pruneServerWebviews();
  const server = selectedServer();
  serverList.innerHTML = '';
  for (const item of store.servers) {
    const displayName = serverRailName(item);
    const iconUrl = serverRailIconUrl(item);
    const button = document.createElement('button');
    button.className = 'server-button';
    button.dataset.serverId = item.id;
    button.dataset.active = activeView === 'server' && item.id === selectedServerId ? 'true' : 'false';
    button.classList.toggle('has-server-icon', Boolean(iconUrl));
    button.title = displayName;
    button.setAttribute('aria-label', displayName);
    if (iconUrl) {
      const iconFrame = document.createElement('span');
      iconFrame.className = 'server-button-icon-frame';
      const icon = document.createElement('img');
      icon.className = 'server-button-icon';
      icon.src = iconUrl;
      icon.alt = '';
      icon.decoding = 'async';
      iconFrame.append(icon);
      button.append(iconFrame);
    } else {
      button.textContent = initials(displayName);
    }
    button.addEventListener('click', () => {
      hideServerContextMenu();
      selectedServerId = item.id;
      if (clientAuthStatus.authenticated) {
        activateServerWebview(item);
        applyServerBackground(item);
      }
      switchToServerView();
      void selectServer(item.id);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      void window.gaia.selectServer(item.id).then((nextStore) => {
        store = nextStore;
        selectedServerId = nextStore.selectedServerId;
        render();
        openServerContextMenu(item, event.clientX, event.clientY);
      });
    });
    serverList.append(button);
  }

  updateViewVisibility();
  logoutButton.disabled = !server;
}

async function prepareSelectedServerLoad(server: GaiaServer, requestId: number): Promise<void> {
  const webview = ensureServerWebview(server);
  if (isServerWebviewLoadedForServer(webview, server)) {
    setStatus('Connected', 'good');
    queueCurrentAppearanceRefreshes();
  } else {
    setStatus('Loading', 'neutral');
  }

  const probe = await probeCurrentServer(server);
  if (requestId !== serverLoadRequestId || selectedServerId !== server.id || activeView !== 'server') {
    return;
  }

  if (!probe.reachable) {
    setServerPageLoadPhase(webview, 'failed');
    setStatus('Offline', 'bad');
    return;
  }

  if (probe.authenticated) {
    setStatus('Connected', 'good');
    loadServerWebview(server);
    queueCurrentAppearanceRefreshes();
    return;
  }

  if (manuallyLoggedOutServers.has(server.id)) {
    setStatus('Logged out', 'warn');
    loadServerWebview(server);
    queueCurrentAppearanceRefreshes();
    return;
  }

  if (authFailures.has(server.id)) {
    setStatus('Auth failed', 'bad');
    loadServerWebview(server);
    queueCurrentAppearanceRefreshes();
    return;
  }

  setServerPageLoadPhase(webview, 'loading');
  setStatus('Signing in', 'neutral');
  await maybeAutoAuthenticate(server);
}

function loadSelectedServer(): void {
  const requestId = ++serverLoadRequestId;
  const server = selectedServer();
  if (server && clientAuthStatus.authenticated) {
    activateServerWebview(server);
  }
  render();
  if (!clientAuthStatus.authenticated) {
    setStatus('Needs sign-in', 'warn');
    applyDefaultBackground();
    return;
  }

  if (!server) {
    setStatus('No servers', 'warn');
    applyDefaultBackground();
    return;
  }

  applyServerBackground(server);
  void prepareSelectedServerLoad(server, requestId);
}

async function selectServer(serverId: string): Promise<void> {
  store = await window.gaia.selectServer(serverId);
  selectedServerId = store.selectedServerId;
  loadSelectedServer();
}

async function refreshStore(): Promise<void> {
  store = await window.gaia.getStore();
  selectedServerId = store.selectedServerId ?? store.servers[0]?.id;
  await refreshAudioDevices(false);
  if (!isSettingsDirty()) {
    settingsDraft = activeView === 'settings' ? cloneSettings(store.settings) : null;
  }
  applyAppSettings(store.settings);
  resolveInitialActiveView();
  if (activeView === 'server') {
    loadSelectedServer();
  } else {
    render();
    if (activeView === 'messages') {
      void loadMessagesViewport();
    }
  }
  void refreshServerRailIdentities();
}

async function loadUpdateState(): Promise<void> {
  try {
    updateState = await window.gaia.getUpdateState();
  } catch (error) {
    console.warn('[gaia:updates] Could not load update state.', error);
    updateState = null;
  }
  syncLauncherUpdateBadge();
  if (activeView === 'settings' && activeSettingsSection === 'updates') {
    renderSettingsWorkspace();
  }
}

async function refreshClientAuthStatus(): Promise<void> {
  try {
    clientAuthStatus = await window.gaia.getClientAuthStatus();
  } catch {
    clientAuthStatus = { authenticated: false };
  }
  if (!clientAuthStatus.authenticated) {
    clearMessagesState();
  }
  updateViewVisibility();
}

async function initialize(): Promise<void> {
  await refreshClientAuthStatus();
  await loadSpotifyStatus();
  await refreshStore();
  await loadUpdateState();
  startLauncherUpdateLiveChecks();
  await loadNotificationCenter();
  renderMessagesViewport();
}

async function isCurrentSessionReady(server = selectedServer()): Promise<boolean> {
  if (!server) {
    return false;
  }

  const cached = serverSessionCache.get(server.id);
  if (cached && Date.now() - cached.checkedAt < SERVER_SESSION_CACHE_TTL_MS) {
    return cached.authenticated;
  }

  try {
    return Boolean((await probeCurrentServer(server)).authenticated);
  } catch {
    return false;
  }
}

async function maybeAutoAuthenticate(server = selectedServer()): Promise<void> {
  if (!server) {
    return;
  }
  if (selectedServerId !== server.id || activeView !== 'server') {
    return;
  }

  const ready = await isCurrentSessionReady(server);
  if (ready) {
    setStatus('Connected', 'good');
    return;
  }

  if (manuallyLoggedOutServers.has(server.id)) {
    setStatus('Logged out', 'warn');
    return;
  }

  if (authFailures.has(server.id)) {
    setStatus('Auth failed', 'bad');
    return;
  }

  const lastAttempt = authAttempts.get(server.id) ?? 0;
  if (Date.now() - lastAttempt < SERVER_AUTO_AUTH_RETRY_MS || authServerId === server.id) {
    setStatus('Signing in', 'neutral');
    return;
  }

  const status = await window.gaia.getClientAuthStatus();
  clientAuthStatus = status;
  updateViewVisibility();
  if (!status.authenticated) {
    setStatus('Needs sign-in', 'warn');
    return;
  }

  authAttempts.set(server.id, Date.now());
  await startLauncherAuth(server);
}

function normalizeCustomAtprotoProviderAddress(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Enter a server address.');
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a valid server address.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Server address must use http:// or https://.');
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Enter a valid server address.');
  }

  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function authContinueLabel(pending = false): string {
  if (authProviderChoice === 'custom') {
    return pending ? 'Opening...' : 'Done';
  }
  return pending ? 'Opening Bluesky...' : 'Sign In With Bluesky';
}

function selectedAuthProviderHandle(): string {
  if (authProviderChoice === 'custom') {
    return normalizeCustomAtprotoProviderAddress(authProviderAddressInput.value);
  }
  return DEFAULT_AUTH_HANDLE;
}

function setAuthProviderChoice(choice: AuthProviderChoice): void {
  authProviderChoice = choice;
  authProviderBlueskyButton.dataset.active = choice === 'bluesky' ? 'true' : 'false';
  authProviderBlueskyButton.setAttribute('aria-selected', choice === 'bluesky' ? 'true' : 'false');
  authProviderCustomButton.dataset.active = choice === 'custom' ? 'true' : 'false';
  authProviderCustomButton.setAttribute('aria-selected', choice === 'custom' ? 'true' : 'false');
  authProviderAddressLabel.classList.toggle('hidden', choice !== 'custom');
  authContinueButton.querySelector('span')!.textContent = authContinueLabel(clientAuthPending);
  if (choice === 'custom') {
    authProviderAddressInput.focus();
  }
}

function openClientAuthChooser(purpose: ClientAuthPurpose, server?: GaiaServer): void {
  pendingClientAuthPurpose = purpose;
  pendingClientAuthServerId = server?.id ?? null;
  authServerId = server?.id ?? null;
  authRequestId = null;
  authServerName.textContent =
    purpose === 'messages' ? 'Bluesky Messages' : (purpose === 'app' ? 'Gaia Launcher' : (server ? serverRailName(server) : 'Current'));
  setAuthProviderChoice('bluesky');
  authContinueButton.disabled = false;
  setAuthNotice('Ready', 'Continue with Bluesky, or choose Other for a custom ATProto provider.');
  authOverlay.classList.remove('hidden');
}

async function startLauncherAuth(server: GaiaServer, handle?: string): Promise<void> {
  const hasClientSession = await ensureClientAuth('server', server, handle);
  if (!hasClientSession) {
    return;
  }

  await authenticateServerFromClient(server);
}

async function ensureClientAuth(
  purpose: ClientAuthPurpose,
  server?: GaiaServer,
  handle?: string,
): Promise<boolean> {
  try {
    clientAuthStatus = await window.gaia.getClientAuthStatus();
  } catch {
    clientAuthStatus = { authenticated: false };
  }

  if (clientAuthStatus.authenticated) {
    return true;
  }

  if (handle) {
    await startClientAuthFlow(purpose, server, handle);
  } else {
    openClientAuthChooser(purpose, server);
  }
  return false;
}

async function startClientAuthFlow(purpose: ClientAuthPurpose, server?: GaiaServer, handle?: string): Promise<void> {
  const resolvedHandle = handle ?? store?.identity?.handle ?? DEFAULT_AUTH_HANDLE;
  const useSignedOutGate = !clientAuthStatus.authenticated && purpose === 'app';
  pendingClientAuthPurpose = purpose;
  pendingClientAuthServerId = server?.id ?? null;
  authServerId = server?.id ?? null;
  authRequestId = null;
  clientAuthPending = true;
  updateViewVisibility();
  authServerName.textContent =
    purpose === 'messages' ? 'Bluesky Messages' : (purpose === 'app' ? 'Gaia Launcher' : (server ? serverRailName(server) : 'Current'));
  authContinueButton.disabled = true;
  authContinueButton.querySelector('span')!.textContent = authContinueLabel(true);
  setAuthNotice('Opening browser', 'Complete ATProto sign-in in your browser. Gaia will receive the callback locally.');
  authOverlay.classList.toggle('hidden', useSignedOutGate);
  setStatus('Signing in', 'neutral');

  try {
    await window.gaia.startClientAuth({
      handle: resolvedHandle,
    });
    setAuthNotice('Check your browser', 'Finish sign-in there. Gaia will continue automatically.');
    setStatus('Waiting for browser', 'neutral');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start ATProto sign-in.';
    handleClientAuthResult({
      ok: false,
      message,
    });
  } finally {
    clientAuthPending = false;
    updateViewVisibility();
    authContinueButton.disabled = false;
    authContinueButton.querySelector('span')!.textContent = authContinueLabel();
  }
}

async function authenticateServerFromClient(server: GaiaServer): Promise<void> {
  manuallyLoggedOutServers.delete(server.id);
  authFailures.delete(server.id);
  authServerId = server.id;
  authRequestId = null;
  authServerName.textContent = serverRailName(server);
  authContinueButton.disabled = true;
  authContinueButton.querySelector('span')!.textContent = 'Signing in...';
  setAuthNotice('Checking launcher token', 'Gaia is asking this Current server to verify your launcher ATProto session.');
  authOverlay.classList.remove('hidden');
  setStatus('Signing in', 'neutral');

  try {
    const result = await window.gaia.authenticateServerWithClient(server.url);
    if (result.ok) {
      authFailures.delete(server.id);
      manuallyLoggedOutServers.delete(server.id);
      setAuthNotice('Signed in', 'Gaia received the Current session. Loading the server now.');
      setStatus('Connected', 'good');
      window.setTimeout(() => {
        closeAuthOverlay();
        if (selectedServer()?.id === server.id) {
          serverSessionCache.set(server.id, {
            authenticated: true,
            checkedAt: Date.now(),
          });
          serverProbeCache.delete(server.id);
          loadServerWebview(server, { force: true });
        }
      }, 900);
      return;
    }

    if (result.oauth) {
      handleOAuthStart(server, result.oauth);
      return;
    }

    showAuthFailure(server, result.message);
    setStatus('Auth failed', 'bad');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start launcher sign-in.';
    showAuthFailure(server, message);
    setStatus('Auth failed', 'bad');
  } finally {
    authContinueButton.disabled = false;
    authContinueButton.querySelector('span')!.textContent = authContinueLabel();
  }
}

function handleOAuthStart(server: GaiaServer, start: GaiaOAuthStartResponse): void {
  authRequestId = start.authId;
  if (start.authorizationUrl) {
    setAuthNotice(
      'Check your browser',
      'Complete ATProto sign-in in the browser window. Gaia will finish automatically when Current redirects back.',
    );
    setStatus('Waiting for browser', 'neutral');
    return;
  }

  if (start.lanHandoff) {
    setAuthNotice('Host-machine sign-in is required', start.lanHandoff.message, [
      {
        label: 'Open host auth link',
        run: () => {
          void window.gaia.openExternal(start.lanHandoff!.hostAuthUrl);
        },
      },
    ]);
    setStatus('Host auth needed', 'warn');
    return;
  }

  showAuthFailure(server, 'The server did not return a launcher auth flow.');
  setStatus('Auth unavailable', 'bad');
}

function closeAuthOverlay(): void {
  authServerId = null;
  authRequestId = null;
  authOverlay.classList.add('hidden');
}

function setAuthNotice(
  titleText: string,
  detailText: string,
  actions: Array<{ label: string; run: () => void }> = [],
): void {
  const title = document.createElement('strong');
  title.textContent = titleText;
  const detail = document.createElement('span');
  detail.textContent = detailText;
  const children: Array<HTMLElement> = [title, detail];
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    children.push(button);
  }
  authMessage.replaceChildren(...children);
}

function showAuthFailure(server: GaiaServer, message: string): void {
  authServerId = null;
  authRequestId = null;
  authFailures.add(server.id);
  setAuthNotice('Sign-in failed', message, [
    {
      label: 'Retry',
      run: () => {
        void startLauncherAuth(server);
      },
    },
    {
      label: 'Edit identity',
      run: () => {
        closeAuthOverlay();
        openIdentityDialog();
      },
    },
  ]);
}

function handleAuthResult(result: GaiaAuthResult): void {
  const server =
    store?.servers.find((item) => item.url === result.serverUrl || sameOrigin(item.url, result.serverUrl)) ??
    selectedServer();
  if (!server || (authRequestId && result.authId !== authRequestId)) {
    return;
  }

  if (!result.ok) {
    showAuthFailure(server, result.message);
    setStatus('Auth failed', 'bad');
    return;
  }

  authFailures.delete(server.id);
  manuallyLoggedOutServers.delete(server.id);
  setAuthNotice('Signed in', 'Gaia received the Current session. Loading the server now.');
  setStatus('Connected', 'good');
  window.setTimeout(() => {
    closeAuthOverlay();
    if (selectedServer()?.id === server.id) {
      serverSessionCache.set(server.id, {
        authenticated: true,
        checkedAt: Date.now(),
      });
      serverProbeCache.delete(server.id);
      loadServerWebview(server, { force: true });
    }
  }, 900);
}

function handleClientAuthResult(result: GaiaClientAuthResult): void {
  clientAuthPending = false;
  if (!result.ok) {
    clientAuthStatus = { authenticated: false, message: result.message };
    clearMessagesState();
    updateViewVisibility();
    setAuthNotice('Sign-in failed', result.message, [
      {
        label: 'Retry',
        run: () => {
          void startClientAuthFlow(
            pendingClientAuthPurpose ?? 'messages',
            serverById(pendingClientAuthServerId),
          );
        },
      },
    ]);
    setStatus('Auth failed', 'bad');
    renderMessagesViewport();
    return;
  }

  clientAuthStatus = {
    authenticated: true,
    profile: result.profile,
  };
  updateViewVisibility();
  setAuthNotice('Signed in', 'Gaia received your ATProto session.');
  setStatus('Signed in', 'good');
  void refreshStore();

  const purpose = pendingClientAuthPurpose;
  const server = serverById(pendingClientAuthServerId);
  pendingClientAuthPurpose = null;
  pendingClientAuthServerId = null;

  window.setTimeout(() => {
    closeAuthOverlay();
    if (purpose === 'server' && server) {
      void authenticateServerFromClient(server);
      return;
    }
    if (activeView === 'messages') {
      void loadMessagesViewport(true);
    }
  }, 700);
}

function renderMessagesViewport(): void {
  const profile = clientAuthStatus.profile;
  startChatButton.disabled = !clientAuthStatus.authenticated;
  messagesUser.textContent = profile
    ? `Signed in as ${displayActor(profile)}`
    : 'Not signed in';

  const convo = selectedConvo();
  const title = convo ? convoTitle(convo) : 'Select a message';
  const subtitle = convo ? convoSubtitle(convo) : '';
  threadEyebrow.textContent = convo ? 'Conversation' : 'Conversation';
  threadTitle.textContent = title;
  threadTitle.title = subtitle ? `${title} ${subtitle}` : title;
  threadId.textContent = subtitle;
  threadId.hidden = subtitle.length === 0;
  threadTitleGlassShell.classList.toggle('has-thread-subtitle', subtitle.length > 0);
  messageComposerInput.disabled = !convo;
  messageSendButton.disabled = !convo || messageComposerInput.value.trim().length === 0;
  syncP2PDirectCallConversation(selectedConvoId);
  syncBskyDmVoiceMonitor();
  renderIncomingP2PVoicePrompt();
  renderP2PDirectCallPanel();

  renderConvos();
  renderMessages();
  renderFloatingLiquidGlassSurfaces();
  refreshLiquidGlassSurfaceSizes();
}

function bskyMessagePreviewText(message: GaiaBskyMessage): string {
  return decodeBskyVoiceSignalPayload(message.text).length > 0 ? 'Gaia voice call signal' : message.text;
}

function renderConvos(): void {
  const fragment = document.createDocumentFragment();
  if (!clientAuthStatus.authenticated) {
    const state = document.createElement('div');
    state.className = 'messages-empty';
    state.textContent = 'Sign in to view messages.';
    convoList.replaceChildren(state);
    return;
  }

  if (convos.length === 0) {
    const state = document.createElement('div');
    state.className = 'messages-empty';
    state.textContent = 'No conversations on this page.';
    convoList.replaceChildren(state);
    return;
  }

  for (const convo of convos) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'convo-row';
    button.dataset.active = convo.id === selectedConvoId ? 'true' : 'false';

    const actor = convoPrimaryActor(convo);
    const avatar = buildAvatar(actor, convoTitle(convo), 'sm');
    const copy = document.createElement('span');
    copy.className = 'convo-copy';
    const title = document.createElement('strong');
    title.textContent = convoTitle(convo);
    const meta = document.createElement('span');
    meta.textContent = convoSubtitle(convo);
    meta.title = convoSubtitle(convo);
    const preview = document.createElement('p');
    const senderPrefix =
      convo.lastMessage?.senderDid === clientAuthStatus.profile?.did
        ? 'You: '
        : convo.lastMessage
          ? `${displayActor(actorForConvoDid(convo, convo.lastMessage.senderDid))}: `
          : '';
    const previewText = convo.lastMessage ? bskyMessagePreviewText(convo.lastMessage) : '';
    preview.textContent = previewText ? `${senderPrefix}${previewText}` : 'No message preview';
    copy.append(title, meta, preview);

    const unread = document.createElement('span');
    unread.className = 'convo-unread';
    unread.textContent = String(convo.unreadCount ?? '');
    unread.classList.toggle('hidden', !convo.unreadCount);

    button.append(avatar, copy, unread);
    button.addEventListener('click', () => {
      if (selectedConvoId === convo.id) {
        return;
      }
      syncP2PDirectCallConversation(convo.id);
      selectedConvoId = convo.id;
      updateConvoReadState(convo.id, 0);
      currentMessageCursor = undefined;
      nextMessageCursor = undefined;
      messageCursorStack = [];
      const cachedPage = messagePageCache.get(messageCacheKey(convo.id));
      messages = cachedPage?.messages ?? [];
      nextMessageCursor = cachedPage?.cursor;
      void markConvoRead(convo.id, latestMessageId(messages), true);
      void loadMessagesPage();
      renderMessagesViewport();
    });
    fragment.append(button);
  }

  convoList.replaceChildren(fragment);
}

function renderMessages(): void {
  const convoId = selectedConvoId;
  if (!convoId) {
    const state = document.createElement('div');
    state.className = 'messages-empty';
    state.textContent = 'Select a conversation.';
    messageList.replaceChildren(state);
    return;
  }

  const visibleMessages = messages.filter((message) => decodeBskyVoiceSignalPayload(message.text).length === 0);

  if (visibleMessages.length === 0) {
    const state = document.createElement('div');
    state.className = 'messages-empty';
    state.textContent = 'No messages yet.';
    messageList.replaceChildren(state);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of visibleMessages) {
    const own = message.senderDid === clientAuthStatus.profile?.did;
    const senderActor = actorForDid(message.senderDid);
    const label = messageSenderLabel(message);
    const row = document.createElement('article');
    row.className = `message-row ${own ? 'own' : 'other'}`;
    row.dataset.messageId = message.id;

    const cluster = document.createElement('div');
    cluster.className = 'message-cluster';

    const avatar = buildAvatar(senderActor, label, 'md');

    const body = document.createElement('div');
    body.className = `message-body ${own ? 'own' : 'other'}`;
    body.tabIndex = 0;
    body.addEventListener('contextmenu', (event) => {
      openMessageContextMenu(event, message);
    });

    const toolbar = document.createElement('div');
    const toolbarOverLight = shell.classList.contains('over-light-background');
    toolbar.className = `message-hover-toolbar liquid-surface ${toolbarOverLight ? 'over-light-background' : ''} ${own ? 'own' : 'other'} above`;
    const toolbarGlass = createMenuLiquidGlassBackdrop(toolbarOverLight);
    const recent = document.createElement('span');
    recent.className = 'message-hover-recent';
    for (const value of recentReactionEmojis) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'message-hover-icon emoji';
      const glyph = document.createElement('span');
      glyph.className = 'message-hover-emoji-glyph';
      glyph.textContent = value;
      button.append(glyph);
      button.title = hasOwnReaction(message, value) ? `Remove ${value}` : `React ${value}`;
      button.classList.toggle('active', hasOwnReaction(message, value));
      button.disabled = pendingReactionKeys.has(reactionPendingKey(convoId, message.id, value));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleMessageReaction(message, value);
      });
      recent.append(button);
    }
    const divider = document.createElement('span');
    divider.className = 'message-hover-divider';
    const pickerButton = document.createElement('button');
    pickerButton.type = 'button';
    pickerButton.className = 'message-hover-icon emoji-picker';
    pickerButton.title = 'Add reaction';
    pickerButton.setAttribute('aria-label', 'Add reaction');
    pickerButton.append(createEmojiPickerIcon());
    pickerButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPicker('emoji', message.id);
    });
    toolbar.append(toolbarGlass, recent, divider, pickerButton);
    const updateToolbarPlacement = (): void => {
      const listRect = messageList.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const below = bodyRect.top - listRect.top < 44;
      toolbar.classList.toggle('below', below);
      toolbar.classList.toggle('above', !below);
    };
    body.addEventListener('mouseenter', updateToolbarPlacement);
    body.addEventListener('focus', updateToolbarPlacement);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const senderName = document.createElement('strong');
    senderName.textContent = label;
    senderName.title = handleLabel(senderActor) || label;
    const time = document.createElement('span');
    time.textContent = formatTimestamp(message.sentAt);
    meta.append(senderName, time);

    const text = document.createElement('p');
    text.textContent = message.text || '[No message text]';

    body.append(createStaticMessageGlassBackdrop(shell.classList.contains('over-light-background')), meta, text);

    const gifUrl = extractGifUrl(message.text);
    if (gifUrl) {
      const playAnimatedMedia = shouldPlayGifMedia();
      if (!playAnimatedMedia) {
        body.append(createPausedGifPreview(gifUrl));
      } else if (isVideoMediaUrl(gifUrl)) {
        const video = document.createElement('video');
        video.className = 'gif-preview-video';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        const source = document.createElement('source');
        source.src = gifUrl;
        video.append(source);
        body.append(video);
      } else {
        const image = document.createElement('img');
        image.className = 'gif-preview';
        image.src = gifUrl;
        image.alt = 'GIF';
        image.loading = 'lazy';
        body.append(image);
      }
    }

    if (message.reactions?.length) {
      const reactions = document.createElement('div');
      reactions.className = 'message-reactions';
      for (const reaction of message.reactions) {
        const reacted = hasOwnReaction(message, reaction.value);
        const pending = pendingReactionKeys.has(reactionPendingKey(convoId, message.id, reaction.value));
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'message-reaction-chip';
        chip.classList.toggle('reacted', reacted);
        chip.disabled = pending;
        chip.title = reaction.senderDids.map(didLabel).join(', ');
        chip.append(document.createTextNode(reaction.value));
        const count = document.createElement('strong');
        count.textContent = String(reaction.count);
        chip.append(count);
        chip.addEventListener('click', () => {
          void toggleMessageReaction(message, reaction.value);
        });
        reactions.append(chip);
      }
      body.append(reactions);
    }

	    cluster.append(avatar, toolbar, body);
    row.append(cluster);
    fragment.append(row);
  }

  messageList.replaceChildren(fragment);
  messageList.scrollTop = messageList.scrollHeight;
}

async function getConvosPage(cursor?: string, bypassCache = false): Promise<GaiaBskyConvoPage> {
  const key = cacheKey(cursor);
  if (!bypassCache) {
    const cached = convoPageCache.get(key);
    if (cached) {
      return cached;
    }

    const inFlight = inFlightConvoPages.get(key);
    if (inFlight) {
      return inFlight;
    }
  } else {
    convoPageCache.delete(key);
  }

  const request = window.gaia.listBskyConvos({
    cursor,
    limit: 25,
  });
  inFlightConvoPages.set(key, request);
  try {
    const page = await request;
    convoPageCache.set(key, page);
    return page;
  } finally {
    inFlightConvoPages.delete(key);
  }
}

async function getMessagesPage(
  convoId: string,
  cursor?: string,
  bypassCache = false,
): Promise<GaiaBskyMessagePage> {
  const key = messageCacheKey(convoId, cursor);
  if (!bypassCache) {
    const cached = messagePageCache.get(key);
    if (cached) {
      return cached;
    }

    const inFlight = inFlightMessagePages.get(key);
    if (inFlight) {
      return inFlight;
    }
  } else {
    messagePageCache.delete(key);
  }

  const request = window.gaia.listBskyMessages({
    convoId,
    cursor,
    limit: 50,
  });
  inFlightMessagePages.set(key, request);
  try {
    const page = await request;
    const normalizedPage = {
      ...page,
      messages: orderMessagesForThread(page.messages),
    };
    messagePageCache.set(key, normalizedPage);
    return normalizedPage;
  } finally {
    inFlightMessagePages.delete(key);
  }
}

async function toggleMessageReaction(message: GaiaBskyMessage, value: string): Promise<void> {
  const convoId = selectedConvoId;
  if (!convoId || !clientAuthStatus.profile?.did) {
    setStatus('Sign in to react', 'warn');
    return;
  }

  const key = reactionPendingKey(convoId, message.id, value);
  if (pendingReactionKeys.has(key)) {
    return;
  }

  const remove = hasOwnReaction(message, value);
  pendingReactionKeys.add(key);
  renderMessages();
  try {
    const updatedMessage = await window.gaia.toggleBskyReaction({
      convoId,
      messageId: message.id,
      value,
      remove,
    });
    rememberReactionEmoji(value);
    applyMessageUpdate(updatedMessage);
    setStatus(remove ? 'Reaction removed' : 'Reaction added', 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Reaction failed', 'bad');
  } finally {
    pendingReactionKeys.delete(key);
    renderMessagesViewport();
  }
}

async function markConvoRead(convoId: string, messageId?: string, force = false): Promise<void> {
  const convo = convos.find((item) => item.id === convoId);
  if (!force && !convo?.unreadCount) {
    return;
  }

  updateConvoReadState(convoId, 0);
  renderConvos();
  try {
    const updatedConvo = await window.gaia.updateBskyRead({
      convoId,
      messageId,
    });
    convos = convos.map((item) => (item.id === updatedConvo.id ? updatedConvo : item));
    persistConvosCache();
    renderConvos();
  } catch {
    // Keep the local read state; the next automatic refresh will reconcile.
  }
}

function removeMessageFromLocalState(convoId: string, messageId: string): void {
  messages = messages.filter((message) => message.id !== messageId);
  for (const [key, page] of messagePageCache.entries()) {
    if (!key.startsWith(`${convoId}::`)) {
      continue;
    }
    messagePageCache.set(key, {
      ...page,
      messages: page.messages.filter((message) => message.id !== messageId),
    });
  }
}

async function deleteMessageForSelf(message: GaiaBskyMessage): Promise<void> {
  const convoId = selectedConvoId;
  if (!convoId) {
    setStatus('Select a conversation first', 'warn');
    return;
  }

  setStatus('Deleting message', 'neutral');
  try {
    const deletedMessage = await window.gaia.deleteBskyMessageForSelf({
      convoId,
      messageId: message.id,
    });
    removeMessageFromLocalState(convoId, deletedMessage.id);
    setStatus('Message deleted for you', 'warn');
    renderMessagesViewport();
    void refreshMessagesSilently();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Delete failed', 'bad');
  }
}

function openPicker(tab: PickerTab, reactionMessageId: string | null = null): void {
  pickerOpen = true;
  pickerTab = reactionMessageId ? 'emoji' : tab;
  emojiReactionMessageId = reactionMessageId;
  emojiTonePicker = null;
  emojiSearchInputValue = '';
  gifSearchInputValue = '';
  gifSearchInput.value = '';
  renderPicker();
  gifModalBackdrop.classList.remove('hidden');
  gifSearchInput.focus();
  if (pickerTab === 'emoji' || emojiReactionMessageId) {
    void ensureEmojiCatalog();
  }
  if (pickerTab === 'gifs' && gifTiles.length === 0) {
    void searchGifs(gifSearchQuery);
  }
}

function closePicker(): void {
  clearEmojiLongPressTimer();
  if (gifSearchTimer) {
    window.clearTimeout(gifSearchTimer);
    gifSearchTimer = undefined;
  }
  pickerOpen = false;
  emojiReactionMessageId = null;
  emojiTonePicker = null;
  gifModalBackdrop.classList.add('hidden');
  renderEmojiTonePopover();
}

function renderPickerTabs(): void {
  gifTabs.innerHTML = '';
  if (emojiReactionMessageId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'active';
    button.textContent = 'Emoji';
    gifTabs.append(button);
    return;
  }

  for (const tab of ['gifs', 'emoji'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = pickerTab === tab ? 'active' : '';
    button.textContent = tab === 'gifs' ? 'GIFs' : 'Emoji';
    button.addEventListener('click', () => {
      pickerTab = tab;
      emojiTonePicker = null;
      gifSearchInput.value = tab === 'gifs' ? gifSearchInputValue : emojiSearchInputValue;
      renderPicker();
      if (tab === 'emoji') {
        void ensureEmojiCatalog();
      }
      if (tab === 'gifs' && gifTiles.length === 0) {
        void searchGifs(gifSearchQuery);
      }
    });
    gifTabs.append(button);
  }
}

function renderPicker(): void {
  if (!pickerOpen) {
    renderEmojiTonePopover();
    return;
  }

  renderPickerTabs();
  renderEmojiTonePopover();
  gifSearchInput.placeholder = pickerTab === 'gifs' ? 'Search GIFs' : 'Search emoji';
  gifSearchInput.value = pickerTab === 'gifs' ? gifSearchInputValue : emojiSearchInputValue;
  gifModalContent.innerHTML = '';

  if (pickerTab === 'gifs' && !emojiReactionMessageId) {
    const topicGrid = document.createElement('div');
    topicGrid.className = 'gif-topic-grid';
    for (const topic of GIF_QUICK_TOPICS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gif-topic-card';
      button.textContent = topic;
      button.addEventListener('click', () => {
        gifSearchInputValue = topic;
        gifSearchInput.value = topic;
        void searchGifs(topic);
      });
      topicGrid.append(button);
    }

    const results = document.createElement('div');
    results.className = 'gif-results-grid';
    if (gifLoading) {
      const state = document.createElement('p');
      state.textContent = 'Loading GIFs...';
      results.append(state);
    } else if (gifProviderWarning) {
      const warning = document.createElement('p');
      warning.className = 'gif-provider-warning';
      warning.textContent = gifProviderWarning;
      results.append(warning);
    }

    if (!gifLoading && gifTiles.length === 0) {
      const state = document.createElement('p');
      state.textContent = 'No GIFs found for this search.';
      results.append(state);
    }

    for (const tile of gifTiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gif-result-card';
      const image = document.createElement('img');
      image.src = tile.previewUrl;
      image.alt = tile.label;
      image.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = tile.label;
      button.append(image, label);
      button.addEventListener('click', () => {
        void sendGifTile(tile);
      });
      results.append(button);
    }

    gifModalContent.append(topicGrid, results);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'emoji-results-grid';
  if (emojiCatalogLoading && emojiCatalog.length === 0) {
    const state = document.createElement('p');
    state.textContent = 'Loading emoji...';
    grid.append(state);
    gifModalContent.append(grid);
    return;
  }

  const entries = filteredEmojiEntries();
  if (entries.length === 0) {
    const state = document.createElement('p');
    state.textContent = 'No emoji found for this search.';
    grid.append(state);
  }

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-result-card';
    const toneGroup = getEmojiToneGroupForEntry(entry, emojiToneIndex);
    const displayEmoji = getPreferredEmojiForEntry(entry, emojiToneIndex, emojiToneDefaults);
    const label = toneGroup ? `${entry.name}, skin tone options available` : entry.name;
    button.classList.toggle('tone-stack', Boolean(toneGroup));
    button.title = label;
    button.setAttribute('aria-label', label);
    const char = document.createElement('span');
    char.className = 'emoji-char';
    char.textContent = displayEmoji;
    button.append(char);
    button.addEventListener('click', () => {
      handleEmojiEntrySelect(entry);
    });
    button.addEventListener('contextmenu', (event) => {
      handleEmojiToneContextMenu(event, toneGroup);
    });
    button.addEventListener('pointerdown', (event) => {
      handleEmojiLongPressStart(event, toneGroup);
    });
    button.addEventListener('pointerup', handleEmojiLongPressEnd);
    button.addEventListener('pointercancel', handleEmojiLongPressEnd);
    button.addEventListener('pointerleave', handleEmojiLongPressEnd);
    grid.append(button);
  }
  gifModalContent.append(grid);
}

function openEmojiTonePicker(group: EmojiToneGroup, clientX: number, clientY: number): void {
  const popoverHalfWidth = Math.min(180, Math.max(120, (window.innerWidth - 24) / 2));
  const x = Math.min(
    Math.max(clientX, popoverHalfWidth + 12),
    Math.max(popoverHalfWidth + 12, window.innerWidth - popoverHalfWidth - 12),
  );
  const y = Math.min(Math.max(clientY, 196), Math.max(196, window.innerHeight - 18));
  emojiTonePicker = {
    group,
    x,
    y,
  };
  renderEmojiTonePopover();
}

function renderEmojiTonePopover(): void {
  emojiTonePopover.innerHTML = '';
  if (!pickerOpen || !emojiTonePicker) {
    emojiTonePopover.classList.add('hidden');
    return;
  }

  emojiTonePopover.style.left = `${emojiTonePicker.x}px`;
  emojiTonePopover.style.top = `${emojiTonePicker.y}px`;
  emojiTonePopover.classList.remove('hidden');

  const selectedEmoji =
    emojiToneDefaults[emojiTonePicker.group.baseEmoji] ??
    emojiTonePicker.group.variants.find((variant) => variant.toneId === 'default')?.emoji ??
    emojiTonePicker.group.variants[0]?.emoji;

  for (const variant of emojiTonePicker.group.variants) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-tone-option';
    button.classList.toggle('active', selectedEmoji === variant.emoji);
    button.title = variant.label;
    button.setAttribute('aria-label', `${emojiTonePicker.group.baseName}, ${variant.label}`);
    const char = document.createElement('span');
    char.className = 'emoji-char';
    char.textContent = variant.emoji;
    button.append(char);
    button.addEventListener('click', () => {
      handleEmojiToneSelect(emojiTonePicker!.group, variant);
    });
    emojiTonePopover.append(button);
  }
}

function handleEmojiEntrySelect(entry: EmojiEntry): void {
  if (emojiLongPressTriggered) {
    emojiLongPressTriggered = false;
    return;
  }

  const emoji = getPreferredEmojiForEntry(entry, emojiToneIndex, emojiToneDefaults);
  void useEmojiFromPicker(emoji);
}

function handleEmojiToneSelect(group: EmojiToneGroup, variant: EmojiToneVariant): void {
  saveEmojiToneDefault(group, variant);
  void useEmojiFromPicker(variant.emoji);
}

function handleEmojiToneContextMenu(event: MouseEvent, group: EmojiToneGroup | null): void {
  if (!group) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  openEmojiTonePicker(group, event.clientX, event.clientY);
}

function handleEmojiLongPressStart(event: PointerEvent, group: EmojiToneGroup | null): void {
  if (!group || event.button !== 0) {
    return;
  }

  clearEmojiLongPressTimer();
  emojiLongPressTriggered = false;
  const { clientX, clientY } = event;
  emojiLongPressTimer = window.setTimeout(() => {
    emojiLongPressTimer = undefined;
    emojiLongPressTriggered = true;
    openEmojiTonePicker(group, clientX, clientY);
  }, EMOJI_LONG_PRESS_MS);
}

function handleEmojiLongPressEnd(): void {
  clearEmojiLongPressTimer();
  if (!emojiLongPressTriggered) {
    return;
  }

  window.setTimeout(() => {
    emojiLongPressTriggered = false;
  }, 0);
}

function scheduleGifSearch(): void {
  if (pickerTab === 'emoji' || emojiReactionMessageId) {
    emojiSearchInputValue = gifSearchInput.value;
    emojiTonePicker = null;
    renderPicker();
    return;
  }

  gifSearchInputValue = gifSearchInput.value;
  if (gifSearchTimer) {
    window.clearTimeout(gifSearchTimer);
  }
  gifSearchTimer = window.setTimeout(() => {
    void searchGifs(gifSearchInputValue.trim() || 'Trending GIFs');
  }, 260);
}

async function searchGifs(query: string): Promise<void> {
  const sequence = ++gifSearchSequence;
  gifSearchQuery = query;
  gifLoading = true;
  gifProviderWarning = '';
  renderPicker();
  try {
    const response = await window.gaia.searchCurrentGifs({
      serverUrl: selectedServer()?.url,
      query,
      limit: MAX_GIF_RESULTS,
    });
    if (sequence !== gifSearchSequence) {
      return;
    }
    gifTiles = response.results
      .map(gifTileFromResult)
      .filter((tile): tile is GifTile => Boolean(tile))
      .slice(0, MAX_GIF_RESULTS);
    gifProviderWarning = response.providerError?.message ?? '';
  } catch (error) {
    if (sequence !== gifSearchSequence) {
      return;
    }
    gifTiles = [];
    gifProviderWarning = error instanceof Error ? error.message : 'Could not load GIFs right now.';
  } finally {
    if (sequence === gifSearchSequence) {
      gifLoading = false;
      renderPicker();
    }
  }
}

function insertEmojiIntoComposer(emoji: string): void {
  const start = messageComposerInput.selectionStart ?? messageComposerInput.value.length;
  const end = messageComposerInput.selectionEnd ?? start;
  const value = messageComposerInput.value;
  messageComposerInput.value = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
  const nextPosition = start + emoji.length;
  messageComposerInput.focus();
  messageComposerInput.setSelectionRange(nextPosition, nextPosition);
  messageSendButton.disabled = !selectedConvoId || messageComposerInput.value.trim().length === 0;
}

async function useEmojiFromPicker(emoji: string): Promise<void> {
  if (emojiReactionMessageId) {
    const message = messages.find((item) => item.id === emojiReactionMessageId);
    if (message) {
      rememberReactionEmoji(emoji);
      await toggleMessageReaction(message, emoji);
    }
    closePicker();
    return;
  }

  insertEmojiIntoComposer(emoji);
  closePicker();
}

async function sendGifTile(tile: GifTile): Promise<void> {
  closePicker();
  await sendTextMessage(tile.selectUrl);
}

async function refreshMessagesSilently(): Promise<void> {
  if (messagesAutoRefreshInFlight || !clientAuthStatus.authenticated) {
    return;
  }

  messagesAutoRefreshInFlight = true;
  try {
    const previousSelectedConvoId = selectedConvoId;
    const previousConvos = convos;
    const page = await getConvosPage(undefined, true);
    const desktopNotifications = shouldPlayBskyMessageNotification(previousConvos, page.convos);
    setConvos(page.convos, page.cursor);
    if (desktopNotifications.length > 0) {
      void playGaiaNotificationSound('Bluesky message notification');
      for (const notification of desktopNotifications) {
        void showBskyMessageDesktopNotification(notification);
      }
    }

    if (previousSelectedConvoId && convos.some((convo) => convo.id === previousSelectedConvoId)) {
      selectedConvoId = previousSelectedConvoId;
    } else {
      selectedConvoId = convos[0]?.id ?? null;
    }

    if (activeView === 'messages' && selectedConvoId) {
      const convoId = selectedConvoId;
      const messagePage = await getMessagesPage(convoId, undefined, true);
      if (selectedConvoId === convoId) {
        messages = messagePage.messages;
        currentMessageCursor = undefined;
        nextMessageCursor = messagePage.cursor;
        void markConvoRead(convoId, latestMessageId(messages));
      }
    } else if (activeView === 'messages') {
      messages = [];
      currentMessageCursor = undefined;
      nextMessageCursor = undefined;
    }

    if (activeView === 'messages') {
      renderMessagesViewport();
    } else {
      renderConvos();
    }
  } catch {
    // Automatic refresh should never interrupt the chat UI.
  } finally {
    messagesAutoRefreshInFlight = false;
  }
}

function openNewChatDialog(): void {
  newChatError.textContent = '';
  newChatSearchInput.value = '';
  newChatActors = [];
  renderNewChatResults();
  newChatDialog.showModal();
  newChatSearchInput.focus();
}

function closeNewChatDialog(): void {
  if (actorSearchTimer) {
    window.clearTimeout(actorSearchTimer);
    actorSearchTimer = undefined;
  }
  newChatDialog.close();
}

function renderNewChatResults(loading = false): void {
  newChatResults.innerHTML = '';
  const query = newChatSearchInput.value.trim();
  if (loading) {
    const state = document.createElement('div');
    state.className = 'new-chat-loading';
    state.setAttribute('role', 'status');
    state.setAttribute('aria-label', 'Searching for Bluesky users');
    state.setAttribute('aria-live', 'polite');

    const pulse = document.createElement('span');
    pulse.className = 'new-chat-loading-pulse';
    pulse.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      pulse.append(document.createElement('i'));
    }

    const rows = document.createElement('span');
    rows.className = 'new-chat-loading-rows';
    rows.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      const row = document.createElement('span');
      row.className = 'new-chat-loading-row';
      row.append(document.createElement('i'), document.createElement('b'));
      rows.append(row);
    }

    state.append(pulse, rows);
    newChatResults.append(state);
    return;
  }

  if (!query) {
    return;
  }

  if (newChatActors.length === 0) {
    const state = document.createElement('div');
    state.className = 'new-chat-empty';
    state.textContent = 'No accounts found.';
    newChatResults.append(state);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const actor of newChatActors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'new-chat-result';
    const avatar = buildAvatar(actor, displayActor(actor), 'sm');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = displayActor(actor);
    const handle = document.createElement('span');
    handle.textContent = handleLabel(actor);
    copy.append(name, handle);
    button.append(avatar, copy);
    button.addEventListener('click', () => {
      void startChatWithActor(actor);
    });
    fragment.append(button);
  }
  newChatResults.append(fragment);
}

async function searchNewChatActors(): Promise<void> {
  const query = newChatSearchInput.value.trim();
  const sequence = ++actorSearchSequence;
  newChatError.textContent = '';
  newChatActors = [];
  if (!query) {
    renderNewChatResults();
    return;
  }

  renderNewChatResults(true);
  try {
    const actors = await window.gaia.searchBskyActors({
      query,
      limit: 8,
    });
    if (sequence !== actorSearchSequence) {
      return;
    }
    newChatActors = actors;
    renderNewChatResults();
  } catch (error) {
    if (sequence !== actorSearchSequence) {
      return;
    }
    newChatError.textContent = error instanceof Error ? error.message : 'Search failed.';
    renderNewChatResults();
  }
}

function scheduleNewChatSearch(): void {
  if (actorSearchTimer) {
    window.clearTimeout(actorSearchTimer);
  }
  actorSearchTimer = window.setTimeout(() => {
    void searchNewChatActors();
  }, ACTOR_SEARCH_DEBOUNCE_MS);
}

async function startChatWithActor(actor: GaiaBskyActor): Promise<void> {
  newChatError.textContent = '';
  startChatButton.disabled = true;
  try {
    const convo = await window.gaia.getBskyConvoForMember({ did: actor.did });
    upsertConvo(convo);
    selectedConvoId = convo.id;
    currentMessageCursor = undefined;
    nextMessageCursor = undefined;
    messageCursorStack = [];
    messages = [];
    closeNewChatDialog();
    switchToMessagesView();
    await loadMessagesPage(undefined, true);
  } catch (error) {
    newChatError.textContent = error instanceof Error ? error.message : 'Could not start chat.';
  } finally {
    startChatButton.disabled = !clientAuthStatus.authenticated;
  }
}

async function sendTextMessage(text: string): Promise<void> {
  const convoId = selectedConvoId;
  const trimmedText = text.trim();
  if (!convoId || !trimmedText) {
    renderMessagesViewport();
    return;
  }

  messageComposerInput.disabled = true;
  messageSendButton.disabled = true;
  try {
    const sentMessage = await window.gaia.sendBskyMessage({
      convoId,
      text: trimmedText,
    });
    messageComposerInput.value = '';
    updateConvoLastMessage(convoId, sentMessage);
    applyMessageUpdate(sentMessage);
    await loadMessagesPage(undefined, true);
    void refreshMessagesSilently();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Message failed', 'bad');
  } finally {
    messageComposerInput.disabled = !selectedConvoId;
    messageSendButton.disabled = !selectedConvoId || messageComposerInput.value.trim().length === 0;
  }
}

async function sendComposerMessage(): Promise<void> {
  await sendTextMessage(messageComposerInput.value);
}

async function loadMessagesViewport(force = false): Promise<void> {
  if (activeView !== 'messages') {
    return;
  }

  const signedIn = await ensureClientAuth('messages');
  if (!signedIn) {
    renderMessagesViewport();
    return;
  }

  if (restoreConvosCache()) {
    renderMessagesViewport();
  }

  if (force || convos.length === 0) {
    await loadConvosPage(undefined, true);
  } else {
    renderMessagesViewport();
    void refreshMessagesSilently();
  }
}

async function loadConvosPage(cursor?: string, resetStack = false): Promise<void> {
  setStatus('Loading messages', 'neutral');
  try {
    if (resetStack) {
      convoPageCache.clear();
      messagePageCache.clear();
      inFlightConvoPages.clear();
      inFlightMessagePages.clear();
    }
    const page = await getConvosPage(cursor, resetStack);
    setConvos(page.convos, page.cursor);
    primeBskyNotificationBaseline(convos);
    currentConvoCursor = cursor;
    if (resetStack) {
      convoCursorStack = [];
    }
    if (!selectedConvoId || !convos.some((convo) => convo.id === selectedConvoId)) {
      selectedConvoId = convos[0]?.id ?? null;
      currentMessageCursor = undefined;
      nextMessageCursor = undefined;
      messageCursorStack = [];
      messages = [];
      if (selectedConvoId) {
        await loadMessagesPage(undefined, resetStack);
      }
    } else if (selectedConvoId && (resetStack || messages.length === 0)) {
      await loadMessagesPage(undefined, resetStack);
    }
    setStatus('Messages ready', 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Messages failed', 'bad');
  } finally {
    renderMessagesViewport();
  }
}

async function loadMessagesPage(cursor?: string, resetStack = false): Promise<void> {
  const convoId = selectedConvoId;
  if (!convoId) {
    renderMessagesViewport();
    return;
  }

  setStatus('Loading thread', 'neutral');
  try {
    const page = await getMessagesPage(convoId, cursor, resetStack);
    if (selectedConvoId !== convoId) {
      return;
    }
    messages = page.messages;
    currentMessageCursor = cursor;
    nextMessageCursor = page.cursor;
    if (resetStack) {
      messageCursorStack = [];
    }
    void markConvoRead(convoId, latestMessageId(messages));
    setStatus('Messages ready', 'good');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Thread failed', 'bad');
  } finally {
    renderMessagesViewport();
  }
}

function openServerDialog(mode: ServerDialogMode): void {
  const server = selectedServer();
  serverDialogMode = mode;
  serverDialogTitle.textContent = mode === 'add' ? 'Add Server' : 'Edit Server';
  serverDialogError.textContent = '';
  deleteServerButton.classList.toggle('hidden', mode !== 'edit' || !server);
  serverUrlInput.value = mode === 'edit' && server ? server.url : '';
  serverDialog.showModal();
  renderServerDialogLiquidGlass();
  refreshLiquidGlassSurfaceSizes();
  serverUrlInput.focus();
}

function openIdentityDialog(): void {
  identityInput.value = store?.identity?.handle ?? '';
  identityDialog.showModal();
  identityInput.focus();
}

serverForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = {
    url: serverUrlInput.value,
  };

  void (async () => {
    try {
      if (serverDialogMode === 'edit' && selectedServerId) {
        store = await window.gaia.updateServer(selectedServerId, input);
      } else {
        store = await window.gaia.addServer(input);
      }
      selectedServerId = store.selectedServerId;
      serverDialog.close();
      loadSelectedServer();
      void refreshServerRailIdentities();
    } catch (error) {
      serverDialogError.textContent = error instanceof Error ? error.message : 'Could not save server.';
    }
  })();
});

identityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const handle = identityInput.value.trim();
  void (async () => {
    store = await window.gaia.setIdentity(handle ? { handle } : null);
    authFailures.clear();
    identityDialog.close();
    render();
    const server = selectedServer();
    if (server && handle) {
      await startLauncherAuth(server, handle);
    }
  })();
});

deleteServerButton.addEventListener('click', () => {
  const server = selectedServer();
  if (!server) {
    return;
  }
  void (async () => {
    store = await window.gaia.removeServer(server.id);
    selectedServerId = store.selectedServerId;
    serverDialog.close();
    loadSelectedServer();
  })();
});

clearIdentityButton.addEventListener('click', () => {
  void (async () => {
    store = await window.gaia.setIdentity(null);
    identityDialog.close();
    render();
    setStatus('Identity cleared', 'warn');
  })();
});

addServerButton.addEventListener('click', () => {
  hideServerContextMenu();
  openServerDialog('add');
});
notificationCenterButton.addEventListener('click', (event) => {
  event.stopPropagation();
  switchToNotificationsView();
});
notificationCenterMarkReadButton.addEventListener('click', () => {
  void window.gaia.markNotificationsRead().then((state) => {
    notificationCenterState = state;
    renderNotificationCenter();
  });
});
notificationCenterClearButton.addEventListener('click', () => {
  void window.gaia.clearNotifications().then((state) => {
    notificationCenterState = state;
    renderNotificationCenter();
  });
});
settingsButton.addEventListener('click', () => {
  const hasUpdate = hasLauncherUpdateAttention();
  switchToSettingsView(hasUpdate ? { section: 'updates', clearSearch: true } : undefined);
});
settingsButton.addEventListener('contextmenu', openRailAppearanceMenu);
signedOutLoginButton.addEventListener('click', () => {
  openClientAuthChooser('app');
});
signedOutScreen.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !isLandingGlobeDragTarget(event.target)) {
    return;
  }
  landingScenePointer.dragging = true;
  landingScenePointer.lastX = event.clientX;
  landingScenePointer.lastY = event.clientY;
  signedOutScreen.classList.add('is-dragging-globe');
  signedOutScreen.setPointerCapture(event.pointerId);
});
signedOutScreen.addEventListener('pointermove', (event) => {
  if (!landingScenePointer.dragging) {
    return;
  }
  const deltaX = event.clientX - landingScenePointer.lastX;
  const deltaY = event.clientY - landingScenePointer.lastY;
  landingScenePointer.lastX = event.clientX;
  landingScenePointer.lastY = event.clientY;
  landingScenePointer.yaw += deltaX * 0.0065;
  landingScenePointer.pitch = THREE.MathUtils.clamp(landingScenePointer.pitch + deltaY * 0.0048, -0.42, 0.42);
  event.preventDefault();
});
signedOutScreen.addEventListener('pointerup', (event) => {
  finishLandingGlobeDrag(event);
});
signedOutScreen.addEventListener('pointercancel', (event) => {
  finishLandingGlobeDrag(event);
});
signedOutScreen.addEventListener('pointerleave', () => {
  finishLandingGlobeDrag();
});
messagesButton.addEventListener('click', () => {
  hideServerContextMenu();
  switchToMessagesView();
});
messageCallButton.addEventListener('click', () => {
  openP2PDirectCall(true);
});
p2pAcceptCallButton.addEventListener('click', () => {
  void acceptIncomingP2PVoiceCall();
});
p2pRejectCallButton.addEventListener('click', () => {
  void rejectIncomingP2PVoiceCall();
});
p2pCallCloseButton.addEventListener('click', () => {
  closeP2PDirectCall({ leave: false });
});
p2pJoinVoiceButton.addEventListener('click', () => {
  void joinP2PVoice();
});
p2pMuteVoiceButton.addEventListener('click', () => {
  void toggleP2PVoiceMute();
});
p2pLeaveVoiceButton.addEventListener('click', () => {
  closeP2PDirectCall({ leave: true });
});
p2pCopySignalButton.addEventListener('click', () => {
  void copyP2PVoiceSignal();
});
p2pClearSignalButton.addEventListener('click', clearP2PVoiceSignal);
p2pApplySignalButton.addEventListener('click', () => {
  void applyP2PVoiceSignal();
});
p2pClearPeerSignalButton.addEventListener('click', () => {
  p2pPeerSignalInput.value = '';
  renderP2PDirectCallPanel();
});
p2pPeerSignalInput.addEventListener('input', renderP2PDirectCallPanel);
settingsCloseButton.addEventListener('click', closeSettingsView);
settingsSearchInput.addEventListener('input', () => {
  settingsSearchQuery = settingsSearchInput.value;
  renderSettingsWorkspace();
});
window.addEventListener('keydown', handleSoundKeyCapture, true);
settingsResetButton.addEventListener('click', resetSettingsDraft);
settingsSaveButton.addEventListener('click', () => {
  void saveSettingsDraft();
});
startChatButton.addEventListener('click', () => {
  openNewChatDialog();
});
emptyAddServerButton.addEventListener('click', () => openServerDialog('add'));
closeServerDialogButton.addEventListener('click', () => serverDialog.close());
cancelServerDialogButton.addEventListener('click', () => serverDialog.close());
closeIdentityDialogButton.addEventListener('click', () => identityDialog.close());
cancelIdentityDialogButton.addEventListener('click', () => identityDialog.close());
closeNewChatDialogButton.addEventListener('click', closeNewChatDialog);
cancelNewChatDialogButton.addEventListener('click', closeNewChatDialog);
newChatSearchInput.addEventListener('input', scheduleNewChatSearch);
newChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (newChatActors.length > 0) {
    void startChatWithActor(newChatActors[0]);
    return;
  }
  void searchNewChatActors();
});
messageComposerInput.addEventListener('input', () => {
  messageSendButton.disabled = !selectedConvoId || messageComposerInput.value.trim().length === 0;
});
messageComposerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendComposerMessage();
  }
});
messageComposerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendComposerMessage();
});
gifPickerButton.addEventListener('click', () => openPicker('gifs'));
emojiPickerButton.addEventListener('click', () => openPicker('emoji'));
gifCloseButton.addEventListener('click', closePicker);
gifSearchInput.addEventListener('input', scheduleGifSearch);
gifModalBackdrop.addEventListener('click', closePicker);
gifModal.addEventListener('click', (event) => {
  event.stopPropagation();
});
emojiTonePopover.addEventListener('click', (event) => {
  event.stopPropagation();
});
emojiTonePopover.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
logoutButton.addEventListener('click', () => {
  void logoutSelectedServer();
});
authContinueButton.addEventListener('click', () => {
  const server = selectedServer();
  let handle: string;
  try {
    handle = selectedAuthProviderHandle();
  } catch (error) {
    setAuthNotice('Server address required', error instanceof Error ? error.message : 'Enter a valid server address.');
    setAuthProviderChoice('custom');
    return;
  }

  if (pendingClientAuthPurpose === 'app') {
    void startClientAuthFlow('app', undefined, handle);
  } else if (pendingClientAuthPurpose === 'messages') {
    void startClientAuthFlow('messages', undefined, handle);
  } else if (server) {
    void startLauncherAuth(server, handle);
  } else {
    void startClientAuthFlow('messages', undefined, handle);
  }
});
authProviderBlueskyButton.addEventListener('click', () => {
  setAuthProviderChoice('bluesky');
  setAuthNotice('Ready', 'Continue with Bluesky, or choose Other for a custom ATProto provider.');
});
authProviderCustomButton.addEventListener('click', () => {
  setAuthProviderChoice('custom');
  setAuthNotice('Custom provider', 'Enter the ATProto server address for your account provider.');
});
authProviderAddressInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    authContinueButton.click();
  }
});
closeAuthButton.addEventListener('click', closeAuthOverlay);
serverContextMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});
serverContextMenu.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
messageContextMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});
messageContextMenu.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
railAppearanceMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});
railAppearanceMenu.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
document.addEventListener('pointerdown', (event) => {
  if (!serverContextMenu.classList.contains('hidden') && !serverContextMenu.contains(event.target as Node)) {
    hideServerContextMenu();
  }
  if (!messageContextMenu.classList.contains('hidden') && !messageContextMenu.contains(event.target as Node)) {
    hideMessageContextMenu();
  }
  if (!railAppearanceMenu.classList.contains('hidden') && !railAppearanceMenu.contains(event.target as Node)) {
    hideRailAppearanceMenu();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideServerContextMenu();
    hideMessageContextMenu();
    hideRailAppearanceMenu();
  }
});
window.addEventListener('focus', () => {
  if (activeView === 'messages' && currentSettings().gifPlayback === 'focused') {
    renderMessages();
  }
  syncVisibleGifPlayback();
});
window.addEventListener('blur', () => {
  if (activeView === 'messages' && currentSettings().gifPlayback === 'focused') {
    renderMessages();
  }
  syncVisibleGifPlayback();
});
window.addEventListener('resize', () => {
  landingSceneReady = false;
  if (!signedOutScreen.classList.contains('hidden')) {
    drawLandingScene();
  }
});
systemAppearanceQuery.addEventListener('change', () => {
  if (currentSettings().appearanceMode === 'auto') {
    applyAppSettings();
  }
});

configureServerWebview(serverWebview);
new MutationObserver(() => {
  if (activeView !== 'messages' || !clientAuthStatus.authenticated) {
    return;
  }
  renderFloatingLiquidGlassSurfaces();
  refreshLiquidGlassSurfaceSizes();
}).observe(shell, { attributes: true, attributeFilter: ['class'] });
window.gaia.onAuthResult(handleAuthResult);
window.gaia.onClientAuthResult(handleClientAuthResult);
window.gaia.onSpotifyChanged((status) => {
  spotifyStatus = status;
  if (activeView === 'settings' && activeSettingsSection === 'connections') {
    renderSettingsWorkspace();
  }
});
window.gaia.onNotificationsChanged((state) => {
  notificationCenterState = state;
  renderNotificationCenter();
});
window.gaia.onUpdateStateChanged((state) => {
  updateState = state;
  syncLauncherUpdateBadge();
  if (activeView === 'settings' && activeSettingsSection === 'updates') {
    renderSettingsWorkspace();
  }
});
bindP2PVoiceService(p2pVoiceService);

window.addEventListener('focus', () => {
  void maybeCheckForLauncherUpdates(LAUNCHER_UPDATE_FOCUS_CHECK_INTERVAL_MS);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void maybeCheckForLauncherUpdates(LAUNCHER_UPDATE_FOCUS_CHECK_INTERVAL_MS);
  }
});
window.addEventListener('beforeunload', () => {
  closeBskyDmVoiceMonitor();
  p2pVoiceService.destroy();
});

void initialize();
