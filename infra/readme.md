# Infra

## Setting up s3 bucket for Terraform state

Manual step needed as Terraform cannot run any actions without a state storage.

Setting up account config:

```bash
aws configure
```

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
