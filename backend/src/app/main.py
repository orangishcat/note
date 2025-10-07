from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Dict, List

from .app import main as run_main

if os.getenv("PRODUCTION") != "True":
    from dotenv import load_dotenv

    load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 5000

REQUIRED_ENV_VARS: List[str] = [
    "APPWRITE_PROJECT_ID",
    "APPWRITE_ENDPOINT",
    "APPWRITE_API_KEY",
    "DATABASE_ID",
    "FOLDERS_COLLECTION_ID",
    "SCORES_COLLECTION_ID",
    "RECORDINGS_COLLECTION_ID",
    "SCORES_BUCKET_ID",
    "IMAGES_BUCKET_ID",
    "FILES_BUCKET_ID",
    "BEAM_TOKEN",
    "SECRET_KEY",
    "MSCORE_COMMAND",
]

OPTIONAL_ENV_VARS: List[str] = [
    "APP_NAME",
    "DEBUG",
    "HOST",
    "PORT",
]


def _ensure_env_vars(required: List[str]) -> Dict[str, str]:
    env: Dict[str, str] = {}
    missing: List[str] = []

    for key in required:
        value = os.getenv(key)
        if value is None or value == "":
            missing.append(key)
        else:
            env[key] = value

    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(sorted(missing))
        )

    for key in OPTIONAL_ENV_VARS:
        value = os.getenv(key)
        if value:
            env[key] = value

    env["HOST"] = env.get("HOST", "127.0.0.1")
    env["PORT"] = str(env.get("PORT", DEFAULT_PORT))

    token = os.getenv("BEAM_TOKEN")
    if not token:
        raise RuntimeError("BEAM_TOKEN environment variable is required")
    env["BEAM_TOKEN"] = token

    return env


def _deploy(args: argparse.Namespace) -> None:
    from beam import Image, Pod

    env = _ensure_env_vars(REQUIRED_ENV_VARS)
    env["PRODUCTION"] = "True"

    if args.port is not None:
        env["PORT"] = str(args.port)
    port = int(env.get("PORT", DEFAULT_PORT))

    if args.host:
        env["HOST"] = args.host

    app_name = args.app or os.getenv("BEAM_APP", BACKEND_DIR.name)
    deployment_name = args.name or os.getenv("BEAM_DEPLOYMENT_NAME") or app_name

    keep_warm = args.keep_warm

    image = Image().from_dockerfile("./Dockerfile")

    pod = Pod(
        app=app_name,
        name=deployment_name,
        entrypoint=[
            "/bin/bash",
            "-lc",
            # everything after here is one shell line
            "set -euxo pipefail; "
            "echo '=== CWD & listing ==='; pwd; ls -la; "
            "echo '=== PYTHON DIAG ==='; "
            'python -c "import os,sys,importlib.util as u; '
            "print('CWD:',os.getcwd()); "
            "print('sys.executable:',sys.executable); "
            "print('sys.path:',sys.path); "
            "print('find_spec(app):',u.find_spec('app'))\"; "
            "echo '=== LAUNCH ==='; "
            "exec note-backend serve",
        ],
        ports=[port],
        image=image,
        env=env,
        keep_warm_seconds=keep_warm if keep_warm is not None else 30,
        authorized=False,
    )

    details, ok = pod.deploy(name=deployment_name)
    if not ok:
        raise RuntimeError("Beam deployment failed")

    invoke_url = details.get("invoke_url")
    version = details.get("version")

    print("Deployment completed.")
    print(f"  Deployment: {deployment_name}")
    if invoke_url:
        print(f"  Invoke URL: {invoke_url}")
    if version:
        print(f"  Version: {version}")


def _serve(args: argparse.Namespace) -> None:
    host = getattr(args, "host", None)
    if host:
        os.environ["HOST"] = host
    port = getattr(args, "port", None)
    if port is not None:
        os.environ["PORT"] = str(port)

    run_main()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage the backend server.")
    subparsers = parser.add_subparsers(dest="command")

    serve_parser = subparsers.add_parser("serve", help="Run the Flask server locally.")
    serve_parser.add_argument("--host", default=None, help="Host to bind the server")
    serve_parser.add_argument(
        "--port", type=int, default=None, help="Port to bind the server"
    )
    serve_parser.set_defaults(func=_serve)

    deploy_parser = subparsers.add_parser(
        "deploy", help="Deploy the Flask server to Beam."
    )
    deploy_parser.add_argument(
        "--name", default=None, help="Beam deployment name override"
    )
    deploy_parser.add_argument("--app", default=None, help="Beam app name override")
    deploy_parser.add_argument(
        "--host", default=None, help="Override binding host for the container"
    )
    deploy_parser.add_argument(
        "--port", type=int, default=None, help="Override binding port"
    )
    deploy_parser.add_argument(
        "--keep-warm",
        dest="keep_warm",
        type=int,
        default=None,
        help="Seconds to keep the Beam pod warm (-1 to keep indefinitely)",
    )
    deploy_parser.set_defaults(func=_deploy)

    parser.set_defaults(func=_serve)

    args = parser.parse_args()
    if not getattr(args, "command", None):
        args = parser.parse_args(["serve"])
    return args


def main() -> None:
    args = _parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
