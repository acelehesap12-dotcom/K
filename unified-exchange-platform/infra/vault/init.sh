#!/bin/bash
# Vault initialization script for exchange platform

set -e

VAULT_ADDR="http://localhost:8200"
VAULT_TOKEN="root"

echo "Waiting for Vault to be ready..."
until curl -s $VAULT_ADDR/v1/sys/health > /dev/null; do
  sleep 2
done

export VAULT_ADDR
export VAULT_TOKEN

echo "Enabling KV v2 secrets engine..."
vault secrets enable -path=secret kv-v2 || true

echo "Creating secrets for wallet addresses..."
vault kv put secret/wallets \
  eth_address="0x163c9a2fa9eaf8ebc5bb5b8f8e916eb8f24230a1" \
  sol_address="Gp4itYBqqkNRNYtC22QAPyTThPB6Kzx8M1yy2rpXBGxbc" \
  trx_address="THbevzbdxMmUNaN3XFWPkaJe8oSq2C2739" \
  btc_address="bc1pzmdep9lzgzswy0nmepvwmexj286kufcfwjfy4fd6dwuedzltntxse9xmz8"

echo "Creating admin auth policy..."
vault policy write admin - <<EOF
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/leases/revoke/*" {
  capabilities = ["update"]
}
EOF

echo "Creating service account..."
vault auth enable userpass || true
vault write auth/userpass/users/berkecansuskun1998@gmail.com \
  password="$(openssl rand -hex 32)" \
  policies="admin"

echo "Vault initialization complete!"
