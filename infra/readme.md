# Infra

## Installing tools

Install Terraform

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

Install aws command line tools:

```
brew install awscli
```

and configure:

```bash
aws configure
```

## Setting up s3 bucket for Terraform state

Manual step needed as Terraform cannot run any actions without a state storage.

Creating the bucket:

```bash
aws s3api create-bucket --bucket pack-pixie-terraform-state --region us-east-1
```

Enable versioning:

```bash
aws s3api put-bucket-versioning --bucket pack-pixie-terraform-state --versioning-configuration Status=Enabled
```

Block public access:

```bash
aws s3api put-public-access-block --bucket pack-pixie-terraform-state  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Set encryption:

```bash
aws s3api put-bucket-encryption --bucket pack-pixie-terraform-state --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

Enforce TLS:

```bash
aws s3api put-bucket-policy \
  --bucket pack-pixie-terraform-state \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::pack-pixie-terraform-state","arn:aws:s3:::pack-pixie-terraform-state/*"],
      "Condition": {"Bool": {"aws:SecureTransport": "false"}}
    }]
  }'
```

Create DynamoDB lock table

```bash
aws dynamodb create-table \
  --region=us-east-1 \
  --table-name pack-pixie-tf-state-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Setting up infra

Run the commands in the `infra` folder.

Setup Terraform:

```bash
terraform init -reconfigure -backend-config=backend.hcl
```

Create infra:

```bash
terraform apply
```

## Setting up Github

We'll need to setup AWS secrets in Github in order for our Github actions to be able to deploy our application.

In the `infra` folder run these to get the secrets:

```bash
terraform output s3_bucket_name
terraform output github_actions_access_key_id
terraform output -raw github_actions_secret_access_key
```

### Add Secrets to GitHub

Set the required secrets to Github:

1. Go to your GitHub repository
1. Navigate to Settings → Secrets and variables → Actions
1. Add these repository secrets:
   AWS_ACCESS_KEY_ID - Use the value from terraform output github_actions_access_key_id
   AWS_SECRET_ACCESS_KEY - Use the value from terraform output github_actions_secret_access_key
   S3_BUCKET_NAME - Use the value from terraform output s3_bucket_name
