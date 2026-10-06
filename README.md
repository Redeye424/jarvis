# J.A.R.V.I.S. (Django)

A Django chat site with a JARVIS-style persona and HUD interface, powered by a local Ollama server.

## Run it
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
ollama pull llama3.2                                 # run on the Ollama machine; use any model you like
python manage.py runserver 0.0.0.0:8000   # 0.0.0.0 lets other devices on your network connect
```
Open http://127.0.0.1:8000

## Settings (environment variables)
- `OLLAMA_HOST`: default `http://192.168.1.130:11434`
- `JARVIS_MODEL`: default `llama3.2`; must be pulled on the Ollama server
- `JARVIS_ADDRESS`: how JARVIS addresses you, default `sir`
- `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS`: set these before deploying

The persona prompt lives in `jarvis_site/views.py`; the look is all in `static/jarvis.css`.

## Notes
- Browsers only allow speech after a tap, so JARVIS speaks once you press **Initialise** on the boot screen.
- If Ollama is unreachable, JARVIS says one of a few random "server is down" lines (see `OFFLINE_LINES` in `views.py`).

## Login and production
- Set `JARVIS_PASSWORD` to require an access code (sign out at `/logout`). With `DJANGO_DEBUG=0` the server refuses to start without it and without a real `DJANGO_SECRET_KEY`.
- Production cookies are HTTPS-only, so reach the site through your https domain. See `DEPLOY.md` for gunicorn, nginx, DuckDNS and certbot.
