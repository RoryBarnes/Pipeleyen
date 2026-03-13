"""Tests for pipelineRunner module."""

import asyncio
import json
from unittest.mock import MagicMock

import pytest

from pipeleyen.pipelineRunner import (
    PATTERN_SCENE_FAILED,
    PATTERN_SCENE_SUCCESS,
    fnRunAllScenes,
    fnRunFromScene,
    fnVerifyOnly,
)


class TestPatternMatching:
    def test_successPattern(self):
        sLine = "  SUCCESS: Scene03"
        match = PATTERN_SCENE_SUCCESS.search(sLine)
        assert match is not None
        assert match.group(1) == "03"

    def test_failedPattern(self):
        sLine = "  FAILED: Scene12 — Exit code 1: bad command"
        match = PATTERN_SCENE_FAILED.search(sLine)
        assert match is not None
        assert match.group(1) == "12"

    def test_noMatch(self):
        sLine = "  Running: python script.py"
        assert PATTERN_SCENE_SUCCESS.search(sLine) is None
        assert PATTERN_SCENE_FAILED.search(sLine) is None


class TestFnRunAllScenes:
    @pytest.mark.asyncio
    async def test_callsDirector(self):
        mockConnection = MagicMock()
        mockConnection.ftResultExecuteCommand.return_value = (
            0,
            "SUCCESS: Scene01\n",
        )

        listEvents = []

        async def fnCallback(dictEvent):
            listEvents.append(dictEvent)

        iResult = await fnRunAllScenes(
            mockConnection, "container-id", fnCallback
        )
        assert iResult == 0
        mockConnection.ftResultExecuteCommand.assert_called_once()
        sCommand = (
            mockConnection.ftResultExecuteCommand.call_args[0][1]
        )
        assert "director.py" in sCommand
        assert any(
            e["sType"] == "started" for e in listEvents
        )
        assert any(
            e["sType"] == "completed" for e in listEvents
        )


class TestFnRunFromScene:
    @pytest.mark.asyncio
    async def test_passesStartScene(self):
        mockConnection = MagicMock()
        mockConnection.ftResultExecuteCommand.return_value = (
            0,
            "",
        )

        async def fnCallback(dictEvent):
            pass

        await fnRunFromScene(
            mockConnection, "cid", 5, fnCallback
        )
        sCommand = (
            mockConnection.ftResultExecuteCommand.call_args[0][1]
        )
        assert "--start-scene 5" in sCommand


class TestFnVerifyOnly:
    @pytest.mark.asyncio
    async def test_passesVerifyFlag(self):
        mockConnection = MagicMock()
        mockConnection.ftResultExecuteCommand.return_value = (
            0,
            "",
        )

        async def fnCallback(dictEvent):
            pass

        await fnVerifyOnly(
            mockConnection, "cid", fnCallback
        )
        sCommand = (
            mockConnection.ftResultExecuteCommand.call_args[0][1]
        )
        assert "--verify-only" in sCommand
