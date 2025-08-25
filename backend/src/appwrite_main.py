import sys
from io import BytesIO

from app import app


def _to_wsgi_environ(context):
    req = context.req

    body = req.bodyBinary or b""
    # Headers to WSGI
    headers = req.headers or {}
    environ = {
        "REQUEST_METHOD": req.method or "GET",
        "SCRIPT_NAME": "",
        "PATH_INFO": req.path or "/",
        "QUERY_STRING": req.queryString or "",
        "SERVER_NAME": "appwrite",
        "SERVER_PORT": "443",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "https",
        "wsgi.input": BytesIO(body),
        "wsgi.errors": sys.stderr,
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": True,
        "CONTENT_LENGTH": str(len(body)),
    }

    # Content-Type / custom headers
    if "content-type" in headers:
        environ["CONTENT_TYPE"] = headers["content-type"]

    for k, v in headers.items():
        hk = "HTTP_" + k.upper().replace("-", "_")
        # Skip headers that WSGI sets explicitly
        if hk in ("HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"):
            continue
        environ[hk] = v

    return environ


def main(context):
    """
    Appwrite Function entrypoint.
    Adapts the Appwrite request to WSGI, invokes your Flask app, and returns its response.
    """
    environ = _to_wsgi_environ(context)

    status_line = {"code": 200, "text": "200 OK"}
    response_headers = []

    def start_response(status, headers, exc_info=None):
        status_line["text"] = status
        try:
            status_line["code"] = int(status.split(" ", 1)[0])
        except Exception:
            status_line["code"] = 200
        response_headers[:] = headers

    # Call the Flask WSGI app
    body_iterable = app.wsgi_app(environ, start_response)
    body_bytes = b"".join(body_iterable)

    # Convert list of tuples to dict (Appwrite accepts a dict)
    headers_dict = {}
    for k, v in response_headers:
        # Merge duplicate headers like Set-Cookie (Appwrite supports arrays, but dict of last header is fine for most cases)
        if k in headers_dict:
            # Concatenate duplicate headers (simple approach)
            headers_dict[k] = f"{headers_dict[k]}, {v}"
        else:
            headers_dict[k] = v

    # Return as binary to preserve any content type from Flask
    return context.res.binary(body_bytes, status_line["code"], headers_dict)
