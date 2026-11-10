# Deployment

No deployment has been authorised or performed. Local Docker availability is not production availability. Candidate target: AWS managed Kubernetes, RDS PostgreSQL with vector extension, MSK, S3 and SES; cost estimation and approval required before provisioning. Terraform, Helm, Argo CD and observability configuration remain planned until verified. Do not buy services or publish without explicit approval. Separate liveness/readiness and migration jobs; non-root multi-stage images; secret references rather than committed secrets.
