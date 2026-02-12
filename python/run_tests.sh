#!/bin/bash
# Run unit tests for the t76.drpd Python library
#
# Usage: bash run_tests.sh
#
# Requirements:
#   - Activate your virtualenv first: source venv/bin/activate
#   - Install pytest: pip install pytest

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if pytest is available
if ! python -m pytest --version &>/dev/null; then
    echo "Error: pytest not found. Please install it:"
    echo "  pip install pytest"
    exit 1
fi

echo "Running tests from t76/drpd/tests/..."
echo ""

# Run pytest with verbose output
python -m pytest t76/drpd/tests/ -v --tb=short

echo ""
echo "✓ All tests passed!"
