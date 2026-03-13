"""Tests for dockerConnection module with mocked Docker API."""

import io
import tarfile
from unittest.mock import MagicMock, patch

import pytest

from pipeleyen.dockerConnection import DockerConnection


@pytest.fixture
def mockDockerClient():
    with patch("pipeleyen.dockerConnection.docker") as mockDocker:
        mockClient = MagicMock()
        mockDocker.from_env.return_value = mockClient
        yield mockClient


@pytest.fixture
def connection(mockDockerClient):
    return DockerConnection()


class TestFlistGetRunningContainers:
    def test_returnsContainerList(
        self, connection, mockDockerClient
    ):
        mockContainer = MagicMock()
        mockContainer.id = "abc123def456"
        mockContainer.short_id = "abc123d"
        mockContainer.name = "test-container"
        mockContainer.image.tags = ["ubuntu:latest"]
        mockDockerClient.containers.list.return_value = [
            mockContainer
        ]

        listResult = connection.flistGetRunningContainers()
        assert len(listResult) == 1
        assert listResult[0]["sName"] == "test-container"
        assert listResult[0]["sImage"] == "ubuntu:latest"
        assert listResult[0]["sShortId"] == "abc123d"

    def test_emptyList(self, connection, mockDockerClient):
        mockDockerClient.containers.list.return_value = []
        assert connection.flistGetRunningContainers() == []

    def test_imageWithoutTags(
        self, connection, mockDockerClient
    ):
        mockContainer = MagicMock()
        mockContainer.id = "abc123"
        mockContainer.short_id = "abc"
        mockContainer.name = "no-tag"
        mockContainer.image.tags = []
        mockContainer.image.id = "sha256:abcdef123456"
        mockDockerClient.containers.list.return_value = [
            mockContainer
        ]

        listResult = connection.flistGetRunningContainers()
        assert listResult[0]["sImage"] == "sha256:abcde"


class TestFtResultExecuteCommand:
    def test_successfulCommand(
        self, connection, mockDockerClient
    ):
        mockContainer = MagicMock()
        mockContainer.exec_run.return_value = (0, b"hello\n")
        mockDockerClient.containers.get.return_value = (
            mockContainer
        )

        iExitCode, sOutput = connection.ftResultExecuteCommand(
            "container-id", "echo hello"
        )
        assert iExitCode == 0
        assert sOutput == "hello\n"

    def test_failedCommand(
        self, connection, mockDockerClient
    ):
        mockContainer = MagicMock()
        mockContainer.exec_run.return_value = (
            1,
            b"error occurred",
        )
        mockDockerClient.containers.get.return_value = (
            mockContainer
        )

        iExitCode, sOutput = connection.ftResultExecuteCommand(
            "container-id", "bad-command"
        )
        assert iExitCode == 1
        assert "error occurred" in sOutput


class TestFbaFetchFile:
    def test_fetchesFileContent(
        self, connection, mockDockerClient
    ):
        baExpected = b"file content here"
        bufferTar = io.BytesIO()
        with tarfile.open(fileobj=bufferTar, mode="w") as tar:
            info = tarfile.TarInfo(name="test.json")
            info.size = len(baExpected)
            tar.addfile(info, io.BytesIO(baExpected))
        bufferTar.seek(0)

        mockContainer = MagicMock()
        mockContainer.get_archive.return_value = (
            [bufferTar.getvalue()],
            {"size": len(baExpected)},
        )
        mockDockerClient.containers.get.return_value = (
            mockContainer
        )

        baResult = connection.fbaFetchFile(
            "container-id", "/workspace/test.json"
        )
        assert baResult == baExpected


class TestFnWriteFile:
    def test_writesFileToContainer(
        self, connection, mockDockerClient
    ):
        mockContainer = MagicMock()
        mockDockerClient.containers.get.return_value = (
            mockContainer
        )

        connection.fnWriteFile(
            "container-id",
            "/workspace/output.json",
            b'{"key": "value"}',
        )
        mockContainer.put_archive.assert_called_once()
        sDirectory = mockContainer.put_archive.call_args[0][0]
        assert sDirectory == "/workspace"
