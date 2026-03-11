locals {
  app_name = "pack-pixie"
}

# ---------------------------------------------------------------------------
# Cognito User Pool
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool" "main" {
  name = "${local.app_name}-user-pool"

  # Sign-in with email as the username identifier
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Make email look-ups case-insensitive
  username_configuration {
    case_sensitive = false
  }

  # Secure password policy
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 1
  }

  # Mandatory 6-digit OTP delivered to the user's email on sign-up
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your PackPixie verification code"
    email_message        = "Welcome to PackPixie! Your verification code is <strong>{####}</strong>. It expires in 24 hours."
  }

  # Account recovery via verified email only
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Retain the user pool on destroy to avoid accidental data loss
  deletion_protection = "ACTIVE"

  tags = {
    Project = local.app_name
  }
}

# ---------------------------------------------------------------------------
# Cognito User Pool Client  (React / SPA — no client secret)
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.app_name}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # SPA clients must NOT have a secret
  generate_secret = false

  # Auth flows required by Amplify-free SRP authentication
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Token validity windows
  access_token_validity  = 1   # hours
  id_token_validity      = 1   # hours
  refresh_token_validity = 30  # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user-existence errors leaking during sign-in
  prevent_user_existence_errors = "ENABLED"
}

# ---------------------------------------------------------------------------
# Secrets Manager — Cognito IDs (consumed by GitHub Actions VITE build)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "cognito_user_pool_id" {
  name        = "pack-pixie/cognito-user-pool-id"
  description = "Cognito User Pool ID for Pack Pixie"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "cognito_user_pool_id" {
  secret_id     = aws_secretsmanager_secret.cognito_user_pool_id.id
  secret_string = aws_cognito_user_pool.main.id
}

resource "aws_secretsmanager_secret" "cognito_user_pool_client_id" {
  name        = "pack-pixie/cognito-user-pool-client-id"
  description = "Cognito User Pool Client ID for Pack Pixie"

  tags = {
    Application = "PackPixie"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "cognito_user_pool_client_id" {
  secret_id     = aws_secretsmanager_secret.cognito_user_pool_client_id.id
  secret_string = aws_cognito_user_pool_client.web.id
}
