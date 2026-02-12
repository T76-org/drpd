# PyPI Upload Guide for t76

This guide explains how to upload your `t76` package to PyPI.

## Prerequisites

1. Create an account on [PyPI](https://pypi.org/account/register/)
2. Optionally, create an account on [TestPyPI](https://test.pypi.org/account/register/) for testing

## Step 1: Update Package Information

Before uploading, update the following files with your actual information:

### pyproject.toml
- Replace "Your Name" with your actual name
- Replace "your.email@example.com" with your email
- Replace "https://github.com/yourusername/t76" with your actual repository URL

### setup.py (if using)
- Update the same information as above

## Step 2: Build the Package

```bash
# Make sure you're in the project directory
cd /path/to/your/t76/project

# Install build tools if not already installed
pip install build twine

# Build the package
python -m build
```

This creates distribution files in the `dist/` directory:
- `t76-0.1.0.tar.gz` (source distribution)
- `t76-0.1.0-py3-none-any.whl` (wheel distribution)

## Step 3: Test Upload to TestPyPI (Recommended)

```bash
# Upload to TestPyPI first
python -m twine upload --repository testpypi dist/*

# Test install from TestPyPI
pip install --index-url https://test.pypi.org/simple/ t76
```

## Step 4: Upload to PyPI

```bash
# Upload to PyPI
python -m twine upload dist/*
```

You'll be prompted for your PyPI username and password.

## Step 5: Verify Installation

```bash
# Install from PyPI
pip install t76

# Test the package
python -c "import t76; print(t76.greet('World'))"
```

## API Token Authentication (Recommended)

Instead of using username/password, you can use API tokens:

1. Go to PyPI Account Settings → API tokens
2. Create a new API token
3. Use `__token__` as username and your token as password

Or configure it in `~/.pypirc`:

```ini
[distutils]
index-servers = pypi

[pypi]
username = __token__
password = your-api-token-here
```

## Version Updates

To release a new version:

1. Update the version number in `pyproject.toml` and `setup.py`
2. Update `__version__` in `t76/__init__.py`
3. Update the changelog/README if needed
4. Build and upload again

## Troubleshooting

- **Package name already exists**: Choose a different name or add a suffix
- **Version already exists**: Increment the version number
- **Authentication issues**: Double-check credentials or use API tokens
- **File upload errors**: Ensure all required metadata is present

## Package Structure Summary

```
t76/
├── pyproject.toml          # Modern Python packaging configuration
├── setup.py               # Legacy setup file (still supported)
├── README.md              # Package description
├── LICENSE                # License file
├── MANIFEST.in            # Include additional files
├── .gitignore             # Git ignore file
├── example.py             # Example usage
├── t76/                   # Main package directory
│   ├── __init__.py        # Package initialization
│   └── core.py            # Core functionality
├── tests/                 # Test directory
│   ├── __init__.py
│   └── test_t76.py        # Unit tests
└── dist/                  # Built distributions (generated)
    ├── t76-0.1.0.tar.gz
    └── t76-0.1.0-py3-none-any.whl
```

Your package is now ready for PyPI!
