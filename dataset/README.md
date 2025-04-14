# FidEx Dataset

This dataset is designed to support experiments and analysis of fidelity violations in archived web pages. The experiments were conducted using **pywb 2.8.3**. The dataset is hosted on Azure Blob Storage and is available as `.tar.gz` archives.

> **Note**: FidEx includes additional instrumentation in `wombat.js` for silent error detection. To enable this feature, replace the `pywb/static/wombat.js` in **pywb** with the version provided at [`src_changed/pywb/static/wombat.js`](../src_changed/pywb/static/wombat.js).

## Dataset Overview

The dataset has three parts:

1. **Metadata**: Provides information about each page load, including its directory, collection, and URL during loading.
2. **Example Dataset**: A small set of page examples with fidelity violations, pinpointed errors, and instrumentation data.
3. **Full Dataset**: Comprehensive data for all pages detected with fidelity violations by FidEx.

### Metadata

The metadata includes the following files and directories:
```
├── detection
│   └── detection.json
├── metadata.json
└── pinpoint
    ├── error_cluster.json
    ├── pinpoint_examples.json
    └── pinpoint.json
```

- **`metadata.json`**: Lists each page load's directory (or hostname), the collection it belongs to, and the URL during loading.
- **`detection/detection.json`**: Contains all loads detected with fidelity violations. Each object includes:
  - `diff`: FidEx's detection result (if there are violations).
  - `screenshot_diff`: Whether screenshots differ.
  - `more_errs_diff`: Whether the archive has more errors.
  - `html_text_diff`: Whether extracted HTML texts differ.
  - `*_diff_stage`: The interaction stage after which a metric flags a difference.
- **`pinpoint/`**: Contains clustered errors and pinpointed errors for archive copies with fidelity violations, for both the full dataset and the example dataset.

### Example and Complete Datasets

Both datasets include the following directory structure for each collection (example dataset only has 1 collection):
```
├── instrumentations
└── warcs
```

> **Note**: For the complete dataset, to determine which page load belongs to which collection, refer to the `sub_archive` attribute in `metadata.json` within the metadata dataset.

- **`warcs/`**: Contains WARC files for each page load.
- **`instrumentations/`**: Contains instrumentation data for each load. Detailed structure is in [`instrumentation_tree.md`](instrumentation_tree.md).

## Download Links

The dataset is available for download as `.tar.gz` archives:

- [Metadata](https://fidexdataset.blob.core.windows.net/dataset/metadata.tar.gz)
- [Example Dataset](https://fidexdataset.blob.core.windows.net/dataset/examples.tar.gz)
- **Full Dataset**: The full dataset is split into multiple `.tar.gz` archives. The list of links is available in the [`collections_list.json`](collections_list.json)