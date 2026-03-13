"""Shared fixtures for Pipeleyen tests."""

import json

import pytest


@pytest.fixture
def dictSampleScript():
    """Return a valid script.json dictionary for testing."""
    return {
        "sPlotDirectory": "Plot",
        "sFigureType": "pdf",
        "iNumberOfCores": -1,
        "listScenes": [
            {
                "sName": "Scene Alpha",
                "sDirectory": "alpha",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["python alpha.py output.pdf"],
                "saOutputFiles": ["Plot/alpha.pdf"],
            },
            {
                "sName": "Scene Beta",
                "sDirectory": "beta",
                "bEnabled": True,
                "bPlotOnly": False,
                "saSetupCommands": ["run_heavy_computation"],
                "saCommands": ["python beta.py output.pdf"],
                "saOutputFiles": [
                    "Plot/beta.pdf",
                    "beta/results.npy",
                ],
            },
            {
                "sName": "Scene Gamma",
                "sDirectory": "gamma",
                "bEnabled": False,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["python gamma.py output.png"],
                "saOutputFiles": ["Plot/gamma.png"],
            },
        ],
    }


@pytest.fixture
def baSampleScriptBytes(dictSampleScript):
    """Return the sample script as UTF-8 bytes."""
    return json.dumps(dictSampleScript).encode("utf-8")
