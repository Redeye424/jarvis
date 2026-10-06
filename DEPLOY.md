# Hosting on your own Ubuntu PC

Replace `YOURUSER` (your Ubuntu username) and `YOUR_TOKEN` (from duckdns.org). Project assumed at `/home/YOURUSER/jarvis`.

## 1. Free name (DuckDNS)
Create a subdomain at duckdns.org and note your token, then keep it pointed at your home IP (`crontab -e`):
```
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=jarvis403022&token=YOUR_TOKEN&ip="
```

## 2. Install
```
sudo apt install nginx python3-venv certbot python3-certbot-nginx
cd ~/jarvis && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 3. Service: /etc/systemd/system/jarvis.service
```
[Unit]
Description=JARVIS Django site
After=network.target

[Service]
User=YOURUSER
WorkingDirectory=/home/YOURUSER/jarvis
Environment="DJANGO_DEBUG=0"
Environment="DJANGO_SECRET_KEY=paste-a-long-random-string"
Environment="JARVIS_PASSWORD=choose-a-strong-access-code"
Environment="DJANGO_ALLOWED_HOSTS=jarvis403022.duckdns.org"
Environment="DJANGO_CSRF_ORIGINS=https://jarvis403022.duckdns.org"
ExecStart=/home/YOURUSER/jarvis/.venv/bin/gunicorn jarvis_site.wsgi --bind 127.0.0.1:8000 --workers 2 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```
Generate a secret key with: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`

## 4. nginx: /etc/nginx/sites-available/jarvis
```
server {
    listen 80;
    server_name jarvis403022.duckdns.org;
    location /static/ { alias /home/YOURUSER/jarvis/staticfiles/; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

## 5. Turn it on
```
DJANGO_DEBUG=1 python manage.py collectstatic --noinput
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/
sudo chmod o+x /home/YOURUSER
sudo systemctl enable --now jarvis
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'
sudo certbot --nginx -d jarvis403022.duckdns.org
```
Then forward ports 80 and 443 on your router to this PC (give it a DHCP reservation first).
Check the service with `sudo systemctl status jarvis` and `journalctl -u jarvis -e`.
Never forward port 11434: Ollama has no login of its own.

## Updating the site later
After copying new project files over `~/jarvis` (this keeps `.venv`), run:
```
cd ~/jarvis && source .venv/bin/activate
DJANGO_DEBUG=1 python manage.py collectstatic --noinput
sudo systemctl restart jarvis
```

## iPhone home-screen app
Open your https address in Safari, tap Share, then Add to Home Screen. It opens full screen with the JARVIS icon.
The microphone button needs Dictation switched on (Settings, General, Keyboard) and microphone permission for the site.
