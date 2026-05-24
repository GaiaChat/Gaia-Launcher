import { contextBridge, ipcRenderer } from 'electron';
import type {
  GaiaAuthResult,
  GaiaBskyConvoForMemberRequest,
  GaiaBskyMessagesRequest,
  GaiaBskyPageRequest,
  GaiaBskyActorSearchRequest,
  GaiaBskyMessageDeleteRequest,
  GaiaBskyReadRequest,
  GaiaBskyReactionRequest,
  GaiaBskySendMessageRequest,
  GaiaGifSearchRequest,
  GaiaNotificationCenterState,
  GaiaClientAuthResult,
  GaiaClientAuthStartRequest,
  GaiaCurrentAppearance,
  GaiaIdentity,
  GaiaOAuthStartRequest,
  GaiaServerInput,
  GaiaSettingsPatch,
  GaiaUpdateState,
} from '../shared.js';

contextBridge.exposeInMainWorld('gaia', {
  getStore: () => ipcRenderer.invoke('gaia:store:get'),
  addServer: (input: GaiaServerInput) => ipcRenderer.invoke('gaia:servers:add', input),
  updateServer: (serverId: string, input: GaiaServerInput) =>
    ipcRenderer.invoke('gaia:servers:update', serverId, input),
  removeServer: (serverId: string) => ipcRenderer.invoke('gaia:servers:remove', serverId),
  selectServer: (serverId: string) => ipcRenderer.invoke('gaia:servers:select', serverId),
  setIdentity: (identity: GaiaIdentity | null) => ipcRenderer.invoke('gaia:identity:set', identity),
  updateSettings: (patch: GaiaSettingsPatch) => ipcRenderer.invoke('gaia:settings:update', patch),
  startOAuth: (request: GaiaOAuthStartRequest) => ipcRenderer.invoke('gaia:oauth:start', request),
  startClientAuth: (request: GaiaClientAuthStartRequest) => ipcRenderer.invoke('gaia:client-auth:start', request),
  getClientAuthStatus: () => ipcRenderer.invoke('gaia:client-auth:status'),
  logoutClientAuth: () => ipcRenderer.invoke('gaia:client-auth:logout'),
  authenticateServerWithClient: (serverUrl: string) => ipcRenderer.invoke('gaia:server:client-auth', serverUrl),
  listBskyConvos: (request: GaiaBskyPageRequest) => ipcRenderer.invoke('gaia:bsky:convos:list', request),
  listBskyMessages: (request: GaiaBskyMessagesRequest) => ipcRenderer.invoke('gaia:bsky:messages:list', request),
  searchBskyActors: (request: GaiaBskyActorSearchRequest) => ipcRenderer.invoke('gaia:bsky:actors:search', request),
  getBskyConvoForMember: (request: GaiaBskyConvoForMemberRequest) =>
    ipcRenderer.invoke('gaia:bsky:convo:for-member', request),
  toggleBskyReaction: (request: GaiaBskyReactionRequest) => ipcRenderer.invoke('gaia:bsky:reaction:toggle', request),
  sendBskyMessage: (request: GaiaBskySendMessageRequest) => ipcRenderer.invoke('gaia:bsky:message:send', request),
  deleteBskyMessageForSelf: (request: GaiaBskyMessageDeleteRequest) =>
    ipcRenderer.invoke('gaia:bsky:message:delete-for-self', request),
  updateBskyRead: (request: GaiaBskyReadRequest) => ipcRenderer.invoke('gaia:bsky:read:update', request),
  searchCurrentGifs: (request: GaiaGifSearchRequest) => ipcRenderer.invoke('gaia:current:gifs:search', request),
  getNotifications: (): Promise<GaiaNotificationCenterState> => ipcRenderer.invoke('gaia:notifications:get'),
  markNotificationsRead: (notificationIds?: string[]) =>
    ipcRenderer.invoke('gaia:notifications:mark-read', notificationIds),
  clearNotifications: () => ipcRenderer.invoke('gaia:notifications:clear'),
  getCurrentAppearance: (serverUrl: string): Promise<GaiaCurrentAppearance> =>
    ipcRenderer.invoke('gaia:current:appearance', serverUrl),
  logoutServer: (serverUrl: string) => ipcRenderer.invoke('gaia:server:logout', serverUrl),
  probeServer: (serverUrl: string) => ipcRenderer.invoke('gaia:server:probe', serverUrl),
  openExternal: (url: string) => ipcRenderer.invoke('gaia:open-external', url),
  getUpdateState: (): Promise<GaiaUpdateState> => ipcRenderer.invoke('gaia:updates:get'),
  checkForUpdates: (): Promise<GaiaUpdateState> => ipcRenderer.invoke('gaia:updates:check'),
  downloadUpdate: (): Promise<GaiaUpdateState> => ipcRenderer.invoke('gaia:updates:download'),
  installUpdate: (): Promise<GaiaUpdateState> => ipcRenderer.invoke('gaia:updates:install'),
  openUpdateDownloads: (): Promise<GaiaUpdateState> => ipcRenderer.invoke('gaia:updates:open-downloads'),
  onAuthResult: (callback: (result: GaiaAuthResult) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: GaiaAuthResult) => callback(result);
    ipcRenderer.on('gaia:auth:result', listener);
    return () => ipcRenderer.removeListener('gaia:auth:result', listener);
  },
  onClientAuthResult: (callback: (result: GaiaClientAuthResult) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: GaiaClientAuthResult) => callback(result);
    ipcRenderer.on('gaia:client-auth:result', listener);
    return () => ipcRenderer.removeListener('gaia:client-auth:result', listener);
  },
  onNotificationsChanged: (callback: (state: GaiaNotificationCenterState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: GaiaNotificationCenterState) => callback(state);
    ipcRenderer.on('gaia:notifications:changed', listener);
    return () => ipcRenderer.removeListener('gaia:notifications:changed', listener);
  },
  onUpdateStateChanged: (callback: (state: GaiaUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: GaiaUpdateState) => callback(state);
    ipcRenderer.on('gaia:updates:changed', listener);
    return () => ipcRenderer.removeListener('gaia:updates:changed', listener);
  },
});
