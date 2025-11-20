variable "aws_region" {
  default = "us-east-1"
}

variable "environment" {
  default = "production"
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "db_allocated_storage" {
  default = 100
}

variable "node_desired_size" {
  default = 3
}

variable "node_max_size" {
  default = 10
}

variable "node_min_size" {
  default = 3
}
