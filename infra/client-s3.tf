# Data source to get current AWS account ID
data "aws_caller_identity" "current" {}

# S3 bucket for hosting the client application
resource "aws_s3_bucket" "client_app" {
  bucket = "pack-pixie-client-app-${random_string.bucket_suffix.result}"
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# IAM user for GitHub Actions deployment
resource "aws_iam_user" "github_actions_deploy" {
  name = "github-actions-deploy-${random_string.bucket_suffix.result}"
  path = "/"

  tags = {
    Description = "IAM user for GitHub Actions to deploy client app to S3"
  }
}

# IAM policy for S3 deployment permissions
resource "aws_iam_policy" "github_actions_s3_deploy" {
  name        = "github-actions-s3-deploy-${random_string.bucket_suffix.result}"
  description = "Policy for GitHub Actions to deploy to S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.client_app.arn,
          "${aws_s3_bucket.client_app.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:pack-pixie/*"
      }
    ]
  })
}

# Attach policy to user
resource "aws_iam_user_policy_attachment" "github_actions_deploy" {
  user       = aws_iam_user.github_actions_deploy.name
  policy_arn = aws_iam_policy.github_actions_s3_deploy.arn
}

# Create access key for the user
resource "aws_iam_access_key" "github_actions_deploy" {
  user = aws_iam_user.github_actions_deploy.name
}

# Enable versioning
resource "aws_s3_bucket_versioning" "client_app" {
  bucket = aws_s3_bucket.client_app.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure static website hosting
resource "aws_s3_bucket_website_configuration" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "error.html"
  }
}

# Public access block configuration
resource "aws_s3_bucket_public_access_block" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Bucket policy for public read access
resource "aws_s3_bucket_policy" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.client_app.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.client_app]
}

# CORS configuration for web applications
resource "aws_s3_bucket_cors_configuration" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "client_app" {
  bucket = aws_s3_bucket.client_app.id

  rule {
    id     = "cleanup_old_versions"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# AWS Secrets Manager secret for S3 bucket name
resource "aws_secretsmanager_secret" "s3_bucket_client" {
  name        = "pack-pixie/s3-bucket-client"
  description = "S3 bucket name for Pack Pixie client app"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "s3_bucket_client" {
  secret_id     = aws_secretsmanager_secret.s3_bucket_client.id
  secret_string = aws_s3_bucket.client_app.id
}
