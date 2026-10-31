# Couch Club

A responsive movie night app with secure hosted login, invitation links, persistent rooms, text chat and reactions, synchronized direct video playback, a two-step OTT launch/share wizard, shared countdowns, and independent WebRTC screen sharing and microphone/camera room calls.

## Run locally

Requires Node.js 22 or newer.

```sh
npm run build
npm run dev
```

Open http://localhost:4173. Sign in through the clearly labelled local preview form at `/login`. Preview uses temporary in-memory storage and an HttpOnly cookie; that endpoint is disabled in hosted deployments. On Sites, visitors sign in through the platform's `/signin-with-chatgpt` flow, and the Worker uses verified identity headers and the provisioned R2 `BUCKET` binding in [.openai/hosting.json](./.openai/hosting.json). Every room session is bound to its signed-in account.

## Deploy on Render with MongoDB

Render deployment is described in [render.yaml](./render.yaml). Create a MongoDB Atlas database, create a Render Web Service from this repository, and set `MONGODB_URI` to the Atlas connection string. Render supplies `PORT`; `MONGODB_DB` defaults to `couchclub`. The Node adapter in [render-server.mjs](./render-server.mjs) preserves the Worker API while storing room, member, event, and preview-account records in MongoDB. `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` are optional secrets for reliable calls across restrictive networks.

The Render build uses `npm install && npm run build`; its start command is `node render-server.mjs`. Render's free service can sleep when idle, but MongoDB keeps rooms persistent until their 24-hour expiry. A public production login provider is still required for hosted account authentication; the Render adapter enables the existing temporary display-name login for this prototype.

```sh
npm run validate
npm test
```

The build embeds [web/index.html](./web/index.html), [web/calls.js](./web/calls.js), [web/calls.css](./web/calls.css), and [web/login.html](./web/login.html) in [worker/index.js](./worker/index.js). Edit source files and rebuild before starting the preview.

## Watching with friends

Create a room, copy the invitation, and have friends join with a name. Keep the complete invitation private. Rooms expire after 24 hours. Direct HTTPS MP4/WebM links share the host's play, pause and seek through periodic state updates (approximately 2 seconds; this is not frame-accurate sync). The host must stay connected to control playback. Invitations authenticate room access; each member receives a separate session token stored in that tab.

OTT accounts and passwords are never collected or shared. The launch/share wizard opens Netflix, Prime Video, Disney+, JioHotstar, YouTube, SonyLIV, ZEE5, Apple TV, Crunchyroll, or a custom HTTPS website. After launching, select its browser tab and enable tab audio. Protected video can block screen capture; no claim is made that every service permits sharing. The own-account fallback opens the same title for each participant and uses a shared countdown.

Join the independent room call, then enable microphone or camera as needed. Both start off. Participants receive one another's audio/video over separate peer connections; screen sharing does not stop the call. Leaving the call or the page releases media tracks. Calls use deterministic offer roles, session epochs to reject stale signals, and server-verified room membership. Devices and playback still depend on browser permissions.

WebRTC uses public STUN by default. For networks requiring a relay, configure runtime secrets `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` through Sites. Credentials are served only to authenticated visitors with no-store caching. No TURN service is bundled. Desktop Chrome/Edge with tab audio is recommended.

Validation includes backend authentication/authorization and call signaling tests, plus a browser test with two participants and simulated capture streams. That test verified real WebRTC audio/video tracks, OTT screen-share signaling, stopping screen sharing while keeping the call active, call departure, and mobile overflow. Physical camera/microphone behavior and connections across actual networks still need a real-device check.

Sites are initially owner-private. The owner must enable the appropriate hosting audience for friends to access the app. Room links remain required even after the app itself becomes accessible.

R2 retains room records after access expires. This version has no scheduled retention cleanup or public abuse controls; keep hosting restricted to a trusted group. The 8-person presence limit is best effort during concurrent joins. Google Fonts and the optional Blender Foundation Big Buck Bunny sample require external network access.
