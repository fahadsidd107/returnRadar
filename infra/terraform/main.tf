terraform {
  required_version = "~> 1.17.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "6.16.0" }
  }
}
provider "aws" { region = var.region }
variable "region" { default = "eu-central-1" }
variable "name" { default = "return-radar-staging" }
variable "vpc_id" { type = string }
variable "private_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 3
    error_message = "Supply three approved private subnets in distinct availability zones with egress configured."
  }
}
variable "operator_cidrs" {
  type = list(string)
  validation {
    condition     = length(var.operator_cidrs) > 0 && !contains(var.operator_cidrs, "0.0.0.0/0")
    error_message = "Restrict EKS administration to explicit operator CIDRs."
  }
}
variable "kubernetes_version" {
  type        = string
  description = "Choose a currently standard-supported EKS version at deployment time."
}
variable "document_bucket_name" { type = string }
data "aws_caller_identity" "current" {}
resource "aws_iam_role" "cluster" {
  name               = "${var.name}-cluster"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "eks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}
resource "aws_eks_cluster" "radar" {
  name                      = var.name
  role_arn                  = aws_iam_role.cluster.arn
  version                   = var.kubernetes_version
  enabled_cluster_log_types = ["api", "audit", "authenticator"]
  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.operator_cidrs
  }
  depends_on = [aws_iam_role_policy_attachment.cluster]
}
resource "aws_iam_role" "node" {
  name               = "${var.name}-node"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "node" {
  for_each   = toset(["AmazonEKSWorkerNodePolicy", "AmazonEKS_CNI_Policy", "AmazonEC2ContainerRegistryReadOnly"])
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/${each.value}"
}
resource "aws_eks_node_group" "radar" {
  cluster_name    = aws_eks_cluster.radar.name
  node_group_name = "application"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = ["t3.large"]
  scaling_config {
    desired_size = 2
    min_size     = 2
    max_size     = 3
  }
  depends_on = [aws_iam_role_policy_attachment.node]
}
resource "aws_security_group" "database" {
  name   = "${var.name}-database"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.radar.vpc_config[0].cluster_security_group_id]
  }
}
resource "aws_db_subnet_group" "radar" {
  name       = var.name
  subnet_ids = var.private_subnet_ids
}
resource "aws_db_instance" "radar" {
  identifier                  = var.name
  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = "db.t4g.small"
  allocated_storage           = 30
  storage_encrypted           = true
  db_name                     = "radar"
  username                    = "radar_admin"
  manage_master_user_password = true
  publicly_accessible         = false
  multi_az                    = true
  backup_retention_period     = 7
  deletion_protection         = true
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-final"
  db_subnet_group_name        = aws_db_subnet_group.radar.name
  vpc_security_group_ids      = [aws_security_group.database.id]
}
resource "aws_s3_bucket" "documents" { bucket = var.document_bucket_name }
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.documents.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Sid = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}
resource "aws_s3_bucket_lifecycle_configuration" "staging" {
  bucket = aws_s3_bucket.documents.id
  rule {
    id     = "expire-staging"
    status = "Enabled"
    filter { prefix = "staging/" }
    expiration { days = 1 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
output "cluster_name" { value = aws_eks_cluster.radar.name }
output "database_endpoint" { value = aws_db_instance.radar.endpoint }
output "database_secret_arn" { value = aws_db_instance.radar.master_user_secret[0].secret_arn }
output "document_bucket" { value = aws_s3_bucket.documents.id }
# Workload IAM, ingress/TLS and production mail DNS remain deployment prerequisites.
resource "aws_security_group" "kafka" {
  name   = "${var.name}-kafka"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.radar.vpc_config[0].cluster_security_group_id]
  }
  ingress {
    from_port = 9094
    to_port   = 9094
    protocol  = "tcp"
    self      = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
variable "kafka_version" {
  type        = string
  description = "A currently supported MSK Kafka version selected during authorised deployment."
}
resource "aws_msk_cluster" "radar" {
  cluster_name           = var.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = 3
  broker_node_group_info {
    instance_type   = "kafka.t3.small"
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.kafka.id]
    storage_info {
      ebs_storage_info {
        volume_size = 20
      }
    }
  }
  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }
  client_authentication { unauthenticated = true }
}
output "kafka_brokers_tls" { value = aws_msk_cluster.radar.bootstrap_brokers_tls }
