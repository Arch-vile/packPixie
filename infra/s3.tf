# S3 bucket for hosting the client application
resource "aws_s3_bucket" "client_app" {
  bucket = "pack-pixie-client-app-${random_string.bucket_suffix.result}"
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
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
