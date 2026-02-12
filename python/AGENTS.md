# Python Code Style Guidelines

- **PEP 8 Compliance**: Ensure that all Python code adheres to the PEP 8 style guide. Use tools like `flake8` or `pylint` to check for compliance.
- **Indentation**: Use 4 spaces per indentation level. Avoid using tabs.
- **Line Length**: Limit all lines to a maximum of 79 characters. For docstrings or comments, the limit is 72 characters.
- **Imports**:
  - Imports should be on separate lines. If multiple imports are from the same module, use parentheses, with one import per line.
  - Group imports in the following order: standard library imports, related third-party imports, and local application/library-specific imports. Use a blank line to separate each group.
  - Alphabetize imports within each group.
- **Variable and Function Naming**:
  - Use `snake_case` for variable and function names.
  - Use `PascalCase` for class names.
  - Ensure that docstrings can be used to generate documentation automatically (e.g., using Sphinx).
- **Type Hints**: Use type hints for function parameters and return types to improve code readability and maintainability.
  - Use modern type hinting syntax (PEP 484) and avoid using `from typing import *`.
- **Comments**: Write clear and concise comments. Use inline comments sparingly and only when necessary to explain complex logic.
- **Whitespace**: Avoid extraneous whitespace in expressions and statements. Use a single space after commas, colons, and semicolons.
- **Error Handling**: Use exceptions for error handling. Avoid using bare `except:` clauses; always specify the exception type.
- **Python Version**: Ensure compatibility with Python 3.11 and above, unless otherwise specified.
- **Module Structure**: All Python packages must have `__init__.py` files:
  - `t76/__init__.py`
  - `t76/drpd/__init__.py`
  - `t76/drpd/tests/__init__.py`
  - `t76/drpd/device/__init__.py` (if creating new submodules)
  These files can be empty but are required for Python to recognize package hierarchies.
- **Testing**: Write unit tests for all functions and classes. Use `pytest` for testing and aim for high code coverage.
  - Store all tests in the `t76/drpd/tests/` directory alongside the code being tested.
  - Name test files starting with `test_` and test functions/methods starting with `test_`.
  - Use descriptive names for test cases to indicate what is being tested.
-  **Coding style**: Unless otherwise instructed, prioritize readability and maintainability over cleverness or brevity in code.
  - Use meaningful variable and function names that convey purpose.
  - Break down large functions into smaller, reusable functions where appropriate.
  - Avoid deep nesting of code blocks; consider using early returns to reduce complexity.
  - Use list comprehensions and generator expressions for concise and efficient looping where appropriate.
  - Use lazy % formatting for logging messages to avoid unnecessary string interpolation.
-  **Comments and Documentation**: Maintain up-to-date comments and documentation. Ensure that comments accurately reflect the code's functionality.
  - Use docstrings for all public modules, classes, and functions.
  - Update comments and documentation when code changes to prevent discrepancies.
  - Use triple double quotes (`"""`) for docstrings. Include a brief description of the function/class/module, along with parameter and return type information where applicable.
- **Correctness**: Ensure that all code changes maintain or improve the correctness of the program.
  - When you have made changes to the code, verify that there are no syntax errors or logical errors.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `PLANS.md`) from design to implementation.

