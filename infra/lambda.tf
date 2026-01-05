# Lambda execution role
resource "aws_iam_role" "lambda_execution_role" {
  name = "pack-pixie-lambda-execution-role-${random_string.bucket_suffix.result}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "PackPixie Lambda Execution Role"
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# S3 bucket for Lambda deployment packages
resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "pack-pixie-lambda-deployments-${random_string.bucket_suffix.result}"

  tags = {
    Name = "PackPixie Lambda Deployments"
  }
}

# Enable versioning for Lambda deployment bucket
resource "aws_s3_bucket_versioning" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access to Lambda deployment bucket
resource "aws_s3_bucket_public_access_block" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption for Lambda deployment bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "api_lambda_logs" {
  name              = "/aws/lambda/pack-pixie-api-${random_string.bucket_suffix.result}"
  retention_in_days = 14

  tags = {
    Name = "PackPixie API Lambda Logs"
  }
}

# Lambda function
resource "aws_lambda_function" "api" {
  function_name = "pack-pixie-api-${random_string.bucket_suffix.result}"
  role          = aws_iam_role.lambda_execution_role.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  # Placeholder for deployment package - will be updated by CI/CD
  filename         = "placeholder.zip"
  source_code_hash = data.archive_file.placeholder_zip.output_base64sha256

  environment {
    variables = {
      NODE_ENV       = "production"
      DYNAMODB_TABLE = aws_dynamodb_table.main.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.api_lambda_logs,
  ]

  tags = {
    Name = "PackPixie API"
  }
}

# Create a placeholder zip file for initial deployment
data "archive_file" "placeholder_zip" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"
  
  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder' });"
    filename = "index.js"
  }
}

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "api" {
  name          = "pack-pixie-api-${random_string.bucket_suffix.result}"
  protocol_type = "HTTP"
  description   = "PackPixie API Gateway"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    max_age          = 86400
  }

  tags = {
    Name = "PackPixie API Gateway"
  }
}

# API Gateway stage
resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  tags = {
    Name = "PackPixie API Gateway Stage"
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/pack-pixie-${random_string.bucket_suffix.result}"
  retention_in_days = 14

  tags = {
    Name = "PackPixie API Gateway Logs"
  }
}

# Lambda integration with API Gateway
resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.api.invoke_arn
}

# API Gateway route (catch-all)
resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# IAM policy for GitHub Actions to deploy Lambda
resource "aws_iam_policy" "github_actions_lambda_deploy" {
  name        = "github-actions-lambda-deploy-${random_string.bucket_suffix.result}"
  description = "Policy for GitHub Actions to deploy Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:PublishVersion"
        ]
        Resource = aws_lambda_function.api.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.lambda_deployments.arn}/*"
      }
    ]
  })
}

# Attach Lambda deployment policy to GitHub Actions user
resource "aws_iam_user_policy_attachment" "github_actions_lambda_deploy" {
  user       = aws_iam_user.github_actions_deploy.name
  policy_arn = aws_iam_policy.github_actions_lambda_deploy.arn
}
# AWS Secrets Manager secrets for Lambda configuration
resource "aws_secretsmanager_secret" "lambda_bucket" {
  name        = "pack-pixie/lambda-bucket"
  description = "S3 bucket name for Pack Pixie Lambda deployments"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "lambda_bucket" {
  secret_id     = aws_secretsmanager_secret.lambda_bucket.id
  secret_string = aws_s3_bucket.lambda_deployments.id
}

resource "aws_secretsmanager_secret" "lambda_function" {
  name        = "pack-pixie/lambda-function"
  description = "Lambda function name for Pack Pixie API"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "lambda_function" {
  secret_id     = aws_secretsmanager_secret.lambda_function.id
  secret_string = aws_lambda_function.api.function_name
}

resource "aws_secretsmanager_secret" "api_gateway_url" {
  name        = "pack-pixie/api-gateway-url"
  description = "API Gateway URL for Pack Pixie API"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "api_gateway_url" {
  secret_id     = aws_secretsmanager_secret.api_gateway_url.id
  secret_string = aws_apigatewayv2_stage.api.invoke_url
}
