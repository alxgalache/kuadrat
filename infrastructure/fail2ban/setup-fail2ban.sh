#!/bin/bash

# Fail2ban Setup Script for Kuadrat
# Run this script on your EC2 instance with sudo

set -e

echo "=========================================="
echo "Installing and Configuring Fail2ban"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi

# Install fail2ban
echo "[1/5] Installing fail2ban..."
case $OS in
    ubuntu|debian)
        apt update
        apt install -y fail2ban
        ;;
    amzn|rhel|centos|fedora)
        yum install -y epel-release || true
        yum install -y fail2ban
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Stop fail2ban to configure
echo "[2/5] Stopping fail2ban for configuration..."
systemctl stop fail2ban || true

# Backup existing configuration
echo "[3/5] Backing up existing configuration..."
if [ -f /etc/fail2ban/jail.local ]; then
    cp /etc/fail2ban/jail.local /etc/fail2ban/jail.local.backup.$(date +%Y%m%d)
fi

# Copy configuration files
echo "[4/5] Copying configuration files..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy jail.local
cp "$SCRIPT_DIR/jail.local" /etc/fail2ban/jail.local

# Copy filter files
cp "$SCRIPT_DIR/filter.d/kuadrat-scanner.conf" /etc/fail2ban/filter.d/
cp "$SCRIPT_DIR/filter.d/kuadrat-rce-attempt.conf" /etc/fail2ban/filter.d/
cp "$SCRIPT_DIR/filter.d/kuadrat-api-abuse.conf" /etc/fail2ban/filter.d/

# Set correct permissions
chmod 644 /etc/fail2ban/jail.local
chmod 644 /etc/fail2ban/filter.d/kuadrat-*.conf

# Start and enable fail2ban
echo "[5/5] Starting fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Show status
echo ""
echo "=========================================="
echo "Fail2ban Installation Complete!"
echo "=========================================="
echo ""
echo "Current status:"
systemctl status fail2ban --no-pager
echo ""
echo "Active jails:"
fail2ban-client status
echo ""
echo "Useful commands:"
echo "  - Check jail status: fail2ban-client status kuadrat-scanner"
echo "  - Unban an IP: fail2ban-client set kuadrat-scanner unbanip <IP>"
echo "  - Check banned IPs: fail2ban-client status kuadrat-scanner"
echo "  - View fail2ban logs: tail -f /var/log/fail2ban.log"
echo ""
