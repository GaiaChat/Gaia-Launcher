import type {
  GaiaIdentity,
  GaiaAuthResult,
  GaiaBskyActor,
  GaiaBskyActorSearchRequest,
  GaiaBskyCallKey,
  GaiaBskyCallSignalPage,
  GaiaBskyConvo,
  GaiaBskyConvoForMemberRequest,
  GaiaBskyConvoPage,
  GaiaBskyDeleteCallSignalsRequest,
  GaiaBskyDeletedMessage,
  GaiaBskyListCallSignalsRequest,
  GaiaBskyMessage,
  GaiaBskyMessageDeleteRequest,
  GaiaBskyMessagePage,
  GaiaBskyMessagesRequest,
  GaiaBskyPageRequest,
  GaiaBskyPublishCallSignalRequest,
  GaiaBskyPublishCallSignalResponse,
  GaiaBskyReadRequest,
  GaiaBskyReactionRequest,
  GaiaBskySendMessageRequest,
  GaiaGifSearchRequest,
  GaiaGifSearchResponse,
  GaiaNotificationCenterState,
  GaiaClientAuthResult,
  GaiaClientAuthStartRequest,
  GaiaClientAuthStartResponse,
  GaiaClientAuthStatus,
  GaiaCurrentAppearance,
  GaiaLogoutResult,
  GaiaOAuthStartRequest,
  GaiaOAuthStartResponse,
  GaiaServerClientAuthResult,
  GaiaServerInput,
  GaiaServerNotificationSettingsPatch,
  GaiaServerProbe,
  GaiaSpotifyAuthStartResponse,
  GaiaSpotifySharingPatch,
  GaiaSpotifyStatus,
  GaiaSettingsPatch,
  GaiaStore,
  GaiaUpdateState,
} from '../shared';

declare global {
  interface Window {
    gaia: {
      getStore(): Promise<GaiaStore>;
      addServer(input: GaiaServerInput): Promise<GaiaStore>;
      updateServer(serverId: string, input: GaiaServerInput): Promise<GaiaStore>;
      updateServerNotificationSettings(
        serverId: string,
        patch: GaiaServerNotificationSettingsPatch,
      ): Promise<GaiaStore>;
      removeServer(serverId: string): Promise<GaiaStore>;
      selectServer(serverId: string): Promise<GaiaStore>;
      setIdentity(identity: GaiaIdentity | null): Promise<GaiaStore>;
      updateSettings(patch: GaiaSettingsPatch): Promise<GaiaStore>;
      startOAuth(request: GaiaOAuthStartRequest): Promise<GaiaOAuthStartResponse>;
      startClientAuth(request: GaiaClientAuthStartRequest): Promise<GaiaClientAuthStartResponse>;
      getClientAuthStatus(): Promise<GaiaClientAuthStatus>;
      logoutClientAuth(): Promise<GaiaLogoutResult>;
      authenticateServerWithClient(serverUrl: string): Promise<GaiaServerClientAuthResult>;
      getSpotifyStatus(): Promise<GaiaSpotifyStatus>;
      startSpotifyAuth(): Promise<GaiaSpotifyAuthStartResponse>;
      updateSpotifySharing(patch: GaiaSpotifySharingPatch): Promise<GaiaSpotifyStatus>;
      logoutSpotify(): Promise<GaiaSpotifyStatus>;
      listBskyConvos(request: GaiaBskyPageRequest): Promise<GaiaBskyConvoPage>;
      listBskyMessages(request: GaiaBskyMessagesRequest): Promise<GaiaBskyMessagePage>;
      searchBskyActors(request: GaiaBskyActorSearchRequest): Promise<GaiaBskyActor[]>;
      getBskyConvoForMember(request: GaiaBskyConvoForMemberRequest): Promise<GaiaBskyConvo>;
      toggleBskyReaction(request: GaiaBskyReactionRequest): Promise<GaiaBskyMessage>;
      sendBskyMessage(request: GaiaBskySendMessageRequest): Promise<GaiaBskyMessage>;
      deleteBskyMessageForSelf(request: GaiaBskyMessageDeleteRequest): Promise<GaiaBskyDeletedMessage>;
      updateBskyRead(request: GaiaBskyReadRequest): Promise<GaiaBskyConvo>;
      ensureBskyCallKey(): Promise<GaiaBskyCallKey>;
      publishBskyCallSignal(request: GaiaBskyPublishCallSignalRequest): Promise<GaiaBskyPublishCallSignalResponse>;
      listBskyCallSignals(request: GaiaBskyListCallSignalsRequest): Promise<GaiaBskyCallSignalPage>;
      deleteBskyCallSignals(request: GaiaBskyDeleteCallSignalsRequest): Promise<{ deleted: number }>;
      searchCurrentGifs(request: GaiaGifSearchRequest): Promise<GaiaGifSearchResponse>;
      getNotifications(): Promise<GaiaNotificationCenterState>;
      markNotificationsRead(notificationIds?: string[]): Promise<GaiaNotificationCenterState>;
      clearNotifications(): Promise<GaiaNotificationCenterState>;
      getCurrentAppearance(serverUrl: string): Promise<GaiaCurrentAppearance>;
      logoutServer(serverUrl: string): Promise<GaiaLogoutResult>;
      probeServer(serverUrl: string): Promise<GaiaServerProbe>;
      openExternal(url: string): Promise<void>;
      getUpdateState(): Promise<GaiaUpdateState>;
      checkForUpdates(): Promise<GaiaUpdateState>;
      downloadUpdate(): Promise<GaiaUpdateState>;
      installUpdate(): Promise<GaiaUpdateState>;
      openUpdateDownloads(): Promise<GaiaUpdateState>;
      onAuthResult(callback: (result: GaiaAuthResult) => void): () => void;
      onClientAuthResult(callback: (result: GaiaClientAuthResult) => void): () => void;
      onSpotifyChanged(callback: (status: GaiaSpotifyStatus) => void): () => void;
      onNotificationsChanged(callback: (state: GaiaNotificationCenterState) => void): () => void;
      onUpdateStateChanged(callback: (state: GaiaUpdateState) => void): () => void;
    };
  }
}

export {};
