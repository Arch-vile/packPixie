#!/bin/bash

set -e

echo "🚀 Building and deploying PackPixie API Lambda..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
API_DIR="$PROJECT_ROOT/apps/api"
BUILD_DIR="$PROJECT_ROOT/.deploy-build"
INFRA_DIR="$PROJECT_ROOT/infra"

# Get the bucket suffix from terraform output
cd "$INFRA_DIR"
BUCKET_SUFFIX=$(terraform output -raw random_suffix 2>/dev/null || echo "")

if [ -z "$BUCKET_SUFFIX" ]; then
  echo -e "${RED}❌ Error: Could not get bucket suffix from Terraform. Run terraform apply first.${NC}"
  exit 1
fi

AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

LAMBDA_BUCKET="pack-pixie-lambda-deployments-${BUCKET_SUFFIX}"
LAMBDA_FUNCTION="pack-pixie-api-${BUCKET_SUFFIX}"

echo -e "${BLUE}📦 Cleaning build directory...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo -e "${BLUE}🔨 Building TypeScript...${NC}"
cd "$PROJECT_ROOT"
pnpm --filter api run build

echo -e "${BLUE}📁 Copying built files...${NC}"
cp -r "$API_DIR/dist/"* "$BUILD_DIR/"

echo -e "${BLUE}📦 Installing production dependencies...${NC}"
cd "$BUILD_DIR"

# Create a minimal package.json for production dependencies
cat > package.json << 'EOF'
{
  "name": "api-deployment",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@fastify/aws-lambda": "^6.1.1",
    "@fastify/cors": "^11.1.0",
    "@fastify/helmet": "^13.0.1",
    "@fastify/sensible": "^6.0.3",
    "fastify": "^5.5.0"
  }
}
EOF

# Install dependencies
pnpm install --production --omit=dev

# Remove unnecessary files to reduce package size
rm -rf node_modules/.cache
rm -rf node_modules/.bin
find node_modules -name "*.md" -delete
find node_modules -name "*.ts" -delete
find node_modules -name "*.map" -delete
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true

echo -e "${BLUE}🗜️  Creating deployment package...${NC}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_FILE="lambda-deployment-${TIMESTAMP}.zip"

# Create zip file
zip -r -q "$ZIP_FILE" . -x "*.git*"

ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo -e "${GREEN}✅ Created deployment package: $ZIP_FILE ($ZIP_SIZE)${NC}"

echo -e "${BLUE}☁️  Uploading to S3...${NC}"
aws s3 cp "$ZIP_FILE" "s3://${LAMBDA_BUCKET}/${ZIP_FILE}" --region "$AWS_REGION"

echo -e "${BLUE}🔄 Updating Lambda function...${NC}"
aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION" \
  --s3-bucket "$LAMBDA_BUCKET" \
  --s3-key "$ZIP_FILE" \
  --region "$AWS_REGION" \
  --publish

echo -e "${GREEN}✅ Lambda function updated successfully!${NC}"

# Wait for the update to complete
echo -e "${BLUE}⏳ Waiting for Lambda to be ready...${NC}"
aws lambda wait function-updated --function-name "$LAMBDA_FUNCTION" --region "$AWS_REGION"

echo -e "${GREEN}✅ Lambda is ready!${NC}"

# Get the API Gateway URL
cd "$INFRA_DIR"
API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")

if [ -n "$API_URL" ]; then
  echo -e "${GREEN}🌐 API Gateway URL: ${API_URL}${NC}"
  echo -e "${BLUE}Testing endpoints:${NC}"
  echo -e "  Health: ${API_URL}/health"
  echo -e "  Status: ${API_URL}/api/status"
  echo -e "  Hello:  ${API_URL}/api/hello"
fi

echo -e "${GREEN}🎉 Deployment complete!${NC}"

# Cleanup
cd "$PROJECT_ROOT"
#rm -rf "$BUILD_DIR"
