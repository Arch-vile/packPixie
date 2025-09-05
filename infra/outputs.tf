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
