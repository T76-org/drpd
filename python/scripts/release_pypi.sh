#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$PYTHON_ROOT" rev-parse --show-toplevel)"
MODE="${1:---build-only}"

if [[ "$#" -gt 1 ]] || [[ "$MODE" != "--build-only" && "$MODE" != "--upload" ]]; then
    echo "Usage: $0 [--build-only|--upload]" >&2
    exit 2
fi

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
    echo "Release refused: Git worktree is not clean." >&2
    echo "Commit, stash, or remove all tracked and untracked changes first." >&2
    exit 1
fi

cd "$PYTHON_ROOT"

PACKAGE_VERSION="$(
    python3 -c \
        'import tomllib; print(tomllib.load(open("pyproject.toml", "rb"))["project"]["version"])'
)"
SOURCE_VERSION="$(
    python3 -c \
        'import ast; tree=ast.parse(open("t76/__init__.py", encoding="utf-8").read()); print(next(node.value.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "__version__" for target in node.targets)))'
)"

if [[ "$PACKAGE_VERSION" != "$SOURCE_VERSION" ]]; then
    echo "Release refused: pyproject.toml version $PACKAGE_VERSION differs from t76.__version__ $SOURCE_VERSION." >&2
    exit 1
fi

DIST_DIR="$PYTHON_ROOT/dist/release-$PACKAGE_VERSION"
if [[ -e "$DIST_DIR" ]]; then
    echo "Release refused: artifact directory already exists: $DIST_DIR" >&2
    echo "Inspect and remove it before rebuilding this release." >&2
    exit 1
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/t76-release.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
BUILD_PYTHON="$TEMP_DIR/venv/bin/python"
SMOKE_PYTHON="$TEMP_DIR/smoke/bin/python"

echo "Preparing t76 $PACKAGE_VERSION release environment..."
python3 -m venv "$TEMP_DIR/venv"
"$BUILD_PYTHON" -m pip install --upgrade pip build twine
"$BUILD_PYTHON" -m pip install ".[dev]"

echo "Running Python tests..."
"$BUILD_PYTHON" -m pytest t76/drpd/tests -q

echo "Building wheel and source distribution..."
mkdir -p "$DIST_DIR"
"$BUILD_PYTHON" -m build --outdir "$DIST_DIR"
"$BUILD_PYTHON" -m twine check --strict "$DIST_DIR"/*

echo "Inspecting release contents..."
DIST_DIR="$DIST_DIR" PACKAGE_VERSION="$PACKAGE_VERSION" "$BUILD_PYTHON" - <<'PY'
import hashlib
import os
import pathlib
import tarfile
import zipfile

dist_dir = pathlib.Path(os.environ["DIST_DIR"])
version = os.environ["PACKAGE_VERSION"]
wheel = list(dist_dir.glob("*.whl"))
sdist = list(dist_dir.glob("*.tar.gz"))
assert len(wheel) == 1, wheel
assert len(sdist) == 1, sdist

with zipfile.ZipFile(wheel[0]) as archive:
    wheel_names = set(archive.namelist())
assert "t76/drpd/app/app.tcss" in wheel_names
assert any(name.endswith(".dist-info/licenses/LICENSE") for name in wheel_names)
assert not any(name.startswith("t76/drpd/tests/") for name in wheel_names)

with tarfile.open(sdist[0], "r:gz") as archive:
    sdist_names = set(archive.getnames())
prefix = f"t76-{version}/"
assert f"{prefix}LICENSE" in sdist_names
assert f"{prefix}t76/drpd/app/app.tcss" in sdist_names
assert not any(name.startswith(f"{prefix}t76/drpd/tests/") for name in sdist_names)

for artifact in sorted(wheel + sdist):
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    print(f"SHA256 {artifact.name}: {digest}")
PY

echo "Smoke-testing built wheel..."
python3 -m venv "$TEMP_DIR/smoke"
"$SMOKE_PYTHON" -m pip install "$DIST_DIR"/*.whl
(
    cd "$TEMP_DIR"
    PACKAGE_VERSION="$PACKAGE_VERSION" "$SMOKE_PYTHON" - <<'PY'
import importlib.metadata
import importlib.resources
import os

import t76

version = os.environ["PACKAGE_VERSION"]
assert t76.__version__ == version
assert importlib.metadata.version("t76") == version
assert importlib.metadata.metadata("t76")["License-Expression"] == "AGPL-3.0-only"
assert importlib.resources.files("t76.drpd.app").joinpath("app.tcss").is_file()
PY
    "$SMOKE_PYTHON" -m t76 --version
    "$TEMP_DIR/smoke/bin/drpd" --version
    "$TEMP_DIR/smoke/bin/drpd" --help
)

echo "Release artifacts ready in $DIST_DIR"

if [[ "$MODE" == "--build-only" ]]; then
    echo "Build-only verification complete. Nothing uploaded."
    exit 0
fi

if [[ ! -t 0 ]]; then
    echo "Release refused: upload requires an interactive terminal." >&2
    exit 1
fi

CONFIRMATION="publish t76 $PACKAGE_VERSION"
echo
echo "WARNING: PyPI releases are immutable."
echo "Artifacts to upload:"
for artifact in "$DIST_DIR"/*; do
    echo "  $artifact"
done
echo
read -r -p "Type '$CONFIRMATION' to publish: " response
if [[ "$response" != "$CONFIRMATION" ]]; then
    echo "Upload cancelled."
    exit 1
fi

echo "Twine will prompt for the project-scoped PyPI token."
"$BUILD_PYTHON" -m twine upload --username __token__ "$DIST_DIR"/*
echo "Published t76 $PACKAGE_VERSION to PyPI."
