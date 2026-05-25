import { contextBridge, ipcRenderer } from 'electron';
import type {
  GaiaAppearanceModePayload,
  GaiaSoundSettings,
  GaiaVideoSettings,
  GaiaVisualEffectsSettings,
} from '../shared.js';

const isWayland =
  process.platform === 'linux' &&
  (Boolean(process.env.WAYLAND_DISPLAY) ||
    process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
    process.env.GAIA_OZONE_PLATFORM === 'wayland' ||
    process.env.ELECTRON_OZONE_PLATFORM === 'wayland' ||
    process.env.ELECTRON_OZONE_PLATFORM_HINT === 'wayland');

contextBridge.exposeInMainWorld('currentDesktop', {
  platform: process.platform,
  isWayland,
  disableNativeEyeDropper: isWayland,
  host: 'gaia-launcher',
  pickColorAtPoint: (point: { x: number; y: number }) => ipcRenderer.invoke('gaia:current:pick-color-at-point', point),
  getAppearanceMode: (): Promise<GaiaAppearanceModePayload> => ipcRenderer.invoke('gaia:appearance-mode:get'),
  onAppearanceModeChange: (callback: (payload: GaiaAppearanceModePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GaiaAppearanceModePayload) => callback(payload);
    ipcRenderer.on('gaia:appearance-mode-changed', listener);
    return () => ipcRenderer.removeListener('gaia:appearance-mode-changed', listener);
  },
  getSoundSettings: (): Promise<GaiaSoundSettings> => ipcRenderer.invoke('gaia:sound-settings:get'),
  onSoundSettingsChange: (callback: (payload: GaiaSoundSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GaiaSoundSettings) => callback(payload);
    ipcRenderer.on('gaia:sound-settings-changed', listener);
    return () => ipcRenderer.removeListener('gaia:sound-settings-changed', listener);
  },
  getVideoSettings: (): Promise<GaiaVideoSettings> => ipcRenderer.invoke('gaia:video-settings:get'),
  onVideoSettingsChange: (callback: (payload: GaiaVideoSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GaiaVideoSettings) => callback(payload);
    ipcRenderer.on('gaia:video-settings-changed', listener);
    return () => ipcRenderer.removeListener('gaia:video-settings-changed', listener);
  },
  getVisualEffectsSettings: (): Promise<GaiaVisualEffectsSettings> =>
    ipcRenderer.invoke('gaia:visual-effects-settings:get'),
  onVisualEffectsSettingsChange: (callback: (payload: GaiaVisualEffectsSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GaiaVisualEffectsSettings) => callback(payload);
    ipcRenderer.on('gaia:visual-effects-settings-changed', listener);
    return () => ipcRenderer.removeListener('gaia:visual-effects-settings-changed', listener);
  },
});
