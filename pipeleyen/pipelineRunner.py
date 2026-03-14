"""Execute pipeline scenes by delegating to director.py inside container."""

import asyncio
import json
import re


PATTERN_SCENE_LABEL = re.compile(
    r"\[Scene(\d+)\]|Scene(\d+):|=+\s*\n\s*Scene(\d+)"
)
PATTERN_SCENE_SUCCESS = re.compile(r"SUCCESS:\s*Scene(\d+)")
PATTERN_SCENE_FAILED = re.compile(r"FAILED:\s*Scene(\d+)")


async def fnRunDirector(
    connectionDocker,
    sContainerId,
    saExtraArguments,
    sWorkdir,
    fnStatusCallback,
):
    """Run director.py in the container, streaming output."""
    sCommand = "python director.py " + " ".join(saExtraArguments)
    await fnStatusCallback(
        {"sType": "started", "sCommand": sCommand}
    )

    iExitCode, sOutput = connectionDocker.ftResultExecuteCommand(
        sContainerId, sCommand, sWorkdir=sWorkdir
    )
    for sLine in sOutput.splitlines():
        dictEvent = {"sType": "output", "sLine": sLine}
        matchSuccess = PATTERN_SCENE_SUCCESS.search(sLine)
        matchFailed = PATTERN_SCENE_FAILED.search(sLine)
        if matchSuccess:
            iScene = int(matchSuccess.group(1))
            dictEvent["sType"] = "scenePass"
            dictEvent["iSceneNumber"] = iScene
        elif matchFailed:
            iScene = int(matchFailed.group(1))
            dictEvent["sType"] = "sceneFail"
            dictEvent["iSceneNumber"] = iScene
        await fnStatusCallback(dictEvent)

    sResultType = "completed" if iExitCode == 0 else "failed"
    await fnStatusCallback(
        {
            "sType": sResultType,
            "iExitCode": iExitCode,
        }
    )
    return iExitCode


async def fnRunAllScenes(
    connectionDocker, sContainerId, sWorkdir, fnStatusCallback
):
    """Run all scenes via director.py."""
    return await fnRunDirector(
        connectionDocker, sContainerId, [], sWorkdir,
        fnStatusCallback,
    )


async def fnRunFromScene(
    connectionDocker,
    sContainerId,
    iStartScene,
    sWorkdir,
    fnStatusCallback,
):
    """Run director.py starting from scene N."""
    return await fnRunDirector(
        connectionDocker,
        sContainerId,
        [f"--start-scene {iStartScene}"],
        sWorkdir,
        fnStatusCallback,
    )


async def fnVerifyOnly(
    connectionDocker, sContainerId, sWorkdir, fnStatusCallback
):
    """Run director.py in verify-only mode."""
    return await fnRunDirector(
        connectionDocker,
        sContainerId,
        ["--verify-only"],
        sWorkdir,
        fnStatusCallback,
    )


async def fnRunSelectedScenes(
    connectionDocker,
    sContainerId,
    listSceneIndices,
    dictScript,
    sScriptPath,
    sWorkdir,
    fnStatusCallback,
):
    """Run only selected scenes by toggling bEnabled."""
    from . import sceneManager

    dictBackup = json.loads(json.dumps(dictScript))
    try:
        setSelected = set(listSceneIndices)
        for iIndex in range(len(dictScript["listScenes"])):
            dictScript["listScenes"][iIndex]["bEnabled"] = (
                iIndex in setSelected
            )
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            sScriptPath,
        )
        iResult = await fnRunDirector(
            connectionDocker, sContainerId, [], sWorkdir,
            fnStatusCallback,
        )
    finally:
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictBackup,
            sScriptPath,
        )
    return iResult
