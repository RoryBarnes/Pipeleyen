"""Acceptance test: split Scene 08 into MaxLEV and alabi scenes.

Simulates the GUI workflow of:
1. Creating a new "Maximum Likelihood Estimation" scene
2. Editing "Bayesian Posteriors" to remove MaxLEV commands
3. Reordering so MaxLEV precedes alabi
4. Verifying the resulting script.json
"""

import copy
import json

import pytest

from pipeleyen.sceneManager import (
    fdictCreateScene,
    fnDeleteScene,
    fnInsertScene,
    fnReorderScene,
    fnUpdateScene,
)


@pytest.fixture
def dictGj1132Script():
    """Return the real GJ1132 script.json Scene 08 structure."""
    return {
        "sPlotDirectory": "Plot",
        "sFigureType": "pdf",
        "iNumberOfCores": -1,
        "listScenes": [
            {
                "sName": "Scene 01 placeholder",
                "sDirectory": "s01",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s01"],
                "saOutputFiles": ["s01.pdf"],
            },
            {
                "sName": "Scene 02 placeholder",
                "sDirectory": "s02",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s02"],
                "saOutputFiles": ["s02.pdf"],
            },
            {
                "sName": "Scene 03 placeholder",
                "sDirectory": "s03",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s03"],
                "saOutputFiles": ["s03.pdf"],
            },
            {
                "sName": "Scene 04 placeholder",
                "sDirectory": "s04",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s04"],
                "saOutputFiles": ["s04.pdf"],
            },
            {
                "sName": "Scene 05 placeholder",
                "sDirectory": "s05",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s05"],
                "saOutputFiles": ["s05.pdf"],
            },
            {
                "sName": "Scene 06 placeholder",
                "sDirectory": "s06",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s06"],
                "saOutputFiles": ["s06.pdf"],
            },
            {
                "sName": "Scene 07 placeholder",
                "sDirectory": "s07",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s07"],
                "saOutputFiles": ["s07.pdf"],
            },
            {
                "sName": "Bayesian Posteriors",
                "sDirectory": "XUV/Distributions/Ribas/Posteriors/alabi",
                "bEnabled": True,
                "bPlotOnly": False,
                "saSetupCommands": [
                    "cp {Scene06.lxuv_constraints} lxuv_constraints.json",
                    "cd {sRepoRoot}/XUV/EvolutionPlots/MaximumLikelihood && maxlev gj1132_ribas.json",
                    "python gj1132_alabi.py {sPlotDirectory}/sampler_comparison.{sFigureType}",
                ],
                "saCommands": [
                    "python gj1132_alabi.py {sPlotDirectory}/sampler_comparison.{sFigureType}",
                ],
                "saOutputFiles": [
                    "{sPlotDirectory}/sampler_comparison.{sFigureType}",
                    "output/dynesty_transform_final.npy",
                ],
            },
            {
                "sName": "Scene 09 placeholder",
                "sDirectory": "s09",
                "bEnabled": True,
                "bPlotOnly": True,
                "saSetupCommands": [],
                "saCommands": ["echo s09"],
                "saOutputFiles": ["s09.pdf"],
            },
        ],
    }


class TestSplitScene08:
    def test_splitMaxlevFromAlabi(self, dictGj1132Script):
        """Simulate the full GUI workflow for splitting Scene 08."""
        iOriginalScene08 = 7  # 0-indexed

        # Step 1: Create a new "Maximum Likelihood Estimation" scene
        # containing the cp and maxlev commands from Scene 08's setup
        dictMaxlev = fdictCreateScene(
            sName="Maximum Likelihood Estimation",
            sDirectory="XUV/EvolutionPlots/MaximumLikelihood",
            bPlotOnly=False,
            saSetupCommands=[
                "cp {Scene06.lxuv_constraints} lxuv_constraints.json",
                "cd {sRepoRoot}/XUV/EvolutionPlots/MaximumLikelihood "
                "&& maxlev gj1132_ribas.json",
            ],
            saCommands=[],
            saOutputFiles=[],
        )

        # Step 2: Insert the new scene right before the existing Scene 08
        fnInsertScene(dictGj1132Script, iOriginalScene08, dictMaxlev)

        # After insertion, the old Bayesian Posteriors is now at index 8
        iNewAlabiIndex = iOriginalScene08 + 1

        # Step 3: Edit the Bayesian Posteriors scene to remove the
        # MaxLEV commands, keeping only the alabi command
        fnUpdateScene(
            dictGj1132Script,
            iNewAlabiIndex,
            {
                "saSetupCommands": [
                    "python gj1132_alabi.py "
                    "{sPlotDirectory}/sampler_comparison.{sFigureType}",
                ],
            },
        )

        # --- Verify the result ---

        listScenes = dictGj1132Script["listScenes"]
        assert len(listScenes) == 10  # was 9, now 10

        # The new MaxLEV scene is at position 7 (0-indexed)
        dictMaxlevResult = listScenes[7]
        assert (
            dictMaxlevResult["sName"]
            == "Maximum Likelihood Estimation"
        )
        assert dictMaxlevResult["bPlotOnly"] is False
        assert len(dictMaxlevResult["saSetupCommands"]) == 2
        assert "maxlev" in dictMaxlevResult["saSetupCommands"][1]
        assert (
            "lxuv_constraints"
            in dictMaxlevResult["saSetupCommands"][0]
        )

        # The alabi scene is at position 8
        dictAlabiResult = listScenes[8]
        assert dictAlabiResult["sName"] == "Bayesian Posteriors"
        assert len(dictAlabiResult["saSetupCommands"]) == 1
        assert (
            "gj1132_alabi.py"
            in dictAlabiResult["saSetupCommands"][0]
        )

        # Scene 09 is still at the end (now at index 9)
        assert (
            listScenes[9]["sName"] == "Scene 09 placeholder"
        )

        # The MaxLEV scene precedes the alabi scene
        iMaxlevIndex = next(
            i
            for i, s in enumerate(listScenes)
            if s["sName"] == "Maximum Likelihood Estimation"
        )
        iAlabiIndex = next(
            i
            for i, s in enumerate(listScenes)
            if s["sName"] == "Bayesian Posteriors"
        )
        assert iMaxlevIndex < iAlabiIndex
