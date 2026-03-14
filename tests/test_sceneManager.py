"""Tests for sceneManager module."""

import copy
import json

import pytest

from pipeleyen.sceneManager import (
    fbValidateScript,
    fdictBuildGlobalVariables,
    fdictCreateScene,
    fdictGetScene,
    flistExtractOutputFiles,
    flistExtractSceneNames,
    flistFilterFigureFiles,
    flistResolveOutputFiles,
    fnDeleteScene,
    fnInsertScene,
    fnReorderScene,
    fnUpdateScene,
    fsResolveVariables,
)


class TestFbValidateScript:
    def test_validScript(self, dictSampleScript):
        assert fbValidateScript(dictSampleScript) is True

    def test_missingPlotDirectory(self, dictSampleScript):
        del dictSampleScript["sPlotDirectory"]
        assert fbValidateScript(dictSampleScript) is False

    def test_missingListScenes(self, dictSampleScript):
        del dictSampleScript["listScenes"]
        assert fbValidateScript(dictSampleScript) is False

    def test_sceneMissingName(self, dictSampleScript):
        del dictSampleScript["listScenes"][0]["sName"]
        assert fbValidateScript(dictSampleScript) is False

    def test_sceneMissingCommands(self, dictSampleScript):
        del dictSampleScript["listScenes"][1]["saCommands"]
        assert fbValidateScript(dictSampleScript) is False

    def test_sceneMissingOutputFiles(self, dictSampleScript):
        del dictSampleScript["listScenes"][0]["saOutputFiles"]
        assert fbValidateScript(dictSampleScript) is False

    def test_emptySceneList(self):
        dictScript = {
            "sPlotDirectory": "Plot",
            "listScenes": [],
        }
        assert fbValidateScript(dictScript) is True


class TestFlistExtractSceneNames:
    def test_extractsAllScenes(self, dictSampleScript):
        listScenes = flistExtractSceneNames(dictSampleScript)
        assert len(listScenes) == 3
        assert listScenes[0]["sName"] == "Scene Alpha"
        assert listScenes[1]["iNumber"] == 2
        assert listScenes[2]["bEnabled"] is False


class TestFdictCreateScene:
    def test_defaultValues(self):
        dictScene = fdictCreateScene("Test", "test_dir")
        assert dictScene["sName"] == "Test"
        assert dictScene["sDirectory"] == "test_dir"
        assert dictScene["bPlotOnly"] is True
        assert dictScene["bEnabled"] is True
        assert dictScene["saSetupCommands"] == []
        assert dictScene["saCommands"] == []
        assert dictScene["saOutputFiles"] == []

    def test_customValues(self):
        dictScene = fdictCreateScene(
            "Custom",
            "custom_dir",
            bPlotOnly=False,
            saSetupCommands=["setup"],
            saCommands=["run"],
            saOutputFiles=["out.pdf"],
        )
        assert dictScene["bPlotOnly"] is False
        assert dictScene["saSetupCommands"] == ["setup"]
        assert dictScene["saCommands"] == ["run"]


class TestFdictGetScene:
    def test_validIndex(self, dictSampleScript):
        dictScene = fdictGetScene(dictSampleScript, 0)
        assert dictScene["sName"] == "Scene Alpha"

    def test_invalidIndex(self, dictSampleScript):
        with pytest.raises(IndexError):
            fdictGetScene(dictSampleScript, 10)


class TestFnInsertScene:
    def test_insertAtPosition(self, dictSampleScript):
        dictNew = fdictCreateScene("Inserted", "inserted_dir")
        fnInsertScene(dictSampleScript, 1, dictNew)
        assert len(dictSampleScript["listScenes"]) == 4
        assert (
            dictSampleScript["listScenes"][1]["sName"] == "Inserted"
        )
        assert (
            dictSampleScript["listScenes"][2]["sName"]
            == "Scene Beta"
        )


class TestFnUpdateScene:
    def test_updateName(self, dictSampleScript):
        fnUpdateScene(
            dictSampleScript, 0, {"sName": "Updated Alpha"}
        )
        assert (
            dictSampleScript["listScenes"][0]["sName"]
            == "Updated Alpha"
        )

    def test_invalidIndex(self, dictSampleScript):
        with pytest.raises(IndexError):
            fnUpdateScene(dictSampleScript, 10, {"sName": "X"})


class TestFnDeleteScene:
    def test_deleteScene(self, dictSampleScript):
        fnDeleteScene(dictSampleScript, 1)
        assert len(dictSampleScript["listScenes"]) == 2
        assert (
            dictSampleScript["listScenes"][1]["sName"]
            == "Scene Gamma"
        )

    def test_invalidIndex(self, dictSampleScript):
        with pytest.raises(IndexError):
            fnDeleteScene(dictSampleScript, 5)


class TestFnReorderScene:
    def test_moveForward(self, dictSampleScript):
        fnReorderScene(dictSampleScript, 0, 2)
        assert (
            dictSampleScript["listScenes"][0]["sName"]
            == "Scene Beta"
        )
        assert (
            dictSampleScript["listScenes"][2]["sName"]
            == "Scene Alpha"
        )

    def test_moveBackward(self, dictSampleScript):
        fnReorderScene(dictSampleScript, 2, 0)
        assert (
            dictSampleScript["listScenes"][0]["sName"]
            == "Scene Gamma"
        )

    def test_invalidFromIndex(self, dictSampleScript):
        with pytest.raises(IndexError):
            fnReorderScene(dictSampleScript, 10, 0)

    def test_invalidToIndex(self, dictSampleScript):
        with pytest.raises(IndexError):
            fnReorderScene(dictSampleScript, 0, 10)


class TestFlistFilterFigureFiles:
    def test_filtersFigures(self):
        listPaths = [
            "Plot/fig.pdf",
            "data/samples.npy",
            "Plot/chart.png",
            "output.json",
            "image.jpg",
            "diagram.svg",
        ]
        listResult = flistFilterFigureFiles(listPaths)
        assert len(listResult) == 4
        assert "Plot/fig.pdf" in listResult
        assert "Plot/chart.png" in listResult
        assert "image.jpg" in listResult
        assert "diagram.svg" in listResult

    def test_emptyList(self):
        assert flistFilterFigureFiles([]) == []

    def test_noFigures(self):
        assert flistFilterFigureFiles(["data.npy", "out.json"]) == []


class TestFsResolveVariables:
    def test_replacesKnownTokens(self):
        sResult = fsResolveVariables(
            "{sPlotDirectory}/fig.{sFigureType}",
            {"sPlotDirectory": "Plot", "sFigureType": "pdf"},
        )
        assert sResult == "Plot/fig.pdf"

    def test_leavesUnknownTokens(self):
        sResult = fsResolveVariables(
            "{sPlotDirectory}/{unknown}",
            {"sPlotDirectory": "Plot"},
        )
        assert sResult == "Plot/{unknown}"

    def test_noTokens(self):
        sResult = fsResolveVariables("plain/path.pdf", {})
        assert sResult == "plain/path.pdf"


class TestFdictBuildGlobalVariables:
    def test_extractsVariables(self, dictSampleScript):
        dictVars = fdictBuildGlobalVariables(
            dictSampleScript, "/workspace/GJ1132/script.json"
        )
        assert dictVars["sPlotDirectory"] == "Plot"
        assert dictVars["sRepoRoot"] == "/workspace/GJ1132"
        assert dictVars["sFigureType"] == "pdf"
        assert dictVars["iNumberOfCores"] == -1

    def test_defaultValues(self):
        dictScript = {"listScenes": []}
        dictVars = fdictBuildGlobalVariables(
            dictScript, "/workspace/script.json"
        )
        assert dictVars["sPlotDirectory"] == "Plot"
        assert dictVars["sFigureType"] == "pdf"


class TestFlistResolveOutputFiles:
    def test_resolvesTemplates(self):
        dictScene = {
            "saOutputFiles": [
                "{sPlotDirectory}/fig.{sFigureType}",
                "data/raw.npy",
            ]
        }
        dictVars = {"sPlotDirectory": "Plot", "sFigureType": "pdf"}
        listResult = flistResolveOutputFiles(dictScene, dictVars)
        assert listResult == ["Plot/fig.pdf", "data/raw.npy"]

    def test_emptyOutputFiles(self):
        dictScene = {"saOutputFiles": []}
        assert flistResolveOutputFiles(dictScene, {}) == []


class TestFlistExtractOutputFiles:
    def test_extractsFiles(self, dictSampleScript):
        listFiles = flistExtractOutputFiles(
            dictSampleScript["listScenes"][1]
        )
        assert len(listFiles) == 2
        assert "Plot/beta.pdf" in listFiles
