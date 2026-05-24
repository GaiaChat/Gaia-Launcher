import { app, shell, type WebContents } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';
import type { GaiaUpdateInstallMode, GaiaUpdateProgress, GaiaUpdateState, GaiaUpdateStatus } from '../shared.js';

const requireFromUpdater = createRequire(import.meta.url);
const { autoUpdater } = requireFromUpdater('electron-updater') as typeof import('electron-updater');
const DEFAULT_RELEASE_PAGE_URL = 'https://github.com/GaiaChat/Gaia-Launcher/releases/latest';
const packagedMetadata = readPackagedGaiaMetadata();
const UPDATE_FEED_URL =
  cleanUrl(process.env.GAIA_UPDATE_URL) ??
  cleanUrl(process.env.GAIA_UPDATE_BASE_URL) ??
  cleanUrl(packagedMetadata.updateBaseUrl);
const RELEASE_PAGE_URL =
  cleanUrl(process.env.GAIA_RELEASES_URL) ??
  cleanUrl(packagedMetadata.releasePageUrl) ??
  toReleasePageUrl(UPDATE_FEED_URL) ??
  DEFAULT_RELEASE_PAGE_URL;
const UPDATE_STATE_CHANNEL = 'gaia:updates:changed';

let launcherContents: WebContents | null = null;
let updaterConfigured = false;
let currentState = createInitialUpdateState();

function releaseChannelFromVersion(version: string): string | null {
  const match = /^\d+\.\d+\.\d+-([0-9A-Za-z]+)(?:[.-][0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(version);
  return match?.[1] ?? null;
}

export function setUpdaterWebContents(contents: WebContents): void {
  launcherContents = contents;
  contents.once('destroyed', () => {
    if (launcherContents === contents) {
      launcherContents = null;
    }
  });
}

export function configureGaiaUpdater(): void {
  if (updaterConfigured) {
    return;
  }
  updaterConfigured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  const releaseChannel = releaseChannelFromVersion(app.getVersion());
  if (releaseChannel) {
    autoUpdater.channel = releaseChannel;
    autoUpdater.allowPrerelease = true;
  }
  autoUpdater.logger = {
    info: (message?: unknown) => console.info('[gaia:updates]', message),
    warn: (message?: unknown) => console.warn('[gaia:updates]', message),
    error: (message?: unknown) => console.error('[gaia:updates]', message),
  };

  if (UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
  }

  autoUpdater.on('checking-for-update', () => {
    updateState({
      status: 'checking',
      message: 'Checking for Gaia updates...',
      error: undefined,
      progress: undefined,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    updateState({
      status: 'not_available',
      checkedAt: nowIso(),
      availableVersion: info.version,
      message: `Gaia ${currentState.currentVersion} is up to date.`,
      progress: undefined,
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updateState({
      status: 'available',
      checkedAt: nowIso(),
      availableVersion: info.version,
      message: `Gaia ${info.version} is ready to download.`,
      progress: undefined,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    updateState({
      status: 'downloading',
      message: `Downloading Gaia ${currentState.availableVersion ?? 'update'}...`,
      progress: toGaiaUpdateProgress(progress),
    });
  });

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    updateState({
      status: 'downloaded',
      availableVersion: event.version,
      downloadedFile: event.downloadedFile,
      message: `Gaia ${event.version} is ready to install.`,
      progress: undefined,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    const context = resolveUpdateContext();
    updateState({
      ...context,
      status: 'error',
      error: error.message,
      message: `${error.message} You can still download Gaia manually.`,
      progress: undefined,
    });
  });
}

export function getGaiaUpdateState(): GaiaUpdateState {
  currentState = {
    ...currentState,
    ...resolveUpdateContext(),
  };
  return currentState;
}

export async function checkGaiaUpdates(): Promise<GaiaUpdateState> {
  configureGaiaUpdater();
  const context = resolveUpdateContext();
  if (!context.canCheck) {
    currentState = {
      ...currentState,
      ...context,
      status: 'unsupported',
      message: context.message,
    };
    broadcastUpdateState();
    return currentState;
  }

  await autoUpdater.checkForUpdates();
  return currentState;
}

export async function downloadGaiaUpdate(): Promise<GaiaUpdateState> {
  configureGaiaUpdater();
  if (!currentState.canDownload) {
    return currentState;
  }
  updateState({
    status: 'downloading',
    message: `Downloading Gaia ${currentState.availableVersion ?? 'update'}...`,
    progress: currentState.progress,
  });
  await autoUpdater.downloadUpdate();
  return currentState;
}

export async function installGaiaUpdate(): Promise<GaiaUpdateState> {
  configureGaiaUpdater();
  if (!currentState.canInstall) {
    return currentState;
  }
  updateState({
    status: 'installing',
    message: 'Installing Gaia update...',
  });
  autoUpdater.quitAndInstall(false, true);
  return currentState;
}

export async function openGaiaUpdateDownloads(): Promise<GaiaUpdateState> {
  await shell.openExternal(RELEASE_PAGE_URL);
  return getGaiaUpdateState();
}

function createInitialUpdateState(): GaiaUpdateState {
  const context = resolveUpdateContext('idle');
  return {
    ...context,
    status: context.supported ? 'idle' : 'unsupported',
    message: context.message,
  };
}

function resolveUpdateContext(currentStatus: GaiaUpdateStatus = currentState.status): Omit<GaiaUpdateState, 'status'> {
  const currentVersion = app.getVersion();
  const base = {
    currentVersion,
    platform: process.platform,
    arch: process.arch,
    releasePageUrl: RELEASE_PAGE_URL,
    feedUrl: UPDATE_FEED_URL,
    canOpenDownloads: true,
  };

  if (!app.isPackaged) {
    return {
      ...base,
      supported: false,
      canCheck: false,
      canDownload: false,
      canInstall: false,
      installMode: 'development',
      message: 'Update checks are available in packaged Gaia builds.',
    };
  }

  if (!hasUpdateFeed()) {
    return {
      ...base,
      supported: false,
      canCheck: false,
      canDownload: false,
      canInstall: false,
      installMode: resolveInstallMode(),
      message: 'This Gaia build does not include update feed metadata.',
    };
  }

  const installMode = resolveInstallMode();
  const supportsInstall = installMode === 'appimage' || installMode === 'package-manager';
  return {
    ...base,
    supported: supportsInstall,
    canCheck: supportsInstall,
    canDownload: currentStatus === 'available',
    canInstall: currentStatus === 'downloaded',
    installMode,
    message: supportsInstall
      ? readyMessageForInstallMode(installMode)
      : 'This Gaia package is updated by its store or package manager.',
  };
}

function updateState(patch: Partial<GaiaUpdateState> & { status?: GaiaUpdateStatus }): void {
  const context = resolveUpdateContext();
  currentState = {
    ...currentState,
    ...context,
    ...patch,
  };
  currentState.canDownload = currentState.supported && currentState.status === 'available';
  currentState.canInstall = currentState.supported && currentState.status === 'downloaded';
  broadcastUpdateState();
}

function broadcastUpdateState(): void {
  if (!launcherContents || launcherContents.isDestroyed()) {
    return;
  }
  launcherContents.send(UPDATE_STATE_CHANNEL, currentState);
}

function hasUpdateFeed(): boolean {
  if (UPDATE_FEED_URL) {
    return true;
  }
  return existsSync(join(process.resourcesPath, 'app-update.yml'));
}

function resolveInstallMode(): GaiaUpdateInstallMode {
  if (!app.isPackaged) {
    return 'development';
  }
  if (process.platform !== 'linux') {
    return 'manual';
  }
  if (process.env.APPIMAGE) {
    return 'appimage';
  }
  if (process.env.FLATPAK_ID || process.env.SNAP) {
    return 'store';
  }
  return 'package-manager';
}

function readyMessageForInstallMode(installMode: GaiaUpdateInstallMode): string {
  if (installMode === 'appimage') {
    return 'AppImage updates are ready for Fedora, Bazzite, Arch, CachyOS, and other Linux desktops.';
  }
  if (installMode === 'package-manager') {
    return 'Package updates are ready for native Linux packages.';
  }
  return 'Gaia updates are ready.';
}

function toGaiaUpdateProgress(progress: ProgressInfo): GaiaUpdateProgress {
  return {
    percent: clampProgress(progress.percent),
    transferred: finiteNumber(progress.transferred),
    total: finiteNumber(progress.total),
    bytesPerSecond: finiteNumber(progress.bytesPerSecond),
  };
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toReleasePageUrl(feedUrl?: string): string | null {
  if (!feedUrl) {
    return null;
  }
  return feedUrl.replace(/\/latest\/download\/?$/u, '/latest').replace(/\/download\/?$/u, '');
}

function readPackagedGaiaMetadata(): { releasePageUrl?: string; updateBaseUrl?: string } {
  try {
    const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
      gaia?: {
        releasePageUrl?: unknown;
        updateBaseUrl?: unknown;
      };
    };
    return {
      releasePageUrl:
        typeof packageJson.gaia?.releasePageUrl === 'string' ? packageJson.gaia.releasePageUrl : undefined,
      updateBaseUrl:
        typeof packageJson.gaia?.updateBaseUrl === 'string' ? packageJson.gaia.updateBaseUrl : undefined,
    };
  } catch {
    return {};
  }
}

function cleanUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}
