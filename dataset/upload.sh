#!/bin/bash

az storage blob upload \
  --account-name fidexdataset \
  --container-name dataset \
  --name common_pinpoint.tar.gz \
  --file /vault-swift/jingyz/fidex-dataset-examples/common_pinpoint.tar.gz


# az storage container list \
#   --account-name fidexdataset \
#   --auth-mode login \
#   --output table

# az storage container set-permission \
#   --account-name fidexdataset \
#   --name dataset \
#   --public-access blob \
#   --auth-mode login


# az storage account update \
#   --name fidexdataset \
#   --resource-group jingyz-fidex \
#   --allow-blob-public-access true