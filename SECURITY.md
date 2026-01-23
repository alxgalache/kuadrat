# Security Documentation for Kuadrat

This document outlines the security measures implemented after the January 2026 security incident.

## Incident Summary

On January 19-21, 2026, the application was targeted by automated attack bots that:
- Exploited a prototype pollution vulnerability to achieve Remote Code Execution (RCE)
- Attempted to install the gsocket backdoor for persistent access
- Wrote malicious files to the server
- Eventually crashed the Docker containers

## Security Measures Implemented

### 1. Request Validation Middleware (`api/middleware/securityMiddleware.js`)

Protects against:
- **Prototype pollution attacks** (`__proto__`, `constructor`, `prototype`)
- **Command injection** (curl, wget, bash, eval, exec, etc.)
- **Path traversal and scanner detection** (blocks .git, .env, wp-admin, etc.)
- **Malicious user agents** (nmap, nikto, sqlmap, etc.)

**Usage:** Automatically applied to all API requests in `server.js`.

### 2. HTML Sanitization

#### Client-Side (DOMPurify)
- **Component:** `client/components/SafeHTML.js`
- **Usage:** Replace `dangerouslySetInnerHTML` with `<SafeProductDescription>` or `<SafeAuthorBio>`
- **Files Updated:**
  - `client/app/galeria/p/[id]/page.js`
  - `client/app/galeria/mas/p/[id]/page.js`
  - `client/app/orders/[id]/page.js`
  - `client/app/pedido/[token]/page.js`
  - `client/app/admin/pedidos/[id]/page.js`
  - `client/app/admin/authors/[id]/page.js`
  - `client/components/AuthorModal.js`

#### Server-Side (Email Templates)
- **Utility:** `api/utils/htmlEscape.js`
- **Important:** When adding user-provided content to email templates, use `escapeHtml()`:
  ```javascript
  const { escapeHtml } = require('../utils/htmlEscape');

  // Instead of:
  `<div>${item.name}</div>`

  // Use:
  `<div>${escapeHtml(item.name)}</div>`
  ```

### 3. Nginx Reverse Proxy

Configuration files: `infrastructure/nginx/kuadrat.conf` (create on EC2)

Key features:
- Blocks direct IP access (returns 444)
- Rate limiting per endpoint
- Blocks suspicious user agents
- Blocks scanner paths (.php, .git, wp-admin, etc.)
- SSL/TLS termination with Let's Encrypt
- Security headers (X-Frame-Options, CSP, HSTS, etc.)

### 4. Fail2ban

Configuration files: `infrastructure/fail2ban/`

Jails configured:
- `kuadrat-scanner` - Bans vulnerability scanners
- `kuadrat-rce-attempt` - Bans RCE attempts (1 week ban)
- `kuadrat-api-abuse` - Bans API abuse
- `nginx-badbots` - Bans bad bots

**Installation:**
```bash
cd infrastructure/fail2ban
sudo bash setup-fail2ban.sh
```

### 5. Docker Security

**Production configuration:** `docker-compose.prod.yml`

Features:
- Ports bound to localhost only (127.0.0.1)
- Read-only filesystem for client container
- Non-root user execution
- No host volume mounts (prevents file write attacks)
- Resource limits (CPU/memory)
- `no-new-privileges` security option

### 6. Security Headers (Next.js)

Configured in `client/next.config.js`:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy

## Deployment Checklist

### Before Deploying

- [ ] Run `npm audit` in both `api/` and `client/`
- [ ] Update dependencies with `npm update`
- [ ] Review any new user input handling for XSS/injection risks

### EC2 Setup

1. **Install and configure nginx:**
   ```bash
   sudo apt install nginx
   # Copy nginx config from infrastructure/nginx/kuadrat.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Get SSL certificates:**
   ```bash
   sudo certbot --nginx -d pre.140d.art -d api.pre.140d.art
   ```

3. **Install fail2ban:**
   ```bash
   cd infrastructure/fail2ban
   sudo bash setup-fail2ban.sh
   ```

4. **Update security groups:**
   - Remove ports 3000, 3001 from public access
   - Keep only ports 80, 443 public
   - SSH (22) from your IP only

5. **Deploy with production compose:**
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

## Monitoring

### Check for attacks

```bash
# View fail2ban status
sudo fail2ban-client status

# View banned IPs for a jail
sudo fail2ban-client status kuadrat-scanner

# Check nginx access logs for suspicious activity
grep -E "(\.php|\.git|wp-admin|__proto__|eval\()" /var/log/nginx/kuadrat_*access.log

# Check API security logs
docker logs kuadrat-api 2>&1 | grep "\[SECURITY\]"
```

### Unban an IP

```bash
sudo fail2ban-client set kuadrat-scanner unbanip <IP_ADDRESS>
```

## Environment Variables Security

### Exposed to Browser (NEXT_PUBLIC_*)
These are bundled into client-side JavaScript:
- `NEXT_PUBLIC_SITE_URL` - Safe (public URL)
- `NEXT_PUBLIC_API_URL` - Safe (public API endpoint)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - **Restrict in Google Cloud Console**
- `NEXT_PUBLIC_REVOLUT_PUBLIC_KEY` - Safe (designed to be public)

### Server-Only (Never expose)
- `JWT_SECRET`
- `DATABASE_URL`
- `SMTP_PASSWORD`
- Any API secret keys

## Incident Response

If you suspect an attack:

1. **Check for malicious files:**
   ```bash
   # In the client directory, look for:
   # - Executable files with timestamp names (e.g., 1768792406785_*)
   # - Random-named directories owned by root
   ls -la | grep -E "^-rwx.*root|^drwx.*root"
   ```

2. **Check Docker logs:**
   ```bash
   docker logs kuadrat-api 2>&1 | grep -i "error\|security\|attack"
   docker logs kuadrat-client 2>&1 | grep -i "error"
   ```

3. **Check Sentry for unusual errors**

4. **If compromised:**
   - Stop containers: `docker compose down`
   - Remove malicious files
   - Update security groups to block attacker IPs
   - Rebuild and redeploy with fresh images

## Contact

For security issues, contact the development team immediately.
