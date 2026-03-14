"""FastAPI application with REST and WebSocket routes."""

import asyncio
import json
import os
import posixpath

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

from . import sceneManager
from .dockerConnection import DockerConnection
from .figureServer import fbIsFigureFile, fsMimeTypeForFile
from .pipelineRunner import (
    fnRunAllScenes,
    fnRunFromScene,
    fnRunSelectedScenes,
    fnVerifyOnly,
)
from .terminalSession import TerminalSession


STATIC_DIRECTORY = os.path.join(os.path.dirname(__file__), "static")


class SceneCreateRequest(BaseModel):
    sName: str
    sDirectory: str
    bPlotOnly: bool = True
    saSetupCommands: List[str] = []
    saCommands: List[str] = []
    saOutputFiles: List[str] = []


class SceneUpdateRequest(BaseModel):
    sName: Optional[str] = None
    sDirectory: Optional[str] = None
    bPlotOnly: Optional[bool] = None
    bEnabled: Optional[bool] = None
    saSetupCommands: Optional[List[str]] = None
    saCommands: Optional[List[str]] = None
    saOutputFiles: Optional[List[str]] = None


class ReorderRequest(BaseModel):
    iFromIndex: int
    iToIndex: int


class RunRequest(BaseModel):
    listSceneIndices: List[int] = []
    iStartScene: Optional[int] = None


def fappCreateApplication():
    """Build and return the configured FastAPI application."""
    app = FastAPI(title="Pipeleyen")
    connectionDocker = DockerConnection()
    dictScriptCache = {}
    dictScriptPathCache = {}
    dictTerminalSessions = {}

    def fsGetScriptPath(sContainerId):
        """Return the cached script.json path for a container."""
        sPath = dictScriptPathCache.get(sContainerId)
        if not sPath:
            raise HTTPException(404, "Not connected to container")
        return sPath

    def fsGetScriptDirectory(sContainerId):
        """Return the directory containing script.json."""
        return posixpath.dirname(fsGetScriptPath(sContainerId))

    def fdictGetVariables(sContainerId):
        """Build resolved variable dict for a connected container."""
        dictScript = dictScriptCache.get(sContainerId)
        sScriptPath = dictScriptPathCache.get(sContainerId)
        if not dictScript or not sScriptPath:
            return {}
        return sceneManager.fdictBuildGlobalVariables(
            dictScript, sScriptPath
        )

    # --- Container routes ---

    @app.get("/api/containers")
    async def fnGetContainers():
        try:
            return connectionDocker.flistGetRunningContainers()
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Docker error: {error}",
            )

    @app.get("/api/scripts/{sContainerId}")
    async def fnFindScripts(sContainerId: str):
        """Find all script.json files in the container."""
        try:
            return sceneManager.flistFindScriptsInContainer(
                connectionDocker, sContainerId
            )
        except Exception as error:
            raise HTTPException(500, f"Search failed: {error}")

    @app.post("/api/connect/{sContainerId}")
    async def fnConnectToContainer(
        sContainerId: str, sScriptPath: Optional[str] = None
    ):
        try:
            dictScript = sceneManager.fdictLoadScriptFromContainer(
                connectionDocker, sContainerId, sScriptPath
            )
            dictScriptCache[sContainerId] = dictScript
            sResolvedPath = sScriptPath
            if sResolvedPath is None:
                listPaths = sceneManager.flistFindScriptsInContainer(
                    connectionDocker, sContainerId
                )
                sResolvedPath = listPaths[0] if listPaths else None
            dictScriptPathCache[sContainerId] = sResolvedPath
            return {
                "sContainerId": sContainerId,
                "sScriptPath": sResolvedPath,
                "dictScript": dictScript,
            }
        except Exception as error:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to load script.json: {error}",
            )

    # --- Directory listing ---

    @app.get("/api/files/{sContainerId}/{sDirectoryPath:path}")
    async def fnListDirectory(
        sContainerId: str, sDirectoryPath: str
    ):
        """List files and directories at the given path."""
        sAbsPath = (
            sDirectoryPath
            if sDirectoryPath.startswith("/")
            else f"/workspace/{sDirectoryPath}"
        )
        sCommand = (
            f"find {sAbsPath} -maxdepth 1 -mindepth 1 "
            f"\\( -type f -o -type d \\) 2>/dev/null | sort"
        )
        iExitCode, sOutput = connectionDocker.ftResultExecuteCommand(
            sContainerId, sCommand
        )
        listEntries = []
        for sLine in sOutput.splitlines():
            sLine = sLine.strip()
            if not sLine:
                continue
            sName = posixpath.basename(sLine)
            iCheckDir, _ = connectionDocker.ftResultExecuteCommand(
                sContainerId, f"test -d {sLine} && echo d || echo f"
            )
            bIsDirectory = "d" in _
            listEntries.append(
                {
                    "sName": sName,
                    "sPath": sLine,
                    "bIsDirectory": bIsDirectory,
                }
            )
        return listEntries

    # --- Scene routes ---

    @app.get("/api/scenes/{sContainerId}")
    async def fnGetScenes(sContainerId: str):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        return sceneManager.flistExtractSceneNames(dictScript)

    @app.get("/api/scenes/{sContainerId}/{iSceneIndex}")
    async def fnGetScene(sContainerId: str, iSceneIndex: int):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        try:
            dictScene = sceneManager.fdictGetScene(
                dictScript, iSceneIndex
            )
            dictVariables = fdictGetVariables(sContainerId)
            dictScene["saResolvedOutputFiles"] = (
                sceneManager.flistResolveOutputFiles(
                    dictScene, dictVariables
                )
            )
            return dictScene
        except IndexError as error:
            raise HTTPException(404, str(error))

    @app.post("/api/scenes/{sContainerId}/create")
    async def fnCreateScene(
        sContainerId: str, request: SceneCreateRequest
    ):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        dictScene = sceneManager.fdictCreateScene(
            sName=request.sName,
            sDirectory=request.sDirectory,
            bPlotOnly=request.bPlotOnly,
            saSetupCommands=request.saSetupCommands,
            saCommands=request.saCommands,
            saOutputFiles=request.saOutputFiles,
        )
        dictScript["listScenes"].append(dictScene)
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            fsGetScriptPath(sContainerId),
        )
        return {
            "iIndex": len(dictScript["listScenes"]) - 1,
            "dictScene": dictScene,
        }

    @app.post("/api/scenes/{sContainerId}/insert/{iPosition}")
    async def fnInsertScene(
        sContainerId: str,
        iPosition: int,
        request: SceneCreateRequest,
    ):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        dictScene = sceneManager.fdictCreateScene(
            sName=request.sName,
            sDirectory=request.sDirectory,
            bPlotOnly=request.bPlotOnly,
            saSetupCommands=request.saSetupCommands,
            saCommands=request.saCommands,
            saOutputFiles=request.saOutputFiles,
        )
        sceneManager.fnInsertScene(dictScript, iPosition, dictScene)
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            fsGetScriptPath(sContainerId),
        )
        return {"iIndex": iPosition, "dictScene": dictScene}

    @app.put("/api/scenes/{sContainerId}/{iSceneIndex}")
    async def fnUpdateScene(
        sContainerId: str,
        iSceneIndex: int,
        request: SceneUpdateRequest,
    ):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        dictUpdates = {
            sKey: value
            for sKey, value in request.model_dump().items()
            if value is not None
        }
        try:
            sceneManager.fnUpdateScene(
                dictScript, iSceneIndex, dictUpdates
            )
        except IndexError as error:
            raise HTTPException(404, str(error))
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            fsGetScriptPath(sContainerId),
        )
        return dictScript["listScenes"][iSceneIndex]

    @app.delete("/api/scenes/{sContainerId}/{iSceneIndex}")
    async def fnDeleteScene(sContainerId: str, iSceneIndex: int):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        try:
            sceneManager.fnDeleteScene(dictScript, iSceneIndex)
        except IndexError as error:
            raise HTTPException(404, str(error))
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            fsGetScriptPath(sContainerId),
        )
        return {"bSuccess": True}

    @app.post("/api/scenes/{sContainerId}/reorder")
    async def fnReorderScenes(
        sContainerId: str, request: ReorderRequest
    ):
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            raise HTTPException(404, "Not connected to container")
        try:
            sceneManager.fnReorderScene(
                dictScript, request.iFromIndex, request.iToIndex
            )
        except IndexError as error:
            raise HTTPException(400, str(error))
        sceneManager.fnSaveScriptToContainer(
            connectionDocker, sContainerId, dictScript,
            fsGetScriptPath(sContainerId),
        )
        return sceneManager.flistExtractSceneNames(dictScript)

    # --- Figure routes ---

    @app.get("/api/figure/{sContainerId}/{sFilePath:path}")
    async def fnServeFigure(sContainerId: str, sFilePath: str):
        sScriptDirectory = fsGetScriptDirectory(sContainerId)
        if sFilePath.startswith("/"):
            sAbsPath = sFilePath
        else:
            sAbsPath = posixpath.join(sScriptDirectory, sFilePath)
        try:
            baContent = connectionDocker.fbaFetchFile(
                sContainerId, sAbsPath
            )
        except Exception as error:
            raise HTTPException(404, f"Figure not found: {error}")
        sMimeType = fsMimeTypeForFile(sAbsPath)
        return Response(content=baContent, media_type=sMimeType)

    # --- Pipeline execution WebSocket ---

    @app.websocket("/ws/pipeline/{sContainerId}")
    async def fnPipelineWebSocket(
        websocket: WebSocket, sContainerId: str
    ):
        await websocket.accept()
        dictScript = dictScriptCache.get(sContainerId)
        if not dictScript:
            await websocket.send_json(
                {"sType": "error", "sMessage": "Not connected"}
            )
            await websocket.close()
            return

        sScriptDirectory = posixpath.dirname(
            dictScriptPathCache.get(sContainerId, "")
        )

        try:
            while True:
                sMessage = await websocket.receive_text()
                dictRequest = json.loads(sMessage)

                async def fnCallback(dictEvent):
                    await websocket.send_json(dictEvent)

                sAction = dictRequest.get("sAction", "runAll")
                if sAction == "runAll":
                    await fnRunAllScenes(
                        connectionDocker,
                        sContainerId,
                        sScriptDirectory,
                        fnCallback,
                    )
                elif sAction == "runFrom":
                    iStart = dictRequest.get("iStartScene", 1)
                    await fnRunFromScene(
                        connectionDocker,
                        sContainerId,
                        iStart,
                        sScriptDirectory,
                        fnCallback,
                    )
                elif sAction == "verify":
                    await fnVerifyOnly(
                        connectionDocker,
                        sContainerId,
                        sScriptDirectory,
                        fnCallback,
                    )
                elif sAction == "runSelected":
                    listIndices = dictRequest.get(
                        "listSceneIndices", []
                    )
                    await fnRunSelectedScenes(
                        connectionDocker,
                        sContainerId,
                        listIndices,
                        dictScript,
                        dictScriptPathCache.get(sContainerId),
                        sScriptDirectory,
                        fnCallback,
                    )
        except WebSocketDisconnect:
            pass

    # --- Terminal WebSocket ---

    @app.websocket("/ws/terminal/{sContainerId}")
    async def fnTerminalWebSocket(
        websocket: WebSocket, sContainerId: str
    ):
        await websocket.accept()
        session = TerminalSession(connectionDocker, sContainerId)
        try:
            session.fnStart()
        except Exception as error:
            await websocket.send_json(
                {
                    "sType": "error",
                    "sMessage": f"Terminal failed: {error}",
                }
            )
            await websocket.close()
            return

        sSessionId = session.sSessionId
        dictTerminalSessions[sSessionId] = session
        await websocket.send_json(
            {"sType": "connected", "sSessionId": sSessionId}
        )

        async def fnReadLoop():
            while session._bRunning:
                try:
                    baOutput = session.fbaReadOutput()
                    if baOutput:
                        await websocket.send_bytes(baOutput)
                    else:
                        await asyncio.sleep(0.05)
                except Exception:
                    break

        taskReader = asyncio.create_task(fnReadLoop())
        try:
            while True:
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break
                if "bytes" in message:
                    session.fnSendInput(message["bytes"])
                elif "text" in message:
                    dictData = json.loads(message["text"])
                    if dictData.get("sType") == "resize":
                        session.fnResize(
                            dictData["iRows"],
                            dictData["iColumns"],
                        )
        except WebSocketDisconnect:
            pass
        finally:
            session.fnClose()
            taskReader.cancel()
            dictTerminalSessions.pop(sSessionId, None)

    # --- Static files ---

    @app.get("/")
    async def fnServeIndex():
        return FileResponse(
            os.path.join(STATIC_DIRECTORY, "index.html")
        )

    app.mount(
        "/static",
        StaticFiles(directory=STATIC_DIRECTORY),
        name="static",
    )

    return app
