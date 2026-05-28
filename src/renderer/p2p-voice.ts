import {
  GAIA_P2P_VOICE_DEFAULT_STUN_URLS,
  type GaiaP2PVoiceControlSignal,
  type GaiaP2PVoiceIceCandidate,
  type GaiaP2PVoiceIceConfig,
  type GaiaP2PVoiceSessionDescription,
  type GaiaP2PVoiceSignalMessage,
  type GaiaP2PVoiceSignalType,
  type GaiaP2PVoiceTurnServer,
} from '../shared';

export const P2P_VOICE_DIRECT_FAILURE_MESSAGE =
  'Direct P2P connection failed. This network may require a TURN relay.';

export type P2PVoicePhase =
  | 'idle'
  | 'requesting-media'
  | 'creating-offer'
  | 'waiting-for-answer'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export interface P2PVoiceState {
  phase: P2PVoicePhase;
  status: string;
  localPeerId: string;
  callId?: string;
  roomId: string;
  muted: boolean;
  localStreamActive: boolean;
  remoteStreamActive: boolean;
  usingTurn: boolean;
  signalingMode: 'manual';
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  error?: string;
}

export type P2PVoiceStateListener = (state: P2PVoiceState) => void;
export type P2PVoiceRemoteStreamListener = (stream: MediaStream | null) => void;
export type P2PVoiceSignalListener = (message: GaiaP2PVoiceSignalMessage) => void;

export interface P2PVoiceSignalingTransport {
  readonly mode: 'manual';
  send(message: GaiaP2PVoiceSignalMessage): void;
  subscribe(listener: P2PVoiceSignalListener): () => void;
  close(): void;
}

export class ManualP2PVoiceSignalingTransport implements P2PVoiceSignalingTransport {
  readonly mode = 'manual' as const;

  private readonly listeners = new Set<P2PVoiceSignalListener>();

  constructor(private readonly onOutboundSignal: P2PVoiceSignalListener) {}

  send(message: GaiaP2PVoiceSignalMessage): void {
    this.onOutboundSignal(message);
  }

  receive(message: GaiaP2PVoiceSignalMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  subscribe(listener: P2PVoiceSignalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.listeners.clear();
  }
}

export interface P2PVoiceCallServiceOptions {
  signaling: P2PVoiceSignalingTransport;
  iceConfig?: Partial<GaiaP2PVoiceIceConfig>;
  roomId?: string;
}

export function defaultP2PVoiceIceConfig(): GaiaP2PVoiceIceConfig {
  return {
    stunUrls: [...GAIA_P2P_VOICE_DEFAULT_STUN_URLS],
    turnServers: [],
  };
}

export function buildP2PVoiceIceServers(config: Partial<GaiaP2PVoiceIceConfig> = {}): RTCIceServer[] {
  const stunUrls = config.stunUrls?.length ? config.stunUrls : [...GAIA_P2P_VOICE_DEFAULT_STUN_URLS];
  const iceServers: RTCIceServer[] = stunUrls.map((url) => ({ urls: url }));

  for (const server of config.turnServers ?? []) {
    const urls = turnServerUrls(server);
    if (urls.length === 0) {
      continue;
    }
    const username = server.username?.trim();
    const credential = server.credential?.trim();
    iceServers.push({
      urls,
      ...(username && credential ? { username, credential } : {}),
    });
  }

  return iceServers;
}

export function hasConfiguredTurnServers(config: Partial<GaiaP2PVoiceIceConfig> = {}): boolean {
  return (config.turnServers ?? []).some((server) => turnServerUrls(server).length > 0);
}

export function serializeP2PVoiceSignalMessage(message: GaiaP2PVoiceSignalMessage): string {
  return JSON.stringify(message);
}

export function formatP2PVoiceSignalBundle(messages: GaiaP2PVoiceSignalMessage[]): string {
  return messages.map(serializeP2PVoiceSignalMessage).join('\n');
}

export function parseP2PVoiceSignalText(input: string): {
  messages: GaiaP2PVoiceSignalMessage[];
  errors: string[];
} {
  const text = input.trim();
  if (!text) {
    return { messages: [], errors: ['Paste a peer signal first.'] };
  }

  const candidates = text.startsWith('[')
    ? [text]
    : text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
  const messages: GaiaP2PVoiceSignalMessage[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        const message = coerceP2PVoiceSignalMessage(value);
        if (message) {
          messages.push(message);
        } else {
          errors.push('Signal payload is not a supported Gaia P2P voice message.');
        }
      }
    } catch {
      errors.push('Signal payload is not valid JSON.');
    }
  }

  return { messages, errors };
}

export class P2PVoiceCallService {
  private readonly signaling: P2PVoiceSignalingTransport;
  private readonly stateListeners = new Set<P2PVoiceStateListener>();
  private readonly remoteStreamListeners = new Set<P2PVoiceRemoteStreamListener>();
  private readonly signalingUnsubscribe: () => void;
  private iceConfig: GaiaP2PVoiceIceConfig;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private connectionTimer: number | undefined;
  private destroyed = false;
  private state: P2PVoiceState;

  constructor(options: P2PVoiceCallServiceOptions) {
    this.signaling = options.signaling;
    this.iceConfig = {
      ...defaultP2PVoiceIceConfig(),
      ...options.iceConfig,
      stunUrls: options.iceConfig?.stunUrls?.length
        ? [...options.iceConfig.stunUrls]
        : [...GAIA_P2P_VOICE_DEFAULT_STUN_URLS],
      turnServers: [...(options.iceConfig?.turnServers ?? [])],
    };
    this.state = {
      phase: 'idle',
      status: 'Ready for a direct P2P voice call.',
      localPeerId: createVoiceId('peer'),
      roomId: options.roomId ?? 'manual-p2p-voice',
      muted: false,
      localStreamActive: false,
      remoteStreamActive: false,
      usingTurn: hasConfiguredTurnServers(this.iceConfig),
      signalingMode: this.signaling.mode,
    };
    this.signalingUnsubscribe = this.signaling.subscribe((message) => {
      void this.receiveSignal(message);
    });
  }

  getState(): P2PVoiceState {
    return { ...this.state };
  }

  setIceConfig(config: Partial<GaiaP2PVoiceIceConfig>): void {
    if (this.peerConnection) {
      return;
    }
    this.iceConfig = {
      ...defaultP2PVoiceIceConfig(),
      ...config,
      stunUrls: config.stunUrls?.length ? [...config.stunUrls] : [...GAIA_P2P_VOICE_DEFAULT_STUN_URLS],
      turnServers: [...(config.turnServers ?? [])],
    };
    this.updateState({ usingTurn: hasConfiguredTurnServers(this.iceConfig) });
  }

  subscribe(listener: P2PVoiceStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onRemoteStream(listener: P2PVoiceRemoteStreamListener): () => void {
    this.remoteStreamListeners.add(listener);
    listener(this.remoteStream);
    return () => {
      this.remoteStreamListeners.delete(listener);
    };
  }

  async joinVoice(): Promise<void> {
    this.assertUsable();
    if (this.peerConnection || this.localStream) {
      return;
    }

    const callId = createVoiceId('call');
    this.updateState({
      phase: 'requesting-media',
      status: 'Requesting microphone access.',
      callId,
      error: undefined,
      muted: false,
    });

    try {
      await this.ensureLocalStream();
      const peerConnection = this.createPeerConnection();
      this.sendControlSignal('join-call');

      this.updateState({ phase: 'creating-offer', status: 'Creating a WebRTC offer.' });
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.sendSignal({
        type: 'offer',
        description: {
          type: 'offer',
          sdp: peerConnection.localDescription?.sdp ?? offer.sdp ?? '',
        },
      });
      this.startConnectionTimer();
      this.updateState({ phase: 'waiting-for-answer', status: 'Waiting for peer answer.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start P2P voice.';
      this.fail(message);
      throw error;
    }
  }

  async receiveSignal(message: GaiaP2PVoiceSignalMessage): Promise<void> {
    this.assertUsable();
    if (message.senderId === this.state.localPeerId) {
      return;
    }

    if (!this.state.callId || this.state.phase === 'idle' || this.state.phase === 'ended' || this.state.phase === 'failed') {
      this.updateState({ callId: message.callId, roomId: message.roomId, error: undefined });
    }
    if (message.callId !== this.state.callId) {
      this.updateState({ error: 'Ignored a signal from another call.' });
      return;
    }

    try {
      if (message.type === 'join-call') {
        this.updateState({ status: 'Peer joined the manual signaling room.' });
        return;
      }
      if (message.type === 'leave-call' || message.type === 'call-ended' || message.type === 'call-rejected') {
        this.cleanup({ stopLocalTracks: true });
        this.updateState({
          phase: message.type === 'call-rejected' ? 'ended' : 'idle',
          status: controlSignalStatus(message),
          callId: undefined,
          error: message.type === 'call-rejected' ? message.reason ?? 'Call rejected.' : undefined,
        });
        return;
      }
      if (message.type === 'ice-candidate') {
        await this.addRemoteIceCandidate(message.candidate);
        return;
      }
      if (message.type === 'offer') {
        await this.acceptOffer(message.description);
        return;
      }
      if (message.type === 'answer') {
        await this.acceptAnswer(message.description);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : P2P_VOICE_DIRECT_FAILURE_MESSAGE);
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.localStream) {
      return;
    }
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
    this.updateState({
      muted,
      status: muted ? 'Microphone muted.' : 'Microphone unmuted.',
    });
  }

  leaveVoice(): void {
    if (this.state.callId && this.state.phase !== 'idle') {
      this.sendControlSignal('leave-call', 'Left voice.');
    }
    this.cleanup({ stopLocalTracks: true });
    this.updateState({
      phase: 'idle',
      status: 'Left voice.',
      callId: undefined,
      error: undefined,
      muted: false,
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    if (this.state.callId && this.state.phase !== 'idle') {
      this.sendControlSignal('call-ended', 'Launcher closed.');
    }
    this.destroyed = true;
    this.cleanup({ stopLocalTracks: true });
    this.signalingUnsubscribe();
    this.signaling.close();
    this.stateListeners.clear();
    this.remoteStreamListeners.clear();
  }

  private async acceptOffer(description: { type: 'offer' | 'answer'; sdp: string }): Promise<void> {
    if (description.type !== 'offer' || !description.sdp) {
      throw new Error('Peer offer is missing SDP.');
    }

    if (this.peerConnection?.signalingState === 'have-local-offer') {
      throw new Error('Both peers created offers. Leave voice, then have only one peer join first.');
    }

    this.updateState({
      phase: 'requesting-media',
      status: 'Incoming offer received. Requesting microphone access.',
      error: undefined,
    });
    await this.ensureLocalStream();
    const peerConnection = this.peerConnection ?? this.createPeerConnection();
    await peerConnection.setRemoteDescription({ type: 'offer', sdp: description.sdp });
    await this.flushRemoteIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    this.sendSignal({
      type: 'answer',
      description: {
        type: 'answer',
        sdp: peerConnection.localDescription?.sdp ?? answer.sdp ?? '',
      },
    });
    this.startConnectionTimer();
    this.updateState({ phase: 'connecting', status: 'Answer sent. Connecting directly to peer.' });
  }

  private async acceptAnswer(description: { type: 'offer' | 'answer'; sdp: string }): Promise<void> {
    if (description.type !== 'answer' || !description.sdp) {
      throw new Error('Peer answer is missing SDP.');
    }
    if (!this.peerConnection) {
      throw new Error('Received an answer before creating a call.');
    }
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: description.sdp });
    await this.flushRemoteIceCandidates();
    this.startConnectionTimer();
    this.updateState({ phase: 'connecting', status: 'Answer received. Connecting directly to peer.' });
  }

  private async ensureLocalStream(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream = stream;
    if (this.peerConnection) {
      for (const track of stream.getAudioTracks()) {
        this.peerConnection.addTrack(track, stream);
      }
    }
    this.updateState({
      localStreamActive: true,
      muted: false,
      status: 'Microphone ready.',
    });
    return stream;
  }

  private createPeerConnection(): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection({
      iceServers: buildP2PVoiceIceServers(this.iceConfig),
    });
    this.peerConnection = peerConnection;
    this.remoteStream = new MediaStream();
    this.emitRemoteStream();

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        peerConnection.addTrack(track, this.localStream);
      }
    }

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      this.sendSignal({
        type: 'ice-candidate',
        candidate: serializeIceCandidate(event.candidate),
      });
    };
    peerConnection.ontrack = (event) => {
      const remoteStream = this.remoteStream ?? new MediaStream();
      this.remoteStream = remoteStream;
      const streams = event.streams.filter(Boolean);
      if (streams[0]) {
        for (const track of streams[0].getTracks()) {
          if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
      } else if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      this.updateState({ remoteStreamActive: remoteStream.getAudioTracks().length > 0 });
      this.emitRemoteStream();
    };
    peerConnection.onconnectionstatechange = () => this.handleConnectionStateChange();
    peerConnection.oniceconnectionstatechange = () => this.handleConnectionStateChange();
    this.updateState({
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
    });
    return peerConnection;
  }

  private async addRemoteIceCandidate(candidate: GaiaP2PVoiceIceCandidate): Promise<void> {
    const candidateInit: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      usernameFragment: candidate.usernameFragment ?? undefined,
    };
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingRemoteCandidates.push(candidateInit);
      this.updateState({ status: 'Queued peer ICE candidate.' });
      return;
    }
    await this.peerConnection.addIceCandidate(candidateInit);
    this.updateState({ status: 'Peer ICE candidate added.' });
  }

  private async flushRemoteIceCandidates(): Promise<void> {
    if (!this.peerConnection?.remoteDescription || this.pendingRemoteCandidates.length === 0) {
      return;
    }
    const candidates = this.pendingRemoteCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
  }

  private handleConnectionStateChange(): void {
    const peerConnection = this.peerConnection;
    if (!peerConnection) {
      return;
    }
    const connectionState = peerConnection.connectionState;
    const iceConnectionState = peerConnection.iceConnectionState;
    if (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') {
      this.clearConnectionTimer();
      this.updateState({
        phase: 'connected',
        status: this.state.usingTurn
          ? 'Connected. Direct P2P is active with optional TURN config available.'
          : 'Connected over direct P2P using STUN-only ICE.',
        connectionState,
        iceConnectionState,
        error: undefined,
      });
      return;
    }

    if (connectionState === 'failed' || iceConnectionState === 'failed') {
      this.fail(P2P_VOICE_DIRECT_FAILURE_MESSAGE);
      return;
    }

    if (connectionState === 'disconnected' || iceConnectionState === 'disconnected') {
      this.updateState({
        phase: 'reconnecting',
        status: 'Connection interrupted. Trying to reconnect directly.',
        connectionState,
        iceConnectionState,
      });
      this.startConnectionTimer(12_000);
      return;
    }

    this.updateState({
      connectionState,
      iceConnectionState,
    });
  }

  private startConnectionTimer(timeoutMs = 30_000): void {
    this.clearConnectionTimer();
    this.connectionTimer = window.setTimeout(() => {
      if (this.state.phase === 'connected' || this.state.phase === 'idle') {
        return;
      }
      this.fail(P2P_VOICE_DIRECT_FAILURE_MESSAGE);
    }, timeoutMs);
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      window.clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }
  }

  private fail(message: string): void {
    this.cleanup({ stopLocalTracks: true });
    this.updateState({
      phase: 'failed',
      status: message,
      error: message,
      muted: false,
    });
  }

  private cleanup(options: { stopLocalTracks: boolean }): void {
    this.clearConnectionTimer();
    this.pendingRemoteCandidates = [];
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (options.stopLocalTracks && this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        track.stop();
      }
      this.remoteStream = null;
      this.emitRemoteStream();
    }
    this.updateState({
      localStreamActive: Boolean(this.localStream),
      remoteStreamActive: false,
      connectionState: undefined,
      iceConnectionState: undefined,
    });
  }

  private sendControlSignal(type: GaiaP2PVoiceControlSignal['type'], reason?: string): void {
    this.sendSignal({ type, reason });
  }

  private sendSignal(message: {
    type: GaiaP2PVoiceSignalType;
    description?: GaiaP2PVoiceSessionDescription;
    candidate?: GaiaP2PVoiceIceCandidate;
    reason?: string;
  }): void {
    if (!this.state.callId) {
      return;
    }
    const envelope = {
      version: 1,
      callId: this.state.callId,
      roomId: this.state.roomId,
      senderId: this.state.localPeerId,
      createdAt: new Date().toISOString(),
      ...message,
    } as GaiaP2PVoiceSignalMessage;
    this.signaling.send(envelope);
  }

  private updateState(patch: Partial<P2PVoiceState>): void {
    this.state = {
      ...this.state,
      ...patch,
      usingTurn: patch.usingTurn ?? hasConfiguredTurnServers(this.iceConfig),
      signalingMode: this.signaling.mode,
    };
    const snapshot = this.getState();
    for (const listener of this.stateListeners) {
      listener(snapshot);
    }
  }

  private emitRemoteStream(): void {
    for (const listener of this.remoteStreamListeners) {
      listener(this.remoteStream);
    }
  }

  private assertUsable(): void {
    if (this.destroyed) {
      throw new Error('P2P voice service is closed.');
    }
  }
}

function turnServerUrls(server: GaiaP2PVoiceTurnServer): string[] {
  return [server.turnUrl, server.turnsUrl]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));
}

function createVoiceId(prefix: string): string {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function serializeIceCandidate(candidate: RTCIceCandidate): GaiaP2PVoiceIceCandidate {
  const json = candidate.toJSON();
  return {
    candidate: json.candidate ?? '',
    sdpMid: json.sdpMid ?? null,
    sdpMLineIndex: json.sdpMLineIndex ?? null,
    usernameFragment: json.usernameFragment ?? null,
  };
}

function coerceP2PVoiceSignalMessage(value: unknown): GaiaP2PVoiceSignalMessage | null {
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
    const description = coerceSessionDescription(record.description, record.type);
    return description ? { ...base, type: record.type, description } : null;
  }
  if (record.type === 'ice-candidate') {
    const candidate = coerceIceCandidate(record.candidate);
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

function coerceSessionDescription(value: unknown, expectedType: 'offer' | 'answer') {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.type === expectedType && typeof record.sdp === 'string'
    ? { type: expectedType, sdp: record.sdp }
    : null;
}

function coerceIceCandidate(value: unknown): GaiaP2PVoiceIceCandidate | null {
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
    sdpMLineIndex: typeof record.sdpMLineIndex === 'number' || record.sdpMLineIndex === null
      ? record.sdpMLineIndex
      : undefined,
    usernameFragment:
      typeof record.usernameFragment === 'string' || record.usernameFragment === null
        ? record.usernameFragment
        : undefined,
  };
}

function controlSignalStatus(message: GaiaP2PVoiceControlSignal): string {
  if (message.reason) {
    return message.reason;
  }
  if (message.type === 'call-rejected') {
    return 'Call rejected.';
  }
  if (message.type === 'call-ended') {
    return 'Call ended.';
  }
  return 'Peer left voice.';
}
