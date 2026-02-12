from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="t76",
    version="0.1.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="A simple Python module",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/t76",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.7",
    install_requires=[
        "async-lru==2.0.5",
        "pyserial>=3.5",
        "pyserial-asyncio>=0.6",
        "pyusb>=1.3.1",
        "PyVISA>=1.15.0",
        "textual>=5.0.1",
    ],
)
