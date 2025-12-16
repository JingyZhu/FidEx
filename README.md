# FidEx: Fidelity Detection for Web Archives

This repository contains the code and artifact for our NSDI 2026 paper "Detecting and Diagnosing Errors in Serving Archived Web Pages". FidEx reliably detects when an archived page differs from its original version and pinpoints the root cause.

## Paper

**Detecting and Diagnosing Errors in Serving Archived Web Pages**  
Jingyuan Zhu, Huanchen Sun, Harsha V. Madhyastha  
NSDI 2026

This artifact accompanies our NSDI 2026 paper. FidEx detects fidelity violations in archived web pages by:
- Comparing layout trees between live and archived versions
- Detecting silent JavaScript errors
- Analyzing screenshot differences
- Pinpointing root causes of fidelity violations

## Prerequisites (If not using Docker)

- Python 3.11
- Node.js 22
- Chrome for Testing (version 127 or later)
- We recommend running with at least 4 cores and 8GB of memory (we also test on Ubuntu 24.04)
- To run on large datasets, we recommend large storage.

## Container Setup

```sudo ./run-docker.sh``` should build and run the container end to end. If manually building and running, follow the instructions below.
### Building the Docker Image

The repository includes a Dockerfile that sets up all dependencies. Build the image using:

```bash
docker build -t fidex .
```

This will:
- Install Python 3.11 and Node.js 22
- Set up pywb (web archive replay system)
- Install all Python and Node.js dependencies
- Configure the FidEx environment

### Running the Container
```bash
docker run -it --rm \
    --name fidex \
    -p 5901:5901 \
    -e VNC_DISPLAY=1 \
    -v $(pwd)/fidelity-files/writes:/root/fidelity-files/writes \
    -v $(pwd)/fidelity-files/warcs:/root/fidelity-files/warcs \
    -v $(pwd)/measurement:/root/measurement \
    -v $(pwd)/fidex:/root/fidex \
    fidex
```

The container exposes:
- **Port 5901**: VNC server for graphical access (optional)
- **Volume mounts**: For persistent data storage

### Accessing the Container

Once the container is running, you'll be dropped into a bash shell. The working directory is `/root`.

## Artifact Evaluation

### Quick Start: Running a Simple Fidelity Check

1. **Enter the container** (if not already inside):
   ```bash
   docker exec -it fidex /bin/bash
   ```

2. **Activate the FidEx virtual environment**:
   ```bash
   source /root/venv/fidex/bin/activate
   ```

### Running Full Record/Replay Pipeline

The main evaluation pipeline involves three stages:

1. **Record stage** (capture live page):
   ```bash
   cd /root/measurement
   STAGE=record python auto_record_replay.py --input_file test_urls.json
   ```

2. **Proxy stage** (replay through proxy):
   ```bash
   STAGE=proxy python auto_record_replay.py --input_file test_urls.json
   ```

3. **Archive stage** (replay from archive):
   ```bash
   STAGE=archive python auto_record_replay.py --input_file test_urls.json
   ```

### Running Fidelity Detection

The `layout_diff.py` script compares layout trees between live and archived versions:

```bash
cd /root/measurement
python layout_diff.py fidelity \
    --base live \
    --comp archive \
    --input_file test_urls.json \
    --collection test
```

This will:
- Compare live (`--base live`) vs archived (`--comp archive`) versions
- Process URLs from the input file
- Generate difference reports in `diffs` (e.g., `diffs/archive/live_archive_test.json`)

### Running Error Pinpointing

The `error_pinpoint.py` script pinpoints errors in the archived version:

```bash
cd /root/measurement
python error_pinpoint.py \
    --base live \
    --comp archive \
    --input_file diffs/live_archive_test.json \
    --collection test
```

This will:
- Pinpoint errors in the archived version based on the diff file
- Generate error reports in `pinpoint` (e.g., `pinpoint/live_archive_test.json`)

### Expected Outputs

After running evaluations, you should see:

- **`fidelity-files/writes/`**: Contains recorded page data, screenshots, and instrumentation
- **`fidelity-files/warcs/`**: Contains WARC files for archived pages
- **`measurement/diffs/`**: Contains layout difference analysis results in JSON format

### Example Output Structure

```
fidelity-files/
├── writes/
│   └── test/
│       └── google.com_<hash>/
│           ├── live_done
│           ├── archive_done
│           ├── live_screenshot.png
│           ├── archive_screenshot.png
│           └── ...
└── warcs/
    └── test/
        └── ...

measurement/
├── diffs/
├── pinpoint/
├── fidex_result/
└── ...
```

## Configuration

The system uses configuration files located in:
- `/root/config.json`: Main FidEx configuration
- `/root/fidelity-files/config.yaml`: pywb configuration

You can modify these files to adjust behavior, ports, or paths.


## Dataset

A companion dataset is available for artifact evaluation. See [`dataset/README.md`](dataset/README.md) for details on downloading and using the dataset.

## Directory Structure

```
FidEx/
├── fidex/              # Main FidEx codebase
│   ├── fidelity_check/ # Fidelity detection logic
│   ├── record_replay/  # Record/replay functionality
│   ├── error_pinpoint/ # Error pinpointing
│   └── tests/          # Test suites
├── measurement/       # Evaluation scripts
├── dataset/            # Dataset information
├── docker-only/        # Docker-specific files
├── Dockerfile          # Container definition
└── run-docker.sh       # Container startup script
```

## Citation

If you use FidEx in your research, please cite our NSDI 2026 paper:

```bibtex
@inproceedings{zhu2026detecting,
  title={Detecting and Diagnosing Errors in Serving Archived Web Pages},
  author={Zhu, Jingyuan and Sun, Huanchen and Madhyastha, Harsha V.},
  booktitle={Proceedings of the 23rd USENIX Symposium on Networked Systems Design and Implementation (NSDI 26)},
  year={2026}
}
```

## Contact

For questions about the artifact or paper, please contact paper authors.
