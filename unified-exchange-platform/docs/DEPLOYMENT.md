# Deployment Guide

## Prerequisites

- AWS Account with EKS enabled
- `kubectl` configured for EKS cluster
- `docker` for image building
- `terraform` for infrastructure

## Infrastructure Setup (AWS)

### 1. Terraform Variables

Create `infra/terraform/prod.tfvars`:
```hcl
aws_region = "us-east-1"
environment = "production"
vpc_id = "vpc-xxxxx"
subnet_ids = ["subnet-xxxx", "subnet-yyyy", "subnet-zzzz"]
node_desired_size = 5
node_max_size = 20
node_min_size = 3
```

### 2. Deploy Infrastructure

```bash
cd infra/terraform
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

This creates:
- EKS cluster (3 nodes)
- RDS PostgreSQL (multi-AZ)
- ElastiCache Redis
- MSK Kafka cluster
- Security groups & networking

### 3. Save Outputs

```bash
terraform output > outputs.json
# Note: RDS endpoint, Redis endpoint, etc.
```

## Container Image Building

### Build Images

```bash
# Backend
docker build -t ghcr.io/yourorg/kk99-backend:1.0.0 apps/backend/
docker push ghcr.io/yourorg/kk99-backend:1.0.0

# Engine (if using containerized Rust)
docker build -t ghcr.io/yourorg/kk99-engine:1.0.0 apps/engine/

# Web
docker build -t ghcr.io/yourorg/kk99-web:1.0.0 apps/web/
```

## Kubernetes Deployment

### 1. Update Manifests

Edit `infra/kubernetes/04-backend.yaml`:
- Update image URLs to your registry
- Update RDS endpoint in ConfigMap
- Update environment variables

### 2. Deploy to EKS

```bash
# Configure kubectl
aws eks update-kubeconfig --name kk99-exchange --region us-east-1

# Run deployment script
bash scripts/deploy-eks.sh
```

Or manual deployment:
```bash
kubectl apply -f infra/kubernetes/01-vault.yaml
kubectl wait --for=condition=Ready pod -l app=vault -n exchange --timeout=300s

kubectl apply -f infra/kubernetes/02-postgres.yaml
# Wait for postgres...

kubectl apply -f infra/kubernetes/03-kafka.yaml
kubectl wait --for=condition=Ready pod -l app=kafka -n exchange --timeout=600s

kubectl apply -f infra/kubernetes/04-backend.yaml
```

## Production Checklist

### Pre-Deployment
- [ ] TLS certificates acquired and imported
- [ ] DNS records updated
- [ ] Secrets migrated to AWS Secrets Manager
- [ ] Database backups configured
- [ ] Monitoring alerts configured
- [ ] SSL termination tested
- [ ] Load balancer health checks verified

### Post-Deployment
- [ ] Application health check passes
- [ ] API endpoints responding
- [ ] Database replication working
- [ ] Kafka cluster healthy
- [ ] Monitoring dashboards updated
- [ ] Load test passed
- [ ] Backup restore tested
- [ ] Disaster recovery tested

## SSL/TLS Configuration

### Using AWS Certificate Manager

```bash
# Request certificate
aws acm request-certificate \
  --domain-name api.exchange.kk99.io \
  --subject-alternative-names api-*.exchange.kk99.io \
  --region us-east-1

# Note certificate ARN, use in ALB
```

### Kubernetes Ingress with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: backend-ingress
  namespace: exchange
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.exchange.kk99.io
    secretName: backend-tls
  rules:
  - host: api.exchange.kk99.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend-api
            port:
              number: 3000
```

## Monitoring & Logging

### CloudWatch Integration

```bash
# Enable CloudWatch logs for EKS
eksctl utils write-kubeconfig --cluster=kk99-exchange --region=us-east-1
kubectl apply -k "github.com/aws/amazon-cloudwatch-observability-addon/sample-cloudformation/eks"
```

### Grafana Dashboard

```bash
kubectl port-forward svc/grafana 3000:3000 -n exchange
# Open http://localhost:3000 (admin/admin)
```

## Scaling

### Horizontal Pod Autoscaler

```bash
# HPA already configured in 04-backend.yaml
# View HPA status
kubectl get hpa -n exchange

# Manual scaling
kubectl scale deployment backend-api --replicas=10 -n exchange
```

### Node Group Scaling

```bash
# Update Terraform
# Change node_desired_size in tfvars
terraform apply -var-file=prod.tfvars

# Or manual
aws eks update-nodegroup-config \
  --cluster-name kk99-exchange \
  --nodegroup-name kk99-nodes \
  --scaling-config minSize=3,maxSize=20,desiredSize=10 \
  --region us-east-1
```

## Upgrades

### Blue-Green Deployment

```bash
# Deploy new version with different label
kubectl set image deployment/backend-api \
  backend-api=ghcr.io/yourorg/kk99-backend:2.0.0 \
  -n exchange

# Monitor rollout
kubectl rollout status deployment/backend-api -n exchange
```

### Rollback

```bash
kubectl rollout undo deployment/backend-api -n exchange
```

## Backup & Disaster Recovery

### RDS Backups

```bash
# Automated backups (30 days)
# Already configured in terraform

# Manual backup
aws rds create-db-snapshot \
  --db-instance-identifier exchange-postgres \
  --db-snapshot-identifier exchange-backup-$(date +%s)
```

### Restore from Backup

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier exchange-postgres-restored \
  --db-snapshot-identifier exchange-backup-xxxxx
```

## Cost Optimization

### Reserved Instances

```bash
# Check current usage
aws ec2 describe-instances --query 'Reservations[].Instances[].[InstanceType,State.Name]'

# Purchase RIs for baseline load
aws ec2 describe-reserved-instances-offerings --filter Name=instance-type,Values=t3.xlarge
```

### Spot Instances

```hcl
# In terraform, use spot instances for non-critical workloads
instance_types = ["t3.xlarge", "t3a.xlarge"]
```

## Troubleshooting

### Pod Stuck in Pending

```bash
kubectl describe pod <pod-name> -n exchange
# Check: resource requests, node capacity, admission webhooks
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:16-alpine --restart=Never -- \
  psql -h postgres.exchange.svc.cluster.local -U exchange_user -d exchange_db
```

### High Latency

```bash
# Check pod distribution
kubectl get pods -n exchange -o wide

# Check network policies
kubectl get networkpolicies -n exchange
```

## Support

For deployment issues:
- Check EKS documentation: https://docs.aws.amazon.com/eks/
- Review CloudWatch logs
- Open issue in GitHub
- Contact: devops@kk99.io
