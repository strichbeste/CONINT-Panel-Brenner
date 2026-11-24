#!/usr/bin/env bash
# One-time setup on the EC2 host: nginx as blue/green switch.
set -euo pipefail

sudo mkdir -p /opt/campus
sudo chown ec2-user /opt/campus
echo blue > /opt/campus/active
echo 'upstream campus { server 127.0.0.1:3001; }' | sudo tee /etc/nginx/campus-upstream.conf > /dev/null
sudo cp -n /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig

sudo tee /etc/nginx/nginx.conf > /dev/null <<'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;
events { worker_connections 1024; }
http {
  access_log /var/log/nginx/access.log;
  include /etc/nginx/campus-upstream.conf;
  server {
    listen 80 default_server;
    location / {
      proxy_pass http://campus;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
  }
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
echo 'setup done'
