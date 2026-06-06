import {
  GAIA_P2P_VOICE_DEFAULT_STUN_URLS,
  coerceGaiaP2PVoiceSignalMessage,
  type GaiaBskyCallSignal,
  type GaiaBskyMessage,
  type GaiaP2PVoiceControlSignal,
  type GaiaP2PVoiceIceCandidate,
  type GaiaP2PVoiceIceConfig,
  type GaiaP2PVoiceSessionDescription,
  type GaiaP2PVoiceSignalMessage,
  type GaiaP2PVoiceSignalType,
  type GaiaP2PVoiceTurnServer,
} from '../shared';

export const P2P_VOICE_DIRECT_FAILURE_MESSAGE =
  'Call could not connect. Try again, or add relay settings if this keeps happening.';
const BSKY_VOICE_SIGNAL_TEXT_PREFIX = 'Gaia voice call signal: ';
const BSKY_VOICE_SIGNAL_TOKEN_PREFIX = 'gaia-call:v1:';
const BSKY_VOICE_SIGNAL_CHUNK_TOKEN_PREFIX = 'gaia-call:v1c:';
const BSKY_VOICE_SIGNAL_APP = 'gaia-launcher';
const BSKY_VOICE_SIGNAL_KIND = 'p2p-voice-signal';
const BSKY_VOICE_SIGNAL_DEFAULT_POLL_MS = 1_500;
const BSKY_VOICE_SIGNAL_DEFAULT_DEBOUNCE_MS = 350;
const BSKY_VOICE_SIGNAL_DEFAULT_LIMIT = 50;
const BSKY_VOICE_SIGNAL_SEEN_LIMIT = 400;
const BSKY_VOICE_SIGNAL_MAX_TEXT_GRAPHEMES = 950;
const BSKY_VOICE_SIGNAL_MAX_CHUNKS = 200;
const BSKY_VOICE_SIGNAL_CHUNK_TTL_MS = 5 * 60_000;
const BSKY_VOICE_SIGNAL_CHUNK_GROUP_LIMIT = 80;
const BSKY_VOICE_SIGNAL_CLEANUP_LIMIT = 600;

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
  localScreenShareActive: boolean;
  remoteScreenShareActive: boolean;
  usingTurn: boolean;
  signalingMode: P2PVoiceSignalingMode;
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  error?: string;
}

export type P2PVoiceSignalingMode = 'manual' | 'bsky-dm' | 'atproto-record';
export type P2PVoiceStateListener = (state: P2PVoiceState) => void;
export type P2PVoiceRemoteStreamListener = (stream: MediaStream | null) => void;
export type P2PVoiceLocalScreenStreamListener = (stream: MediaStream | null) => void;
export interface P2PVoiceSignalSource {
  convoId?: string;
  messageId?: string;
  recordKey?: string;
  senderDid?: string;
  sentAt?: string;
}
export type P2PVoiceSignalListener = (
  message: GaiaP2PVoiceSignalMessage,
  source?: P2PVoiceSignalSource,
) => void;

export interface P2PVoiceSignalingTransport {
  readonly mode: P2PVoiceSignalingMode;
  send(message: GaiaP2PVoiceSignalMessage): void | Promise<void>;
  subscribe(listener: P2PVoiceSignalListener): () => void;
  cleanupCall?(callId: string): void | Promise<void>;
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

export interface AtprotoRecordP2PVoiceSignalingTransportOptions {
  convoId: string;
  peerDid: string;
  pollIntervalMs?: number;
  messageLimit?: number;
  processExistingSignals?: boolean;
  ignoreSignalsBefore?: number;
  seenRecordKeys?: string[];
  onError?: (error: Error) => void;
}

export class AtprotoRecordP2PVoiceSignalingTransport implements P2PVoiceSignalingTransport {
  readonly mode = 'atproto-record' as const;

  private readonly convoId: string;
  private readonly peerDid: string;
  private readonly pollIntervalMs: number;
  private readonly messageLimit: number;
  private readonly processExistingSignals: boolean;
  private readonly ignoreSignalsBefore: number;
  private readonly onError?: (error: Error) => void;
  private readonly listeners = new Set<P2PVoiceSignalListener>();
  private readonly seenRecordKeys = new Set<string>();
  private readonly seenRecordOrder: string[] = [];
  private readonly publishedRecordKeysByCallId = new Map<string, Set<string>>();
  private pollTimer: number | undefined;
  private pollInFlight = false;
  private initialized = false;
  private closed = false;

  constructor(options: AtprotoRecordP2PVoiceSignalingTransportOptions) {
    const convoId = options.convoId.trim();
    const peerDid = options.peerDid.trim();
    if (!convoId || !peerDid) {
      throw new Error('Conversation and peer DID are required for Gaia Call records.');
    }
    this.convoId = convoId;
    this.peerDid = peerDid;
    this.pollIntervalMs = Math.max(1_000, options.pollIntervalMs ?? BSKY_VOICE_SIGNAL_DEFAULT_POLL_MS);
    this.messageLimit = Math.max(10, Math.min(100, options.messageLimit ?? BSKY_VOICE_SIGNAL_DEFAULT_LIMIT));
    this.processExistingSignals = options.processExistingSignals ?? false;
    this.ignoreSignalsBefore = options.ignoreSignalsBefore ?? 0;
    this.onError = options.onError;
    for (const recordKey of options.seenRecordKeys ?? []) {
      this.rememberSeenRecord(recordKey);
    }
    void window.gaia.ensureBskyCallKey().catch((error) => {
      this.reportError(normalizeP2PVoiceError(error, 'Could not prepare Gaia Call keys.'));
    });
    window.setTimeout(() => {
      void this.pollOnce();
    }, 0);
    this.pollTimer = window.setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  async send(message: GaiaP2PVoiceSignalMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Gaia Call record signaling is closed.');
    }
    try {
      const response = await window.gaia.publishBskyCallSignal({
        peerDid: this.peerDid,
        convoId: this.convoId,
        signal: message,
      });
      this.rememberPublishedRecord(message.callId, response.rkey);
    } catch (error) {
      const normalized = normalizeP2PVoiceError(error, 'Could not publish Gaia Call signal.');
      this.reportError(normalized);
      throw normalized;
    }
  }

  subscribe(listener: P2PVoiceSignalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async cleanupCall(callId: string): Promise<void> {
    const rkeys = Array.from(this.publishedRecordKeysByCallId.get(callId) ?? []);
    if (rkeys.length === 0) {
      return;
    }
    this.publishedRecordKeysByCallId.delete(callId);
    try {
      await window.gaia.deleteBskyCallSignals({ rkeys });
    } catch (error) {
      this.reportError(normalizeP2PVoiceError(error, 'Could not clean up Gaia Call records.'));
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.listeners.clear();
    this.seenRecordKeys.clear();
    this.seenRecordOrder.length = 0;
    this.publishedRecordKeysByCallId.clear();
  }

  private async pollOnce(): Promise<void> {
    if (this.closed || this.pollInFlight) {
      return;
    }
    this.pollInFlight = true;
    const firstPoll = !this.initialized;
    try {
      const page = await window.gaia.listBskyCallSignals({
        peerDid: this.peerDid,
        convoId: this.convoId,
        limit: this.messageLimit,
        ignoreBefore: this.ignoreSignalsBefore > 0 ? new Date(this.ignoreSignalsBefore).toISOString() : undefined,
      });
      for (const item of page.signals) {
        this.processCallSignal(item, firstPoll);
      }
      this.initialized = true;
    } catch (error) {
      this.reportError(normalizeP2PVoiceError(error, 'Could not poll Gaia Call records.'));
    } finally {
      this.pollInFlight = false;
    }
  }

  private processCallSignal(item: GaiaBskyCallSignal, firstPoll: boolean): void {
    const recordKey = item.source.rkey;
    if (!recordKey || this.seenRecordKeys.has(recordKey)) {
      return;
    }
    this.rememberSeenRecord(recordKey);
    if (firstPoll && !this.processExistingSignals) {
      return;
    }
    const sentAt = Date.parse(item.source.createdAt);
    const createdAt = Date.parse(item.signal.createdAt);
    const signalTime = Number.isFinite(createdAt)
      ? createdAt
      : Number.isFinite(sentAt)
        ? sentAt
        : 0;
    if (this.ignoreSignalsBefore > 0 && signalTime < this.ignoreSignalsBefore) {
      return;
    }
    for (const listener of this.listeners) {
      listener(item.signal, {
        convoId: this.convoId,
        recordKey,
        senderDid: item.senderDid,
        sentAt: item.source.createdAt,
      });
    }
  }

  private rememberPublishedRecord(callId: string, rkey: string): void {
    const existing = this.publishedRecordKeysByCallId.get(callId) ?? new Set<string>();
    existing.add(rkey);
    this.publishedRecordKeysByCallId.set(callId, existing);
  }

  private rememberSeenRecord(recordKey: string): void {
    this.seenRecordKeys.add(recordKey);
    this.seenRecordOrder.push(recordKey);
    while (this.seenRecordOrder.length > BSKY_VOICE_SIGNAL_SEEN_LIMIT) {
      const expired = this.seenRecordOrder.shift();
      if (expired) {
        this.seenRecordKeys.delete(expired);
      }
    }
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }
}

export interface BskyDmP2PVoiceSignalingTransportOptions {
  convoId: string;
  localDid?: string;
  pollIntervalMs?: number;
  sendDebounceMs?: number;
  messageLimit?: number;
  processExistingMessages?: boolean;
  ignoreSignalsBefore?: number;
  seenMessageIds?: string[];
  cleanupSignalMessages?: boolean;
  onError?: (error: Error) => void;
}

interface PendingBskyVoiceSignal {
  message: GaiaP2PVoiceSignalMessage;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface BskyVoiceSignalPayloadChunk {
  id: string;
  index: number;
  total: number;
  data: string;
}

interface IncomingBskyVoiceSignalChunkGroup {
  total: number;
  chunks: Map<number, string>;
  firstSeenAt: number;
  updatedAt: number;
}

export class BskyDmP2PVoiceSignalingTransport implements P2PVoiceSignalingTransport {
  readonly mode = 'bsky-dm' as const;

  private readonly convoId: string;
  private readonly localDid?: string;
  private readonly pollIntervalMs: number;
  private readonly sendDebounceMs: number;
  private readonly messageLimit: number;
  private readonly processExistingMessages: boolean;
  private readonly ignoreSignalsBefore: number;
  private readonly cleanupSignalMessages: boolean;
  private readonly onError?: (error: Error) => void;
  private readonly listeners = new Set<P2PVoiceSignalListener>();
  private readonly seenMessageIds = new Set<string>();
  private readonly seenMessageOrder: string[] = [];
  private readonly cleanupMessageIds = new Set<string>();
  private readonly cleanupMessageOrder: string[] = [];
  private readonly incomingChunkGroups = new Map<string, IncomingBskyVoiceSignalChunkGroup>();
  private outboundQueue: PendingBskyVoiceSignal[] = [];
  private pollTimer: number | undefined;
  private flushTimer: number | undefined;
  private pollInFlight = false;
  private initialized = false;
  private closed = false;

  constructor(options: BskyDmP2PVoiceSignalingTransportOptions) {
    const convoId = options.convoId.trim();
    if (!convoId) {
      throw new Error('Conversation id is required for Bluesky DM voice signaling.');
    }
    this.convoId = convoId;
    this.localDid = options.localDid?.trim() || undefined;
    this.pollIntervalMs = Math.max(1_000, options.pollIntervalMs ?? BSKY_VOICE_SIGNAL_DEFAULT_POLL_MS);
    this.sendDebounceMs = Math.max(150, options.sendDebounceMs ?? BSKY_VOICE_SIGNAL_DEFAULT_DEBOUNCE_MS);
    this.messageLimit = Math.max(10, Math.min(100, options.messageLimit ?? BSKY_VOICE_SIGNAL_DEFAULT_LIMIT));
    this.processExistingMessages = options.processExistingMessages ?? false;
    this.ignoreSignalsBefore = options.ignoreSignalsBefore ?? 0;
    this.cleanupSignalMessages = options.cleanupSignalMessages ?? true;
    this.onError = options.onError;
    for (const messageId of options.seenMessageIds ?? []) {
      this.rememberSeenMessage(messageId);
    }
    window.setTimeout(() => {
      void this.pollOnce();
    }, 0);
    this.pollTimer = window.setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  send(message: GaiaP2PVoiceSignalMessage): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('Bluesky DM voice signaling is closed.'));
    }
    return new Promise((resolve, reject) => {
      this.outboundQueue.push({ message, resolve, reject });
      if (shouldFlushBskyVoiceSignalImmediately(message)) {
        this.clearFlushTimer();
        void this.flushOutboundSignals();
        return;
      }
      this.scheduleFlush();
    });
  }

  subscribe(listener: P2PVoiceSignalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.clearFlushTimer();
    const error = new Error('Bluesky DM voice signaling is closed.');
    for (const item of this.outboundQueue.splice(0)) {
      item.reject(error);
    }
    this.listeners.clear();
    this.seenMessageIds.clear();
    this.seenMessageOrder.length = 0;
    this.cleanupMessageIds.clear();
    this.cleanupMessageOrder.length = 0;
    this.incomingChunkGroups.clear();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.closed) {
      return;
    }
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined;
      void this.flushOutboundSignals();
    }, this.sendDebounceMs);
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) {
      return;
    }
    window.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }

  private async flushOutboundSignals(): Promise<void> {
    if (this.closed || this.outboundQueue.length === 0) {
      return;
    }
    const batch = this.outboundQueue.splice(0);
    for (const item of batch) {
      try {
        for (const text of encodeBskyVoiceSignalPayloadSegments([item.message])) {
          const sentMessage = await window.gaia.sendBskyMessage({ convoId: this.convoId, text });
          this.deleteSignalMessageForSelf(sentMessage.id);
        }
        item.resolve();
      } catch (error) {
        const normalized = normalizeP2PVoiceError(error, 'Could not send Bluesky DM voice signal.');
        item.reject(normalized);
        this.reportError(normalized);
      }
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.closed || this.pollInFlight) {
      return;
    }
    this.pollInFlight = true;
    const firstPoll = !this.initialized;
    try {
      const page = await window.gaia.listBskyMessages({
        convoId: this.convoId,
        limit: this.messageLimit,
      });
      const orderedMessages = [...page.messages].sort((left, right) => {
        return Date.parse(left.sentAt) - Date.parse(right.sentAt);
      });
      for (const message of orderedMessages) {
        if (this.seenMessageIds.has(message.id)) {
          continue;
        }
        this.rememberSeenMessage(message.id);
        if (isBskyVoiceSignalPayloadText(message.text)) {
          this.deleteSignalMessageForSelf(message.id);
        }
        if (firstPoll && !this.processExistingMessages) {
          continue;
        }
        this.processBskyMessage(message);
      }
      this.initialized = true;
    } catch (error) {
      this.reportError(normalizeP2PVoiceError(error, 'Could not poll Bluesky DM voice signals.'));
    } finally {
      this.pollInFlight = false;
    }
  }

  private processBskyMessage(message: GaiaBskyMessage): void {
    if (isBskyVoiceSignalPayloadText(message.text)) {
      this.deleteSignalMessageForSelf(message.id);
    }
    if (this.localDid && message.senderDid === this.localDid) {
      return;
    }
    const decodedMessages = this.decodeBskyVoiceSignalPayload(message);
    if (decodedMessages.length === 0) {
      return;
    }
    const sentAt = Date.parse(message.sentAt);
    for (const signal of decodedMessages) {
      const createdAt = Date.parse(signal.createdAt);
      const signalTime = Number.isFinite(createdAt)
        ? createdAt
        : Number.isFinite(sentAt)
          ? sentAt
          : 0;
      if (this.ignoreSignalsBefore > 0 && signalTime < this.ignoreSignalsBefore) {
        continue;
      }
      for (const listener of this.listeners) {
        listener(signal, {
          convoId: this.convoId,
          messageId: message.id,
          senderDid: message.senderDid,
          sentAt: message.sentAt,
        });
      }
    }
  }

  private rememberSeenMessage(messageId: string): void {
    this.seenMessageIds.add(messageId);
    this.seenMessageOrder.push(messageId);
    while (this.seenMessageOrder.length > BSKY_VOICE_SIGNAL_SEEN_LIMIT) {
      const expired = this.seenMessageOrder.shift();
      if (expired) {
        this.seenMessageIds.delete(expired);
      }
    }
  }

  private deleteSignalMessageForSelf(messageId: string): void {
    if (!this.cleanupSignalMessages || this.closed || this.cleanupMessageIds.has(messageId)) {
      return;
    }
    this.cleanupMessageIds.add(messageId);
    this.cleanupMessageOrder.push(messageId);
    while (this.cleanupMessageOrder.length > BSKY_VOICE_SIGNAL_CLEANUP_LIMIT) {
      const expired = this.cleanupMessageOrder.shift();
      if (expired) {
        this.cleanupMessageIds.delete(expired);
      }
    }
    void window.gaia
      .deleteBskyMessageForSelf({
        convoId: this.convoId,
        messageId,
      })
      .catch(() => undefined);
  }

  private decodeBskyVoiceSignalPayload(message: GaiaBskyMessage): GaiaP2PVoiceSignalMessage[] {
    const chunk = parseBskyVoiceSignalPayloadChunk(message.text);
    if (!chunk) {
      return decodeBskyVoiceSignalPayload(message.text);
    }
    return this.acceptBskyVoiceSignalPayloadChunk(chunk, message);
  }

  private acceptBskyVoiceSignalPayloadChunk(
    chunk: BskyVoiceSignalPayloadChunk,
    message: GaiaBskyMessage,
  ): GaiaP2PVoiceSignalMessage[] {
    const now = Date.now();
    this.pruneIncomingChunks(now);
    const groupKey = `${message.senderDid || 'unknown'}:${chunk.id}`;
    const existing = this.incomingChunkGroups.get(groupKey);
    const group =
      existing && existing.total === chunk.total
        ? existing
        : {
            total: chunk.total,
            chunks: new Map<number, string>(),
            firstSeenAt: now,
            updatedAt: now,
          };
    group.chunks.set(chunk.index, chunk.data);
    group.updatedAt = now;
    this.incomingChunkGroups.set(groupKey, group);
    if (group.chunks.size < group.total) {
      return [];
    }

    let encoded = '';
    for (let index = 1; index <= group.total; index += 1) {
      const data = group.chunks.get(index);
      if (!data) {
        return [];
      }
      encoded += data;
    }
    this.incomingChunkGroups.delete(groupKey);
    return decodeBskyVoiceSignalPayloadData(encoded);
  }

  private pruneIncomingChunks(now: number): void {
    for (const [key, group] of this.incomingChunkGroups) {
      if (now - group.updatedAt > BSKY_VOICE_SIGNAL_CHUNK_TTL_MS) {
        this.incomingChunkGroups.delete(key);
      }
    }
    while (this.incomingChunkGroups.size > BSKY_VOICE_SIGNAL_CHUNK_GROUP_LIMIT) {
      let oldestKey: string | null = null;
      let oldestSeenAt = Number.POSITIVE_INFINITY;
      for (const [key, group] of this.incomingChunkGroups) {
        if (group.firstSeenAt < oldestSeenAt) {
          oldestSeenAt = group.firstSeenAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) {
        break;
      }
      this.incomingChunkGroups.delete(oldestKey);
    }
  }

  private reportError(error: Error): void {
    this.onError?.(error);
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

export function encodeBskyVoiceSignalPayload(messages: GaiaP2PVoiceSignalMessage[]): string {
  return `${BSKY_VOICE_SIGNAL_TEXT_PREFIX}${BSKY_VOICE_SIGNAL_TOKEN_PREFIX}${encodeBskyVoiceSignalPayloadData(
    messages,
  )}`;
}

export function encodeBskyVoiceSignalPayloadSegments(messages: GaiaP2PVoiceSignalMessage[]): string[] {
  const encoded = encodeBskyVoiceSignalPayloadData(messages);
  const fullText = `${BSKY_VOICE_SIGNAL_TEXT_PREFIX}${BSKY_VOICE_SIGNAL_TOKEN_PREFIX}${encoded}`;
  if (fullText.length <= BSKY_VOICE_SIGNAL_MAX_TEXT_GRAPHEMES) {
    return [fullText];
  }
  return encodeBskyVoiceSignalPayloadChunks(encoded);
}

export function decodeBskyVoiceSignalPayload(text: string): GaiaP2PVoiceSignalMessage[] {
  const markerIndex = text.indexOf(BSKY_VOICE_SIGNAL_TOKEN_PREFIX);
  if (markerIndex < 0) {
    return [];
  }
  const encoded = text
    .slice(markerIndex + BSKY_VOICE_SIGNAL_TOKEN_PREFIX.length)
    .trim()
    .split(/\s+/)[0];
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return [];
  }

  try {
    return decodeBskyVoiceSignalPayloadData(encoded);
  } catch {
    return [];
  }
}

export function isBskyVoiceSignalPayloadText(text: string): boolean {
  return text.includes(BSKY_VOICE_SIGNAL_TOKEN_PREFIX) || text.includes(BSKY_VOICE_SIGNAL_CHUNK_TOKEN_PREFIX);
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
        const message = coerceGaiaP2PVoiceSignalMessage(value);
        if (message) {
          messages.push(message);
        } else {
          errors.push('This call setup text is not supported.');
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
  private readonly localScreenStreamListeners = new Set<P2PVoiceLocalScreenStreamListener>();
  private readonly signalingUnsubscribe: () => void;
  private iceConfig: GaiaP2PVoiceIceConfig;
  private localStream: MediaStream | null = null;
  private localScreenShareStream: MediaStream | null = null;
  private localScreenShareSender: RTCRtpSender | null = null;
  private localScreenTrackEndedListener: (() => void) | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private cleanedCallSignalIds = new Set<string>();
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
      status: 'Ready for a call.',
      localPeerId: createVoiceId('peer'),
      roomId: options.roomId ?? 'manual-p2p-voice',
      muted: false,
      localStreamActive: false,
      remoteStreamActive: false,
      localScreenShareActive: false,
      remoteScreenShareActive: false,
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

  onLocalScreenStream(listener: P2PVoiceLocalScreenStreamListener): () => void {
    this.localScreenStreamListeners.add(listener);
    listener(this.localScreenShareStream);
    return () => {
      this.localScreenStreamListeners.delete(listener);
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
      status: 'Asking to use your microphone.',
      callId,
      error: undefined,
      muted: false,
    });

    try {
      await this.ensureLocalStream();
      const peerConnection = this.createPeerConnection();
      this.sendControlSignal('join-call');

      this.updateState({ phase: 'creating-offer', status: 'Starting the call.' });
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
      this.updateState({ phase: 'waiting-for-answer', status: 'Waiting for them to answer.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the call.';
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
        this.updateState({ status: 'Call room ready.' });
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

  async startScreenShare(): Promise<void> {
    this.assertUsable();
    if (this.localScreenShareStream) {
      return;
    }
    if (!this.peerConnection || this.state.phase !== 'connected') {
      throw new Error('Start the call before sharing your screen.');
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not available here.');
    }

    this.updateState({ status: 'Choose what to share.', error: undefined });
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error('No screen was selected.');
      }

      this.localScreenShareStream = stream;
      this.localScreenTrackEndedListener = () => {
        void this.stopScreenShare().catch((error) => {
          this.updateState({
            status: normalizeP2PVoiceError(error, 'Could not stop screen sharing.').message,
          });
        });
      };
      track.addEventListener('ended', this.localScreenTrackEndedListener, { once: true });
      this.localScreenShareSender = this.peerConnection.addTrack(track, stream);
      this.emitLocalScreenStream();
      this.updateState({
        localScreenShareActive: true,
        status: 'Sharing your screen.',
      });
      await this.renegotiateCall('Sharing your screen.');
    } catch (error) {
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      await this.stopScreenShareInternal({ renegotiate: false });
      const message = error instanceof Error ? error.message : 'Could not share your screen.';
      this.updateState({ status: message, error: message });
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    await this.stopScreenShareInternal({ renegotiate: true });
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
      localScreenShareActive: false,
      remoteScreenShareActive: false,
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
    this.localScreenStreamListeners.clear();
  }

  private async acceptOffer(description: { type: 'offer' | 'answer'; sdp: string }): Promise<void> {
    if (description.type !== 'offer' || !description.sdp) {
      throw new Error('Peer offer is missing SDP.');
    }

    if (this.peerConnection?.signalingState === 'have-local-offer') {
      throw new Error('Both sides started a call at the same time. Hang up, then have one person start the call.');
    }

    this.updateState({
      phase: 'requesting-media',
      status: this.localStream ? 'Updating the call.' : 'Incoming call. Asking to use your microphone.',
      error: undefined,
    });
    if (!this.localStream) {
      await this.ensureLocalStream();
    }
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
    this.updateState({
      phase: this.state.phase === 'connected' ? 'connected' : 'connecting',
      status: this.state.phase === 'connected' ? 'Call updated.' : 'Connecting.',
    });
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
    this.cleanupPublishedSignalsForCurrentCall();
    this.startConnectionTimer();
    this.updateState({
      phase: this.state.phase === 'connected' ? 'connected' : 'connecting',
      status: this.state.phase === 'connected' ? 'Call updated.' : 'Connecting.',
    });
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
            this.watchRemoteTrack(track);
          }
        }
      } else if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
        this.watchRemoteTrack(event.track);
      }
      this.syncRemoteMediaState();
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
      this.updateState({ status: 'Connecting.' });
      return;
    }
    await this.peerConnection.addIceCandidate(candidateInit);
    this.updateState({ status: 'Connecting.' });
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
      this.cleanupPublishedSignalsForCurrentCall();
      this.updateState({
        phase: 'connected',
        status: 'Connected.',
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
        status: 'Connection interrupted. Reconnecting.',
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

  private cleanupPublishedSignalsForCurrentCall(): void {
    const callId = this.state.callId;
    if (!callId || this.cleanedCallSignalIds.has(callId)) {
      return;
    }
    this.cleanedCallSignalIds.add(callId);
    void Promise.resolve(this.signaling.cleanupCall?.(callId)).catch((error) => {
      const status = normalizeP2PVoiceError(error, 'Could not clean up call setup.').message;
      this.updateState({ status });
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
    void this.stopScreenShareInternal({ renegotiate: false });
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
      localScreenShareActive: false,
      remoteScreenShareActive: false,
      connectionState: undefined,
      iceConnectionState: undefined,
    });
  }

  private async stopScreenShareInternal(options: { renegotiate: boolean }): Promise<void> {
    const stream = this.localScreenShareStream;
    const sender = this.localScreenShareSender;
    const endedListener = this.localScreenTrackEndedListener;
    if (!stream && !sender) {
      return;
    }

    const track = stream?.getVideoTracks()[0];
    if (track && endedListener) {
      track.removeEventListener('ended', endedListener);
    }
    if (sender && this.peerConnection) {
      try {
        this.peerConnection.removeTrack(sender);
      } catch {
        // The sender may already be gone if the peer connection is closing.
      }
    }
    if (stream) {
      for (const streamTrack of stream.getTracks()) {
        streamTrack.stop();
      }
    }

    this.localScreenShareStream = null;
    this.localScreenShareSender = null;
    this.localScreenTrackEndedListener = null;
    this.emitLocalScreenStream();
    this.updateState({
      localScreenShareActive: false,
      status: 'Screen sharing stopped.',
    });

    if (
      options.renegotiate &&
      this.peerConnection &&
      this.state.callId &&
      this.state.phase === 'connected' &&
      this.peerConnection.signalingState === 'stable'
    ) {
      await this.renegotiateCall('Screen sharing stopped.');
    }
  }

  private async renegotiateCall(status: string): Promise<void> {
    const peerConnection = this.peerConnection;
    if (!peerConnection || !this.state.callId) {
      return;
    }
    if (peerConnection.signalingState !== 'stable') {
      throw new Error('The call is already updating. Try again in a moment.');
    }

    this.updateState({ status });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    this.sendSignal({
      type: 'offer',
      description: {
        type: 'offer',
        sdp: peerConnection.localDescription?.sdp ?? offer.sdp ?? '',
      },
    });
  }

  private watchRemoteTrack(track: MediaStreamTrack): void {
    const update = () => {
      this.syncRemoteMediaState();
    };
    track.addEventListener('mute', update);
    track.addEventListener('unmute', update);
    track.addEventListener('ended', update, { once: true });
  }

  private syncRemoteMediaState(): void {
    const stream = this.remoteStream;
    const remoteAudioActive = Boolean(
      stream?.getAudioTracks().some((track) => track.readyState === 'live'),
    );
    const remoteScreenActive = Boolean(
      stream?.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted),
    );
    this.updateState({
      remoteStreamActive: remoteAudioActive,
      remoteScreenShareActive: remoteScreenActive,
    });
    this.emitRemoteStream();
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
    void Promise.resolve(this.signaling.send(envelope)).catch((error) => {
      const status = normalizeP2PVoiceError(error, 'Could not update the call.').message;
      this.updateState({ status, error: status });
    });
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

  private emitLocalScreenStream(): void {
    for (const listener of this.localScreenStreamListeners) {
      listener(this.localScreenShareStream);
    }
  }

  private assertUsable(): void {
    if (this.destroyed) {
      throw new Error('This call is closed.');
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

function shouldFlushBskyVoiceSignalImmediately(message: GaiaP2PVoiceSignalMessage): boolean {
  return message.type === 'call-rejected' || message.type === 'call-ended' || message.type === 'leave-call';
}

function normalizeP2PVoiceError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function encodeBskyVoiceSignalPayloadData(messages: GaiaP2PVoiceSignalMessage[]): string {
  const payload = {
    app: BSKY_VOICE_SIGNAL_APP,
    kind: BSKY_VOICE_SIGNAL_KIND,
    version: 1,
    messages,
  };
  return base64UrlEncode(JSON.stringify(payload));
}

function decodeBskyVoiceSignalPayloadData(encoded: string): GaiaP2PVoiceSignalMessage[] {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return [];
  }
  try {
    const decoded = base64UrlDecode(encoded);
    const payload = JSON.parse(decoded) as unknown;
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const record = payload as Record<string, unknown>;
    if (
      record.app !== BSKY_VOICE_SIGNAL_APP ||
      record.kind !== BSKY_VOICE_SIGNAL_KIND ||
      record.version !== 1 ||
      !Array.isArray(record.messages)
    ) {
      return [];
    }
    return parseP2PVoiceSignalText(JSON.stringify(record.messages)).messages;
  } catch {
    return [];
  }
}

function encodeBskyVoiceSignalPayloadChunks(encoded: string): string[] {
  const chunkId = createBskyVoiceSignalChunkId();
  let chunkLength = BSKY_VOICE_SIGNAL_MAX_TEXT_GRAPHEMES - chunkTextPrefix(chunkId, 1, 1).length;
  if (chunkLength <= 0) {
    throw new Error('Bluesky DM voice signal chunk metadata is too large.');
  }

  while (true) {
    const total = Math.ceil(encoded.length / chunkLength);
    if (total > BSKY_VOICE_SIGNAL_MAX_CHUNKS) {
      throw new Error('Bluesky DM voice signal is too large to relay safely.');
    }
    const adjustedChunkLength = BSKY_VOICE_SIGNAL_MAX_TEXT_GRAPHEMES - chunkTextPrefix(chunkId, total, total).length;
    if (adjustedChunkLength <= 0) {
      throw new Error('Bluesky DM voice signal chunk metadata is too large.');
    }
    if (adjustedChunkLength >= chunkLength) {
      break;
    }
    chunkLength = adjustedChunkLength;
  }

  const chunks: string[] = [];
  const total = Math.ceil(encoded.length / chunkLength);
  for (let index = 1; index <= total; index += 1) {
    const start = (index - 1) * chunkLength;
    const chunk = encoded.slice(start, start + chunkLength);
    chunks.push(`${chunkTextPrefix(chunkId, index, total)}${chunk}`);
  }
  return chunks;
}

function chunkTextPrefix(chunkId: string, index: number, total: number): string {
  return `${BSKY_VOICE_SIGNAL_TEXT_PREFIX}${BSKY_VOICE_SIGNAL_CHUNK_TOKEN_PREFIX}${chunkId}:${index}:${total}:`;
}

function parseBskyVoiceSignalPayloadChunk(text: string): BskyVoiceSignalPayloadChunk | null {
  const markerIndex = text.indexOf(BSKY_VOICE_SIGNAL_CHUNK_TOKEN_PREFIX);
  if (markerIndex < 0) {
    return null;
  }
  const token = text
    .slice(markerIndex + BSKY_VOICE_SIGNAL_CHUNK_TOKEN_PREFIX.length)
    .trim()
    .split(/\s+/)[0];
  const match = /^([A-Za-z0-9_-]+):([1-9][0-9]*):([1-9][0-9]*):([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) {
    return null;
  }
  const index = Number.parseInt(match[2], 10);
  const total = Number.parseInt(match[3], 10);
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(total) ||
    total < 2 ||
    total > BSKY_VOICE_SIGNAL_MAX_CHUNKS ||
    index > total
  ) {
    return null;
  }
  return {
    id: match[1],
    index,
    total,
    data: match[4],
  };
}

function createBskyVoiceSignalChunkId(): string {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
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
