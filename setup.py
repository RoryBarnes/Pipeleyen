# -*- coding: utf-8 -*-
import os

from setuptools import find_packages, setup

setup(
    name="pipeleyen",
    description="Pipeline Verification GUI for Docker Containers",
    long_description=open("README.md", "r").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/VirtualPlanetaryLaboratory/Pipeleyen",
    author="Rory Barnes",
    license="MIT",
    packages=find_packages(),
    include_package_data=True,
    package_data={"pipeleyen": ["static/*"]},
    use_scm_version={
        "version_scheme": "post-release",
        "write_to": os.path.join("pipeleyen", "pipeleyen_version.py"),
        "write_to_template": '__version__ = "{version}"\n',
    },
    install_requires=[
        "fastapi>=0.100",
        "uvicorn>=0.20",
        "websockets>=11.0",
        "docker>=6.0",
        "aiofiles>=23.0",
    ],
    entry_points={
        "console_scripts": [
            "pipeleyen = pipeleyen.main:main",
        ],
    },
    setup_requires=["setuptools_scm"],
    python_requires=">=3.9",
    zip_safe=False,
)
