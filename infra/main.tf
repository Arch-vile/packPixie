terraform {
  backend "s3" {}  # settings supplied via backend.hcl at init time

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.12"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = var.aws_region
}
