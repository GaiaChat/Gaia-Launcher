import { contextBridge, ipcRenderer } from 'electron';
import type { GaiaAppearanceModePayload, GaiaSoundSettings } from '../shared.js';

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
});
