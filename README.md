# Pipeleyen

Pipeline Verification GUI for Docker Containers.

Pipeleyen provides a web-based interface for managing, executing, and
verifying data-processing pipelines defined by `director.py` and
`script.json` inside Docker containers.

## Quick Start

```bash
pip install -e .
pipeleyen
```

Then open `http://localhost:8157` in your browser, select a running
Docker container, and begin managing your pipeline.

## Requirements

- Python 3.9+
- Docker (local daemon)
- A running container with `/workspace/script.json`
