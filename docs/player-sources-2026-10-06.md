# Playback sources and controls — 2026-10-06

The source button and episode button remain visible. Desktop pointer hover opens
their menus; moving out closes them after a short grace period so the pointer can
cross the gap. Both panels open below the buttons. Touch and keyboard users can
toggle them, and Escape closes them.

## Available sources

- **CineSrc** remains the default iframe source. Its sandbox continues to exclude
  popups and top-level navigation.
- **Bingr** resolves HLS through the public API and plays it in Luma's Vidstack
  player. It never loads the provider's advertising page. Switching sources keeps
  the current playback position; switching episodes starts the new episode.
- **VidSrc.buzz**, **VidFast**, and **VidSrc.wtf** are optional iframe sources.
  Their menus say they may open advertisements or redirect. The owner explicitly
  approved unrestricted embedding for these three providers after their sandbox
  incompatibility was demonstrated. Only these fixed registry entries omit the
  iframe sandbox; unknown providers fall back to restricted CineSrc.
- The VidSrc.wtf `/1/` entry is the default player observed after selecting
  Westworld S2 E1 on NyumatFlix (the purple Leon/Jill/Ada screen).

The Bingr resolver was informed by NyumatFlix's public implementation:
https://github.com/Nyumat/NyumatFlix/blob/main/apps/web/lib/scrape/providers/bingr.ts
Its native-player approach explains its cleaner experience; copying its full
provider list would also copy entries that are currently unavailable.

## Relay constraints

The authenticated media route accepts only HTTPS URLs on the explicitly
listed Bingr media hosts. Credentials, custom ports, unrelated hosts, and
redirects are rejected. HLS segment, variant, key, and map URLs are rewritten
through the same validation. Media is served as binary with `nosniff`, even when
an upstream labels a video segment as HTML. Upstream cookies are not forwarded.
Playback API routes retain the existing PWA network-only policy.

If Bingr changes media domains, update the allowlist after verifying the new
host. Do not turn this route into an unrestricted proxy. Media traffic passes
through the deployment, so hosting bandwidth and request quotas apply.

## Candidate checks

Local browser playback succeeded for Westworld S2 E1/E2 (TMDB 63247) and Fight Club
(TMDB 550), including resume after a source change and a fresh start after an
episode change. Candidate checks retained the
same popup/navigation restrictions throughout.

VidRock, VidFast, VidNest, the tested VidSrc mirror, and SuperEmbed refused a
sandbox without popup privileges. The tested original/new VidSrc endpoints did
not connect in this network. VidLux rendered controls but failed to produce a
playable stream for these samples. VidFast and VidSrc.wtf were subsequently
approved as optional sources with advertising navigation enabled. The other
incompatible candidates remain excluded. Availability varies by title, network,
and provider.

## Worker compatibility follow-up

The Bingr API and media requests now include the browser User-Agent and language
headers used by the reference resolver. Resolver failures return a coarse stage
code so a deployment-specific failure can be diagnosed without exposing upstream
response bodies, credentials, or signed media URLs.

Endpoint references: https://vidsrc.buzz/ and https://vidfast.vc/ .
