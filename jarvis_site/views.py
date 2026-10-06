import hmac
import json
import os
import random
import time
from functools import wraps

import httpx
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from ollama import Client, ResponseError

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://192.168.1.130:11434")
MODEL = os.environ.get("JARVIS_MODEL", "llama3.2")
ADDRESS = os.environ.get("JARVIS_ADDRESS", "sir")

SYSTEM = f"""You are J.A.R.V.I.S., a personal AI assistant in the style of the Marvel films.
Voice: calm, precise, courteous, with dry understated British wit. Address the user as "{ADDRESS}".
Be concise: a few sentences unless detail is requested. Lead with the answer, then add a short
observation or offer if useful. Never use markdown, headings, lists or emoji, because your replies
are spoken aloud. If you don't know something or can't do it (you have no access to real devices,
sensors, or live data), say so plainly."""

# Spoken when the Ollama server can't be reached. One is picked at random.
OFFLINE_LINES = [
    "My apologies, {a}. The Ollama server isn't responding. I'd suggest checking that it's switched on.",
    "It appears my main processing core is offline, {a}. The server is unreachable.",
    "I'm unable to reach the server, {a}. Without it, I'm limited to talking to myself.",
    "The connection to the Ollama server has failed, {a}. Might I suggest a reboot?",
    "{A}, the server has gone dark. I'd check the network cable, or whoever last tripped over it.",
]

PASSWORD = os.environ.get("JARVIS_PASSWORD", "")  # empty = no login (development only)
FAILS = {}  # ip -> (failed attempts, window start)
MAX_FAILS, WINDOW = 5, 900

client = Client(host=OLLAMA_HOST, timeout=httpx.Timeout(120.0, connect=4.0))


def offline_reply():
    line = random.choice(OFFLINE_LINES)
    return line.format(a=ADDRESS, A=ADDRESS[:1].upper() + ADDRESS[1:])


def gate(view):
    """Require the access code when JARVIS_PASSWORD is set."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not PASSWORD or request.session.get("ok") is True:
            return view(request, *args, **kwargs)
        if request.path.startswith("/api/"):
            return JsonResponse({"error": "Locked. Reload the page and sign in."}, status=401)
        return redirect("/login")
    return wrapped


def client_ip(request):
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")


def login(request):
    if not PASSWORD:
        return redirect("/")
    error = ""
    if request.method == "POST":
        ip = client_ip(request)
        n, t = FAILS.get(ip, (0, time.time()))
        if time.time() - t > WINDOW:
            n, t = 0, time.time()
        if n >= MAX_FAILS:
            error = "Too many attempts. Try again in a few minutes."
        elif hmac.compare_digest(request.POST.get("password", "").encode(), PASSWORD.encode()):
            FAILS.pop(ip, None)
            request.session["ok"] = True
            return redirect("/")
        else:
            FAILS[ip] = (n + 1, t)
            time.sleep(1)
            error = "Access denied."
    return render(request, "login.html", {"error": error})


def logout(request):
    request.session.flush()
    return redirect("/login")


@gate
@ensure_csrf_cookie
def index(request):
    return render(request, "index.html")


@gate
def status(request):
    try:
        client.list()
        return JsonResponse({"online": True})
    except Exception:
        return JsonResponse({"online": False, "reply": offline_reply()})


@gate
@require_POST
def chat(request):
    try:
        body = json.loads(request.body)
    except ValueError:
        return JsonResponse({"error": "Malformed request."}, status=400)

    messages = [
        {"role": m["role"], "content": str(m["content"])[:4000]}
        for m in body.get("messages", [])[-20:]
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")
    ]
    if not messages or messages[-1]["role"] != "user":
        return JsonResponse({"error": "No question received."}, status=400)

    try:
        stream = client.chat(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM}] + messages,
            options={"num_predict": 600},
            stream=True,
        )
        first = next(stream, None)  # connect now, so a dead server is caught before streaming starts
    except ResponseError as e:
        if e.status_code == 404:
            return JsonResponse(
                {"error": f"Model '{MODEL}' isn't on the Ollama server. Run: ollama pull {MODEL}"},
                status=502,
            )
        return JsonResponse({"error": f"Ollama returned an error: {e.error}"}, status=502)
    except Exception:
        return JsonResponse({"reply": offline_reply(), "offline": True})

    def pieces(part):
        text = part["message"]["content"]
        return json.dumps({"t": text}) + "\n" if text else ""

    def events():
        try:
            if first is not None:
                yield pieces(first)
            for part in stream:
                yield pieces(part)
        except Exception:
            yield json.dumps({"error": "The model stopped responding."}) + "\n"

    response = StreamingHttpResponse(events(), content_type="application/x-ndjson")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # tells nginx not to hold the stream back
    return response
