#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
venv_dir="${script_dir}/.venv"

if [[ ! -d "${venv_dir}" ]]; then
    python3 -m venv "${venv_dir}"
fi

source "${venv_dir}/bin/activate"

python -m pip install --upgrade pip
python -m pip install -e "${repo_root}/python"
python -m pip install fnirsi-dps150

cat <<EOF
VBUS calibration environment is ready.

Activate it with:
source "${venv_dir}/bin/activate"

Run the calibration script with:
python "${repo_root}/firmware/scripts/calibrate_vbus_dps150.py" --help
EOF
