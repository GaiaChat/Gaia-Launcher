# Experimental P2P Voice

Gaia Launcher includes an experimental microphone-only WebRTC voice lab for 1-on-1 or very small room tests.

The MVP uses public STUN servers by default:

```ts
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];
```

No TURN relay, hosted SaaS voice service, paid API, or bundled relay credential is included.

## Network Expectations

STUN-only calls work on many normal home networks, but they are not guaranteed. Strict NAT, corporate Wi-Fi, school networks, hotel Wi-Fi, VPNs, and some mobile carrier networks may require a TURN relay. Gaia intentionally leaves TURN optional so a community or user can provide their own relay URL, TLS relay URL, username, and credential later.

When direct connectivity fails, the UI shows:

```text
Direct P2P connection failed. This network may require a TURN relay.
```

## Signaling

The WebRTC service has a signaling transport interface. There is no production Gaia signaling relay yet, so the first transport is manual copy/paste signaling. It supports these message types:

- `join-call`
- `offer`
- `answer`
- `ice-candidate`
- `leave-call`
- `call-rejected`
- `call-ended`

This keeps the WebRTC flow testable without adding a server dependency. A future Current gateway, Bluesky DM, or community signaling relay can implement the same transport shape.

## Manual Test

1. Build Gaia:

   ```sh
   pnpm build
   ```

2. Open two separate dev profiles:

   ```sh
   pnpm exec electron --user-data-dir=/tmp/gaia-p2p-a ./dist/main/main.js
   pnpm exec electron --user-data-dir=/tmp/gaia-p2p-b ./dist/main/main.js
   ```

3. Sign in if needed, open Messages in both windows, select the same direct conversation, then click the phone icon in the conversation header.

4. In window A, click `Start Call`. Open `Manual signaling`, copy the Local signal from A, paste it into Peer signal in B, then click `Apply Peer`.

5. Copy B's Local signal and paste it into Peer signal in A, then click `Apply Peer`.

6. Continue copying any new ICE candidate lines between windows until the status changes to connected.

7. Verify that local mic is `On`, remote audio changes from `Waiting`, and audio plays through the remote audio control.

8. Click `Mute` and confirm the local mic state changes without ending the call.

9. Click `End` and confirm the microphone indicator turns off, remote audio clears, and the peer receives a leave/end signal after it is exchanged.

## Later TURN Work

Recommended follow-up for community-hosted TURN:

- Add validation for `turn:` and `turns:` URLs in Settings.
- Support multiple named relay profiles.
- Add a connectivity preflight that detects when STUN-only fails before a call.
- Document coturn setup for communities without committing shared credentials.
- Keep relay credentials local to the user or community server admin.
