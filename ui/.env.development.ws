# Rename to .env.development.local to use the WebSocket dev server instead of WASM.
# Run `cargo run -p chronos-server` from the engine/ directory first.
VITE_USE_WS_SERVER=true
VITE_WS_URL=ws://localhost:3000/ws
