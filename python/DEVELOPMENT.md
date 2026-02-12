Development Guide
=================

## Environment Setup

### 1. Activate Your Virtual Environment

Before running tests or development commands, activate your virtualenv:

```bash
source venv/bin/activate
```

Or if using a different location:
```bash
source /path/to/your/venv/bin/activate
```

### 2. Install Dependencies

If you haven't already, install test dependencies:

```bash
pip install pytest
```

For development with linting:
```bash
pip install pytest flake8 pylint
```

### 3. Verify Installation

Confirm your environment is ready:

```bash
python --version        # Should be 3.11+
pytest --version        # Should show pytest version
python -c "import t76.drpd.device.device_sink_pdos; print('✓ Imports work')"
```

## Running Tests

### From the project root:

**Option A: Using the helper script (Recommended)**
```bash
bash run_tests.sh
```

**Option B: Direct pytest command**
```bash
python -m pytest t76/drpd/tests/ -v
```

**Option C: Run specific test file**
```bash
python -m pytest t76/drpd/tests/test_device_sink_pdos.py -v
```

**Option D: Run specific test class or function**
```bash
python -m pytest t76/drpd/tests/test_device_sink_pdos.py::TestFixedPDOParsing -v
python -m pytest t76/drpd/tests/test_device_sink_pdos.py::TestFixedPDOParsing::test_parse_fixed_pdo -v
```

## Code Style & Linting

### Check for style violations:

```bash
flake8 t76/drpd/device/device_sink_pdos.py
pylint t76/drpd/device/device_sink_pdos.py
```

### Format code to PEP 8:

```bash
# Using autopep8 (if installed)
autopep8 --in-place --aggressive t76/drpd/device/device_sink_pdos.py
```

## Project Structure

```
python_library/
├── t76/
│   ├── __init__.py
│   ├── drpd/
│   │   ├── __init__.py
│   │   ├── device/
│   │   │   ├── __init__.py
│   │   │   ├── device_sink_pdos.py       ← Implementation
│   │   │   └── ...other device modules
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_device_sink_pdos.py  ← Tests
│   │       └── ...other test modules
│   └── ...other top-level modules
├── run_tests.sh                          ← Test runner script
├── pytest.ini                            ← pytest configuration
└── .github/instructions/
    └── python.instructions.md            ← Code style guide
```

## Key Guidelines

1. **All tests must be in `t76/drpd/tests/`** with `test_` prefix
2. **All packages need `__init__.py`** files (can be empty)
3. **Use `python` (not `python3`)** after activating virtualenv
4. **Code must follow PEP 8** (79-char lines, snake_case vars, etc.)
5. **All public functions/classes need docstrings** with parameter info

## Troubleshooting

### "No module named pytest"
```bash
pip install pytest
```

### "ModuleNotFoundError: No module named 't76'"
Ensure you're running from the project root and have activated the virtualenv.

### Tests can't find modules
Verify `__init__.py` files exist in:
- `t76/__init__.py`
- `t76/drpd/__init__.py`
- `t76/drpd/tests/__init__.py`

### "Unknown command: python"
Your virtualenv is not activated. Run:
```bash
source venv/bin/activate
```

## References

- [PEP 8 Style Guide](https://pep8.org/)
- [pytest Documentation](https://docs.pytest.org/)
- Project instructions: `.github/instructions/python.instructions.md`
