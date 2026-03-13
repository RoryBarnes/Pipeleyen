"""Load, validate, and CRUD operations on script.json."""

import json
import os


DEFAULT_SEARCH_ROOT = "/workspace"

REQUIRED_SCRIPT_KEYS = ("sPlotDirectory", "listScenes")
REQUIRED_SCENE_KEYS = ("sName", "sDirectory", "saCommands", "saOutputFiles")


def flistFindScriptsInContainer(connectionDocker, sContainerId):
    """Search for script.json files under /workspace and return paths."""
    sCommand = (
        "find /workspace -maxdepth 3 -name script.json -type f 2>/dev/null"
    )
    iExitCode, sOutput = connectionDocker.ftResultExecuteCommand(
        sContainerId, sCommand
    )
    listPaths = [
        sLine.strip()
        for sLine in sOutput.splitlines()
        if sLine.strip().endswith("script.json")
    ]
    return sorted(listPaths)


def fdictLoadScriptFromContainer(
    connectionDocker, sContainerId, sScriptPath=None
):
    """Fetch and parse script.json from a Docker container."""
    if sScriptPath is None:
        listPaths = flistFindScriptsInContainer(
            connectionDocker, sContainerId
        )
        if not listPaths:
            raise FileNotFoundError(
                "No script.json found under /workspace"
            )
        sScriptPath = listPaths[0]
    baContent = connectionDocker.fbaFetchFile(sContainerId, sScriptPath)
    dictScript = json.loads(baContent.decode("utf-8"))
    if not fbValidateScript(dictScript):
        raise ValueError(f"Invalid script.json: {sScriptPath}")
    return dictScript


def fbValidateScript(dictScript):
    """Return True when all required keys and scene structures exist."""
    for sKey in REQUIRED_SCRIPT_KEYS:
        if sKey not in dictScript:
            return False
    for iIndex, dictScene in enumerate(dictScript["listScenes"]):
        for sField in REQUIRED_SCENE_KEYS:
            if sField not in dictScene:
                return False
    return True


def flistExtractSceneNames(dictScript):
    """Return a list of scene summary dicts."""
    listScenes = []
    for iIndex, dictScene in enumerate(dictScript["listScenes"]):
        listScenes.append(
            {
                "iIndex": iIndex,
                "iNumber": iIndex + 1,
                "sName": dictScene["sName"],
                "bEnabled": dictScene.get("bEnabled", True),
                "bPlotOnly": dictScene.get("bPlotOnly", True),
                "sDirectory": dictScene["sDirectory"],
            }
        )
    return listScenes


def fdictCreateScene(
    sName,
    sDirectory,
    bPlotOnly=True,
    saSetupCommands=None,
    saCommands=None,
    saOutputFiles=None,
):
    """Return a new scene dictionary with validated fields."""
    return {
        "sName": sName,
        "sDirectory": sDirectory,
        "bEnabled": True,
        "bPlotOnly": bPlotOnly,
        "saSetupCommands": saSetupCommands if saSetupCommands else [],
        "saCommands": saCommands if saCommands else [],
        "saOutputFiles": saOutputFiles if saOutputFiles else [],
    }


def fdictGetScene(dictScript, iSceneIndex):
    """Return a copy of the scene at iSceneIndex."""
    if iSceneIndex < 0 or iSceneIndex >= len(dictScript["listScenes"]):
        raise IndexError(f"Scene index {iSceneIndex} out of range")
    return dict(dictScript["listScenes"][iSceneIndex])


def fnInsertScene(dictScript, iPosition, dictScene):
    """Insert a scene at iPosition in the scene list."""
    dictScript["listScenes"].insert(iPosition, dictScene)


def fnUpdateScene(dictScript, iSceneIndex, dictUpdates):
    """Update scene at iSceneIndex with dictUpdates."""
    if iSceneIndex < 0 or iSceneIndex >= len(dictScript["listScenes"]):
        raise IndexError(f"Scene index {iSceneIndex} out of range")
    dictScene = dictScript["listScenes"][iSceneIndex]
    for sKey, value in dictUpdates.items():
        dictScene[sKey] = value


def fnDeleteScene(dictScript, iSceneIndex):
    """Remove scene at iSceneIndex from dictScript."""
    if iSceneIndex < 0 or iSceneIndex >= len(dictScript["listScenes"]):
        raise IndexError(f"Scene index {iSceneIndex} out of range")
    dictScript["listScenes"].pop(iSceneIndex)


def fnReorderScene(dictScript, iFromIndex, iToIndex):
    """Move a scene from iFromIndex to iToIndex."""
    listScenes = dictScript["listScenes"]
    iMaxIndex = len(listScenes) - 1
    if iFromIndex < 0 or iFromIndex > iMaxIndex:
        raise IndexError(f"From index {iFromIndex} out of range")
    if iToIndex < 0 or iToIndex > iMaxIndex:
        raise IndexError(f"To index {iToIndex} out of range")
    dictScene = listScenes.pop(iFromIndex)
    listScenes.insert(iToIndex, dictScene)


def fnSaveScriptToContainer(
    connectionDocker, sContainerId, dictScript, sScriptPath=None
):
    """Serialize dictScript to JSON and write to container."""
    if sScriptPath is None:
        raise ValueError("sScriptPath is required for saving")
    sJson = json.dumps(dictScript, indent=2) + "\n"
    connectionDocker.fnWriteFile(
        sContainerId, sScriptPath, sJson.encode("utf-8")
    )


def flistFilterFigureFiles(listOutputPaths):
    """Return only paths ending in figure extensions."""
    setFigureExtensions = {".pdf", ".png", ".jpg", ".jpeg", ".svg"}
    listFigures = []
    for sPath in listOutputPaths:
        sExtension = os.path.splitext(sPath)[1].lower()
        if sExtension in setFigureExtensions:
            listFigures.append(sPath)
    return listFigures


def flistExtractOutputFiles(dictScene):
    """Return list of output file paths for a scene."""
    return list(dictScene.get("saOutputFiles", []))
