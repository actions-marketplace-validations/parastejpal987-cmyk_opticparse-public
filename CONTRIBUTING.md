# Contributing to OpticParse

First off, thank you for considering contributing to OpticParse! It's people like you that make OpticParse such a great tool.

## How to Contribute

### 1. Bug Reports and Feature Requests
If you spot a bug or have a feature request, please open an issue in the repository. Provide as much context as possible (code snippets, logs, browser versions) so we can debug effectively.

### 2. Submitting Pull Requests
1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure your code passes all linting/build steps.
4. Open a Pull Request!

### 3. Developer Extensions
If you are modifying the Chrome Extensions (`opticparse-extension` or `phishvision-extension`), you can load them locally into Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the extension directory.

### 4. SDK Development (`opticparse-py`)
For local SDK development:
```bash
cd opticparse-py
pip install -e .
```
This installs the SDK in editable mode so changes apply instantly.

### 5. Documentation (`docs/`)
Feel free to submit PRs for fixing typos or improving the clarity of the documentation. Our documentation is built using plain HTML/CSS in the `docs` folder.

## Code of Conduct
Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
