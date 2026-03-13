"""Entry point for Pipeleyen: parse arguments and launch server."""

import argparse
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


def main():
    """Entry point: parse arguments, launch server, open browser."""
    args = fnParseArguments()
    sUrl = f"http://{args.host}:{args.port}"
    if not args.no_browser:
        webbrowser.open(sUrl)
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
