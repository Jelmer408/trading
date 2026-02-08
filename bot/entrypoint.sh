#!/bin/sh
# Start a tiny HTTP listener immediately so Fly.io proxy can detect the port.
# The Python bot will take over this port once it starts.
python -c "
import http.server, threading, time
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{\"status\":\"starting\"}')
    def log_message(self, *a): pass
s = http.server.HTTPServer(('0.0.0.0', 8080), H)
t = threading.Thread(target=s.serve_forever, daemon=True)
t.start()
print('Pre-listener on :8080')
time.sleep(2)
s.shutdown()
" &

# Give the pre-listener a moment to bind
sleep 0.5

# Start the actual bot (which will bind 8080 via aiohttp)
exec python -m bot.main
