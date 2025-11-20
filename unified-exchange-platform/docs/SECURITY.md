# Security Configuration for KK99 Exchange

## Vault Setup

### Secret Management
Vault stores all sensitive data:
- Wallet private keys (never in code)
- Database credentials
- API keys (Binance, Polygon, Bloomberg)
- JWT secrets
- TLS certificates

### HSM Integration
For production HSM support:
```bash
vault secrets enable transit
vault write -f transit/keys/exchange
```

## Wallet Security

### Root of Trust Wallet Addresses
Stored in Vault with no expiry:
```
- ETH:  0x163c9a2fa9eaf8ebc5bb5b8f8e916eb8f24230a1
- SOL:  Gp4itYBqqkNRNYtC22QAPyTThPB6Kzx8M1yy2rpXBGxbc
- TRX:  THbevzbdxMmUNaN3XFWPkaJe8oSq2C2739
- BTC:  bc1pzmdep9lzgzswy0nmepvwmexj286kufcfwjfy4fd6dwuedzltntxse9xmz8
```

### Dynamic Wallet Management
New user wallets are generated per chain and verified via blockchain.

## Admin Access

### Single Admin Account
- Email: `berkecansuskun1998@gmail.com`
- All admin operations require JWT from this account
- IP whitelisting recommended

### Audit Trail
All admin actions logged to:
- Elasticsearch (searchable)
- PostgreSQL (permanent record)
- S3 (archive)

## TLS & Encryption

### Certificate Management
```bash
certbot certonly --standalone -d api.exchange.kk99.io
```

### In-Transit Encryption
- All APIs: TLS 1.3
- Kafka: SSL/TLS between brokers
- Database: SSL connections only

### At-Rest Encryption
- RDS: AWS KMS encryption
- Secrets: Vault encryption
- Logs: Encrypted S3 storage

## Network Security

### Kubernetes Network Policies
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: exchange-default-deny
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Security Groups
- Backend: 3000 → 3001
- Database: 5432 (internal only)
- Kafka: 9092 (internal only)
- Vault: 8200 (internal only)

## Authentication & Authorization

### JWT Claims
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "username": "username",
  "roles": ["trader", "admin"],
  "iat": 1234567890,
  "exp": 1234571490
}
```

### RBAC
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: trader
rules:
- apiGroups: [""]
  resources: ["trades", "orders"]
  verbs: ["get", "list", "create"]
```

## Audit Logging

### Events Logged
- User login/logout
- Order creation/cancellation
- Trade execution
- Deposit/withdrawal
- Admin configuration changes
- Failed authentication attempts

### Log Retention
- Hot: 30 days (Elasticsearch)
- Warm: 1 year (S3)
- Cold: 7 years (Glacier)

## Compliance

### SOC 2 Readiness
- ✅ Security controls documented
- ✅ Access controls
- ✅ Encryption
- ✅ Audit trails
- ✅ Incident response procedures

### GDPR
- ✅ Data anonymization
- ✅ Right to deletion
- ✅ Consent management
- ✅ Data portability

## Regular Security Tasks

### Weekly
- Review access logs
- Check certificate expiry
- Verify backup integrity

### Monthly
- Rotate JWT signing keys
- Update dependencies
- Run vulnerability scans

### Quarterly
- Penetration testing
- Compliance audit
- Disaster recovery drill

### Annually
- SOC 2 audit
- GDPR assessment
- Risk evaluation

## Incident Response

### Breach Protocol
1. Isolate affected systems
2. Notify users
3. Preserve evidence
4. File regulatory reports
5. Post-mortem analysis

### Contact
- Security: security@kk99.io
- Response Team: +1-xxx-xxx-xxxx
