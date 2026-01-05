# S3 bucket outputs
output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.client_app.id
}

output "s3_website_endpoint" {
  description = "Website endpoint URL"
  value       = aws_s3_bucket_website_configuration.client_app.website_endpoint
}

output "s3_website_domain" {
  description = "Website domain"
  value       = aws_s3_bucket_website_configuration.client_app.website_domain
}

# Lambda and API Gateway outputs
output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_stage.api.invoke_url
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.api.arn
}

output "lambda_deployment_bucket" {
  description = "S3 bucket for Lambda deployments"
  value       = aws_s3_bucket.lambda_deployments.id
}

# GitHub Actions IAM user outputs
output "github_actions_access_key_id" {
  description = "Access key ID for GitHub Actions deployment user"
  value       = aws_iam_access_key.github_actions_deploy.id
}

output "github_actions_secret_access_key" {
  description = "Secret access key for GitHub Actions deployment user"
  value       = aws_iam_access_key.github_actions_deploy.secret
  sensitive   = true
}

output "random_suffix" {
  description = "Random suffix used for resource naming"
  value       = random_string.bucket_suffix.result
}

output "aws_region" {
  description = "AWS region where resources are deployed"
  value       = var.aws_region
}

# Secrets Manager outputs
output "s3_bucket_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the S3 bucket name"
  value       = aws_secretsmanager_secret.s3_bucket_client.arn
}

output "s3_bucket_secret_name" {
  description = "Name of the Secrets Manager secret containing the S3 bucket name"
  value       = aws_secretsmanager_secret.s3_bucket_client.name
}

# Lambda Secrets Manager outputs
output "lambda_bucket_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the Lambda deployment bucket name"
  value       = aws_secretsmanager_secret.lambda_bucket.arn
}

output "lambda_bucket_secret_name" {
  description = "Name of the Secrets Manager secret containing the Lambda deployment bucket name"
  value       = aws_secretsmanager_secret.lambda_bucket.name
}

output "lambda_function_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the Lambda function name"
  value       = aws_secretsmanager_secret.lambda_function.arn
}

output "lambda_function_secret_name" {
  description = "Name of the Secrets Manager secret containing the Lambda function name"
  value       = aws_secretsmanager_secret.lambda_function.name
}

output "api_gateway_url_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the API Gateway URL"
  value       = aws_secretsmanager_secret.api_gateway_url.arn
}

output "api_gateway_url_secret_name" {
  description = "Name of the Secrets Manager secret containing the API Gateway URL"
  value       = aws_secretsmanager_secret.api_gateway_url.name
}

# DynamoDB outputs
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.main.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.main.arn
}
