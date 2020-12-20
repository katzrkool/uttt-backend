# UTTT-Backend
A websocket server that acts as a backend to [uttt-frontend](https://github.com/katzrkool/uttt-frontend).

## Installation
Only prerequisite is a running redis server. Then, just clone the repo, run `yarn; tsc;`.

Then running `node bin/server.js` will start up the server.

If an `UTTT_BACKEND_DSN` environment variable is set, it'll use Sentry error reporting.

## Usage
The API is documented at [endpoints.md](./endpoints.md)