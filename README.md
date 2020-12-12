# videojs_lowLatencyDash
PoC implementation of low-latency DASH streaming with Video.js. I modified two repos in the Video.js project, http-streaming (https://github.com/videojs/http-streaming) and mpd-parser (https://github.com/videojs/mpd-parser). Live latency can be as low as 1 second, and 2-3 seconds on average using the Akamai LL-DASH test stream, https://akamaibroadcasteruseast.akamaized.net/cmaf/live/657078/akasource/out.mpd.

How to build Follow the build instructions in http-streaming and mpd-parser to build the two repos separately. Next, remove the npm-installed mpd-parser in http-streaming/, http-streaming/node_modules/mpd_parser/, copy the entire new mpd-parser contained in videojs_lldash into http-streaming/node_modules. Finally, run "npm run build" to build http-streaming again. That is all for building videojs_lldash.

How to test You can either load http-streaming/index.html locally, or host the entire http-streaming/ folder somewhere. If you host it on a webserver, rememeber to enable cross-origin so that the test stream can play.
