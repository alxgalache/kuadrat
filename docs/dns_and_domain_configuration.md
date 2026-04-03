
I have successfully deployed kuadrat project in a ec2 aws instance. I have created and assigned an elastic IP to that instance, but I want to connect/route my domain (140d.art) to the ec2 instance elastic IP (actually I want to create a subdomain an connect/route that subdomain + domain, 'pre.140d.art', to the ec2 instance). I also want to install and configure a ssl (https) certificate for the domain in the instance, using certbot.

So give me the detailes steps and procedure for creating a subdomain for my domain (I am using godaddy), connecting or routing it to my ec2 instance, and install and configure a ssl certificate for the project, using certbot in my ec2 instance.

In fact, I want two sub-domains. Currently client is in url "http://15.216.4.230:3000" and api is in url "http://15.216.4.230:3001".
I want to create a subdomain "pre.140d.art" which will point to the client, and a subdomain "api.pre.140d.art" which will point to the api.

Please give me all the information in a guide to implement this solution.

### Overview

You already have your app running on EC2 at:
- Client: `http://15.216.4.230:3000`
- API: `http://15.216.4.230:3001`

You want:
- `pre.140d.art` → client (port `3000`)
- `api.pre.140d.art` → API (port `3001`)
- Both served over HTTPS with Certbot/Let’s Encrypt.

The steps are:
1. Create DNS records for the subdomains in GoDaddy.
2. Ensure the EC2 security group and OS firewall allow HTTP/HTTPS.
3. Install and configure Nginx as a reverse proxy on the EC2 instance.
4. Install Certbot and get SSL certificates.
5. Test everything and understand automatic renewal.

Below is a detailed, copy‑paste‑friendly guide.
  
---  

### 1. Create DNS records in GoDaddy

You will create **A records** for `pre.140d.art` and `api.pre.140d.art` pointing to the **Elastic IP** of your EC2 instance `15.216.4.230`.

#### 1.1. Log in and open DNS settings

1. Log into your GoDaddy account.
2. Go to **My Products** → find your domain `140d.art` → click **DNS** or **Manage DNS**.

#### 1.2. Create record for `pre.140d.art`

1. In the DNS Records section, click **Add**.
2. Set:
    - **Type:** `A`
    - **Name/Host:** `pre`
        - GoDaddy will interpret this as `pre.140d.art`.
    - **Value/Points to:** `15.216.4.230` (your Elastic IP)
    - **TTL:** default (e.g., `1 hour` is fine)
3. Click **Save**.

#### 1.3. Create record for `api.pre.140d.art`

In GoDaddy you can create nested subdomains by using the full left‑hand side under `Name`.

1. Click **Add** again.
2. Set:
    - **Type:** `A`
    - **Name/Host:** `api.pre`
        - This will become `api.pre.140d.art`.
    - **Value/Points to:** `15.216.4.230`
    - **TTL:** default
3. Click **Save**.

#### 1.4. Wait for DNS propagation and test

DNS changes can take up to an hour, but often work in minutes.

From your local machine (or any terminal with `dig`/`nslookup`):

```bash  
nslookup pre.140d.artnslookup api.pre.140d.art```  
  
You should see answers pointing to `15.216.4.230`.  
  
Or just try in a browser (initially will be HTTP and likely show nothing or Nginx default page until we finish config):  
  
- `http://pre.140d.art`  
- `http://api.pre.140d.art`  
  
It’s okay if they don’t work yet; we still need Nginx + Certbot.  
  
---  
  
### 2. Ensure EC2 security group and firewall allow HTTP/HTTPS  
  
Your instance must allow inbound connections to **ports 80 and 443** from the internet.  
  
#### 2.1. Check and edit security group  
  
1. In the AWS console, go to **EC2 → Instances**.  
2. Select your Kuadrat instance.  
3. In the **Security** tab, open the **Security groups** linked to the instance.  
4. In **Inbound rules**, ensure you have:  
   - **HTTP**:  
     - Type: `HTTP`  
     - Protocol: `TCP`  
     - Port: `80`  
     - Source: `0.0.0.0/0` (and `::/0` for IPv6 if you use it)  
   - **HTTPS**:  
     - Type: `HTTPS`  
     - Protocol: `TCP`  
     - Port: `443`  
     - Source: `0.0.0.0/0` (and `::/0`)  
  
If these rules don’t exist, add them and save.  
  
#### 2.2. Check OS‑level firewall (if any)  
  
On many Ubuntu AMIs, `ufw` is disabled by default. On your EC2 instance:  
  
```bash  
sudo ufw status```  
  
- If it says `Status: inactive`, you’re fine.  
- If it’s active, allow HTTP/HTTPS:  
  
```bash  
sudo ufw allow 80/tcpsudo ufw allow 443/tcpsudo ufw reload```  
  
Your app can continue to use ports `3000` and `3001` internally; Nginx will receive traffic on `80/443` and proxy to these ports.  
  
---  
  
### 3. Install and configure Nginx as a reverse proxy  
  
We’ll install Nginx and set up **two server blocks**:  
  
- `pre.140d.art` → proxy to `http://127.0.0.1:3000`  
- `api.pre.140d.art` → proxy to `http://127.0.0.1:3001`  
  
These instructions assume Ubuntu/Debian (very common on EC2). Adjust if you use another OS.  
  
#### 3.1. Install Nginx  
  
```bash  
sudo apt updatesudo apt install -y nginx```  
  
Check that Nginx is running:  
  
```bash  
sudo systemctl status nginx```  
  
You should see `active (running)`. If not, start it:  
  
```bash  
sudo systemctl start nginxsudo systemctl enable nginx```  
  
#### 3.2. Confirm your Node/Next and API are reachable locally  
  
On the EC2 instance, test that your services respond:  
  
```bash  
curl http://127.0.0.1:3000curl http://127.0.0.1:3001```  
  
You should see HTML/JSON responses or at least some content. If these commands fail, check how you’re running Kuadrat (plain Node vs Docker) and make sure ports 3000/3001 are *bound to 0.0.0.0 or localhost* and are reachable from the host.  
  
If you’re using Docker, ensure your `docker run` or `docker-compose.yml` exposes those ports, e.g.:  
  
```yaml  
ports:  
  - "3000:3000"  # client  - "3001:3001"  # api  
```  

#### 3.3. Create Nginx configuration for `pre.140d.art`

Create a new server block file:

```bash  
sudo nano /etc/nginx/sites-available/pre.140d.art```  
  
Paste this configuration (HTTP only for now, Certbot will modify it later):  
  
```nginx  
server {  
    listen 80;    listen [::]:80;    server_name pre.140d.art;  
    # You can add basic security headers here later if you like.  
    location / {        proxy_pass http://127.0.0.1:3000;  
        # Preserve Host header        proxy_set_header Host $host;        proxy_set_header X-Real-IP $remote_addr;        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;        proxy_set_header X-Forwarded-Proto $scheme;  
        # WebSocket support (important if you use Socket.IO)        proxy_set_header Upgrade $http_upgrade;        proxy_set_header Connection "upgrade";    }}  
```  

Enable it by creating a symlink into `sites-enabled`:

```bash  
sudo ln -s /etc/nginx/sites-available/pre.140d.art /etc/nginx/sites-enabled/```  
  
#### 3.4. Create Nginx configuration for `api.pre.140d.art`  
  
```bash  
sudo nano /etc/nginx/sites-available/api.pre.140d.art```  
  
Paste:  
  
```nginx  
server {  
    listen 80;    listen [::]:80;    server_name api.pre.140d.art;  
    location / {        proxy_pass http://127.0.0.1:3001;  
        proxy_set_header Host $host;        proxy_set_header X-Real-IP $remote_addr;        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;        proxy_set_header X-Forwarded-Proto $scheme;  
        # WebSocket support (if API / Socket.IO exposed here)        proxy_set_header Upgrade $http_upgrade;        proxy_set_header Connection "upgrade";    }}  
```  

Enable it:

```bash  
sudo ln -s /etc/nginx/sites-available/api.pre.140d.art /etc/nginx/sites-enabled/```  
  
#### 3.5. Disable the default site (optional but recommended)  
  
```bash  
sudo rm /etc/nginx/sites-enabled/default 2>/dev/null || true  
```  

#### 3.6. Test and reload Nginx

Always test the configuration before reloading:

```bash  
sudo nginx -t```  
  
If you see `syntax is ok` and `test is successful`, reload Nginx:  
  
```bash  
sudo systemctl reload nginx```  
  
Now, try in your browser (still HTTP, not HTTPS yet):  
  
- `http://pre.140d.art` → should show your client (same as `http://15.216.4.230:3000`).  
- `http://api.pre.140d.art` → should hit your API (maybe returning JSON or 404 depending on path).  
  
If this works, you are ready for SSL.  
  
---  
  
### 4. Install Certbot and obtain SSL certificates (Let’s Encrypt)  
  
We’ll use Certbot with the Nginx plugin so that it can automatically edit your Nginx configs and set up HTTPS + redirects.  
  
#### 4.1. Install Certbot (Ubuntu via snap)  
  
On recent Ubuntu versions, the recommended way is via `snapd`:  
  
```bash  
sudo apt updatesudo apt install -y snapdsudo snap install coresudo snap refresh coresudo snap install --classic certbotsudo ln -s /snap/bin/certbot /usr/bin/certbot```  
  
If `snapd` is not available, you can use `apt` packages instead, but the above is the standard method.  
  
#### 4.2. Run Certbot for your two subdomains  
  
Make sure that:  
- DNS for `pre.140d.art` and `api.pre.140d.art` is already pointing to your Elastic IP.  
- Nginx is running and serving both domains on port 80.  
  
Then run:  
  
```bash  
sudo certbot --nginx -d pre.140d.art -d api.pre.140d.art```  
  
What will happen:  
1. Certbot will detect your Nginx server blocks for those domains.  
2. It will perform the HTTP-01 challenge to prove you control the domains.  
3. It will obtain a certificate that covers **both** `pre.140d.art` and `api.pre.140d.art`.  
4. It will **modify your Nginx config** to:  
   - Add `listen 443 ssl;` blocks.  
   - Reference the `ssl_certificate` and `ssl_certificate_key` files.  
   - Optionally redirect HTTP (`:80`) to HTTPS (`:443`) if you say yes when prompted.  
  
During the prompts:  
- Provide an **email address** (for renewal/expiration notices).  
- Agree to the terms.  
- Choose whether you want **HTTP to HTTPS redirect**. Usually select the option that **redirects all traffic to HTTPS**.  
  
If successful, Certbot will print `Congratulations! Your certificate and chain have been saved at ...`.  
  
#### 4.3. Verify HTTPS  
  
Open in your browser:  
  
- `https://pre.140d.art`  
- `https://api.pre.140d.art`  
  
You should see:  
- A valid padlock / secure connection.  
- A certificate issued by **Let’s Encrypt**.  
  
You can also inspect the certificate details in your browser to verify the subjects include `pre.140d.art` and `api.pre.140d.art`.  
  
---  
  
### 5. Automatic renewal of certificates  
  
Let’s Encrypt certificates are typically valid for 90 days. Certbot (via snap) normally installs a systemd timer that runs `certbot renew` twice daily.  
  
#### 5.1. Test renewal  
  
Run this manual dry-run test:  
  
```bash  
sudo certbot renew --dry-run```  
  
You should see messages indicating that a simulated renewal succeeded. If there are errors, solve them now (often missing permissions or Nginx not running).  
  
#### 5.2. Check the timer (optional)  
  
On a systemd-based OS:  
  
```bash  
systemctl list-timers | grep certbot```  
  
You should see a `certbot.timer` scheduled.  
  
---  
  
### 6. Adjust your Kuadrat configuration (optional but recommended)  
  
Now that you have proper domains and HTTPS, you may want to update environment variables in your Kuadrat project so URLs are consistent.  
  
Examples (based on the `.env` fragment you showed):  
  
- For the **API** server `.env`:  
  - `CLIENT_URL` might become:  
    ```env  
    CLIENT_URL=https://pre.140d.art  
    ```  - `SITE_PUBLIC_BASE_URL` (if this is meant to be your staging URL):  
    ```env  
    SITE_PUBLIC_BASE_URL=https://pre.140d.art  
    ```  
- For the **client** `.env.local`, ensure API calls go to:  
  ```env  
  NEXT_PUBLIC_API_BASE_URL=https://api.pre.140d.art  
  ```  
After changing these, restart your containers or Node processes so they pick up the new environment variables.
  
---  

### 7. Quick checklist / troubleshooting

If something doesn’t work, check the following:

#### 7.1. DNS
- `nslookup pre.140d.art` → returns `15.216.4.230`.
- `nslookup api.pre.140d.art` → returns `15.216.4.230`.

If not, fix DNS in GoDaddy and wait for propagation.

#### 7.2. EC2 networking
- Security group allows `80` and `443` from `0.0.0.0/0`.
- No OS firewall blocking those ports (`sudo ufw status`).

#### 7.3. Nginx
- `sudo nginx -t` → configuration is OK.
- `sudo systemctl status nginx` → active (running).
- The `server_name` directives in your Nginx configs exactly match `pre.140d.art` and `api.pre.140d.art`.

#### 7.4. Backend services
- `curl http://127.0.0.1:3000` and `curl http://127.0.0.1:3001` from the EC2 instance return content.
- If using Docker, containers expose the correct host ports.

#### 7.5. Certbot
- `sudo certbot certificates` → shows a certificate for `pre.140d.art` and `api.pre.140d.art`.
- If certificate creation fails, check:
    - DNS is correct and has propagated.
    - Nginx is listening on port 80 for those domains.
    - No other service is binding port 80.

---  

### 8. Summary of concrete commands

For quick reference, here’s a condensed list of the core commands you’ll run on the EC2 instance (Ubuntu style):

```bash  
# 1) Install Nginx  
sudo apt update  
sudo apt install -y nginx  
  
# 2) Create Nginx configs  
sudo nano /etc/nginx/sites-available/pre.140d.art  
# (paste the pre.140d.art server block)  
  
sudo nano /etc/nginx/sites-available/api.pre.140d.art  
# (paste the api.pre.140d.art server block)  
  
sudo ln -s /etc/nginx/sites-available/pre.140d.art /etc/nginx/sites-enabled/  
sudo ln -s /etc/nginx/sites-available/api.pre.140d.art /etc/nginx/sites-enabled/  
  
sudo rm /etc/nginx/sites-enabled/default 2>/dev/null || true  
  
sudo nginx -t  
sudo systemctl reload nginx  
  
# 3) Install Certbot via snap  
sudo apt install -y snapd  
sudo snap install core  
sudo snap refresh core  
sudo snap install --classic certbot  
sudo ln -s /snap/bin/certbot /usr/bin/certbot  
  
# 4) Obtain and install certificates  
sudo certbot --nginx -d pre.140d.art -d api.pre.140d.art  
  
# 5) Test renewal  
sudo certbot renew --dry-run  
```  

If you share which Linux distribution/AMI you’re using or whether Kuadrat runs under Docker Compose, I can adapt the Nginx + Certbot configuration more precisely to your setup.