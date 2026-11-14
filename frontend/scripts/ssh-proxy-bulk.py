#!/usr/bin/env python3
"""Bulk-capable variant of ~/workspace/ssh-proxy-connect.py.

Same CONNECT handshake, but the relay uses two threads with BLOCKING
sockets (the original sets the socket non-blocking and calls sendall(),
which raises BlockingIOError under bulk upload and drops the connection).
Used only for large file transfers to the Vultr box.
"""
import base64
import os
import socket
import sys
import threading
import urllib.parse


def main() -> int:
    host, port = sys.argv[1], int(sys.argv[2])
    proxy_url = (
        os.environ.get("https_proxy")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("http_proxy")
        or ""
    )
    parsed = urllib.parse.urlparse(proxy_url)
    proxy_host = parsed.hostname or "hatch-egress-proxy"
    proxy_port = parsed.port or 3128
    sock = socket.create_connection((proxy_host, proxy_port), timeout=25)
    try:
        req = f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n"
        if parsed.username:
            user = urllib.parse.unquote(parsed.username)
            pw = urllib.parse.unquote(parsed.password or "")
            auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
            req += f"Proxy-Authorization: Basic {auth}\r\n"
        req += "\r\n"
        sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                sys.stderr.write("proxy CONNECT: no response\n")
                return 1
            buf += chunk
        status_line = buf.split(b"\r\n", 1)[0].decode("utf-8", "replace")
        if " 200" not in status_line:
            sys.stderr.write(f"proxy CONNECT failed: {status_line}\n")
            return 1

        # Two blocking pump threads; backpressure handled by the kernel.
        def stdin_to_sock():
            try:
                while True:
                    data = os.read(0, 16384)
                    if not data:
                        break
                    sock.sendall(data)
            except OSError:
                pass
            finally:
                try:
                    sock.shutdown(socket.SHUT_WR)
                except OSError:
                    pass

        def sock_to_stdout():
            try:
                while True:
                    data = sock.recv(16384)
                    if not data:
                        break
                    os.write(1, data)
            except OSError:
                pass

        t1 = threading.Thread(target=stdin_to_sock, daemon=True)
        t2 = threading.Thread(target=sock_to_stdout, daemon=True)
        t1.start()
        t2.start()
        t2.join()
        return 0
    finally:
        try:
            sock.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
