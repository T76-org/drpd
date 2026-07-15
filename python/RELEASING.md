# Releasing `t76` to PyPI

Releases are built, verified, and uploaded from a maintainer's local machine.
GitHub Actions, GitHub Releases, and PyPI Trusted Publishing are not required.

## One-time PyPI setup

After the T76 organization account is approved:

1. Sign in to PyPI with an organization owner or manager account.
2. Open **Your organizations**, manage the T76 organization, and select
   **Projects**.
3. Create the project named exactly `t76`.
4. In personal PyPI account settings, create an API token scoped only to the
   `t76` project.
5. Copy the token immediately and store it in a password manager. PyPI does
   not display it again.

Never commit a token, put one in a shell command, or store one in this
repository. The release script lets Twine prompt for it without echoing it.

## Prepare a release

1. Update `project.version` in `pyproject.toml` and `__version__` in
   `t76/__init__.py` to the same PEP 440 version.
2. Update release notes and user documentation as needed.
3. Commit all changes. The release script requires a completely clean Git
   worktree, including no untracked files.
4. Run the complete non-publishing rehearsal from `python/`:

   ```bash
   ./scripts/release_pypi.sh --build-only
   ```

The script creates a clean environment, installs release tools, runs the full
test suite, builds the wheel and source distribution, validates their metadata
and contents, and smoke-installs the wheel. Verified artifacts remain under
`dist/release-VERSION/` for inspection.

If an artifact directory for the version already exists, inspect and remove it
before deliberately rebuilding. Distribution files are ignored by Git.

## Publish

After reviewing the rehearsal output and artifacts, remove the rehearsal
artifact directory and run:

```bash
./scripts/release_pypi.sh --upload
```

The script repeats every validation. It then displays the exact artifacts and
requires typing `publish t76 VERSION`. Twine prompts for the project-scoped
token; paste the complete value including its `pypi-` prefix.

## Verify production

Create a new environment that cannot import the source checkout:

```bash
python3 -m venv /tmp/t76-pypi-check
source /tmp/t76-pypi-check/bin/activate
python -m pip install --upgrade pip
python -m pip install "t76==VERSION"
cd /tmp
python -c 'import t76; print(t76.__version__)'
python -m t76 --version
drpd --version
drpd --help
```

Confirm the PyPI project page shows the expected version, AGPL-3.0-only
license, Python requirement, README, links, wheel, and source distribution.
Remove the WIP warning from the installation documentation after the first
release is verified.

Revoke the API token after release when using single-release tokens. Otherwise,
keep the project-scoped token only in a password manager.

## Failed or partial uploads

PyPI filenames and released versions are immutable. Never rebuild changed
contents under a version that uploaded any files successfully. Inspect the
project's release files; if publication was partial, either upload only the
missing unchanged artifact or increment the package version, rebuild, and
publish the new version. Never use `--skip-existing` to conceal uncertainty
about artifact contents.
