"""Entry point for Pipeleyen: parse arguments and launch server."""

import argparse
import socket
import threading
import time
import webbrowser

import uvicorn


def fnParseArguments():
    """Parse command-line arguments and return the namespace."""
    parser = argparse.ArgumentParser(
        description="Pipeleyen: Pipeline Verification GUI"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8157,
        help="Port to serve on (default: 8157).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open browser automatically.",
    )
    return parser.parse_args()


def fbPortIsListening(sHost, iPort):
    """Return True when a TCP connection to sHost:iPort succeeds."""
    try:
        with socket.create_connection((sHost, iPort), timeout=0.5):
            return True
    except OSError:
        return False


def fnOpenBrowserWhenReady(sHost, iPort):
    """Wait for the server to accept connections, then open browser."""
    sUrl = f"http://{sHost}:{iPort}"
    for _ in range(40):
        time.sleep(0.25)
        if fbPortIsListening(sHost, iPort):
            webbrowser.open(sUrl)
            return
    webbrowser.open(sUrl)


def main():
    """Entry point: parse arguments, launch server, open browser."""
    args = fnParseArguments()
    sUrl = f"http://{args.host}:{args.port}"
    if not args.no_browser:
        threadBrowser = threading.Thread(
            target=fnOpenBrowserWhenReady,
            args=(args.host, args.port),
            daemon=True,
        )
        threadBrowser.start()
    print(f"Pipeleyen running at {sUrl}")
    uvicorn.run(
        "pipeleyen.serverApplication:fappCreateApplication",
        factory=True,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
