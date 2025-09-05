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
