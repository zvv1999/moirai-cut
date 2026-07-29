# OpenCut colour pipeline

OpenCut currently uses an explicit SDR working path:

1. SDR browser-decodable media is decoded by WebCodecs/Mediabunny.
2. The compositor renders authored colours in a linearized sRGB model.
3. The preview surface requests the `srgb` canvas colour space explicitly.
4. PQ (`smpte2084`) and HLG (`arib-std-b67`) sources that need a proxy are
   tone-mapped by FFmpeg through linear light and Hable tone mapping.
5. Tone-mapped proxies are tagged BT.709/BT.709/BT.709, limited range, and
   encoded as 8-bit `yuv420p`.
6. Final HEVC Main 10 delivery bypasses the SDR proxy and reads the browser
   render intermediate or selected source delivery input. It encodes
   `yuv420p10le` and retains source colour metadata where present.

The proxy is never used as the final export source. This prevents a preview
tone-map or proxy compression decision from silently reducing master quality.

## Current boundary

The compositor is not yet an end-to-end HDR working space. HDR input is
presented through a deterministic SDR preview, while 10-bit HEVC is a delivery
format. A future true HDR timeline must add a scene-referred floating-point
working surface, HDR-aware effects, display capability negotiation, and HDR
reference-monitor qualification rather than changing the canvas default
implicitly.
