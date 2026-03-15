"""Integration tests using FastAPI TestClient with mocked Docker."""

import io
import json
import tarfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mockDockerEnv(dictSampleScript, baSampleScriptBytes):
    """Set up a fully mocked Docker environment."""
    with patch("pipeleyen.dockerConnection.docker") as mockDocker:
        mockClient = MagicMock()
        mockDocker.from_env.return_value = mockClient

        mockContainer = MagicMock()
        mockContainer.id = "test-container-id-12345"
        mockContainer.short_id = "test-co"
        mockContainer.name = "test-gj1132"
        mockContainer.image.tags = ["gj1132:latest"]
        mockClient.containers.list.return_value = [mockContainer]
        mockClient.containers.get.return_value = mockContainer

        bufferTar = io.BytesIO()
        with tarfile.open(fileobj=bufferTar, mode="w") as tar:
            info = tarfile.TarInfo(name="script.json")
            info.size = len(baSampleScriptBytes)
            tar.addfile(info, io.BytesIO(baSampleScriptBytes))
        bufferTar.seek(0)
        mockContainer.get_archive.return_value = (
            [bufferTar.getvalue()],
            {"size": len(baSampleScriptBytes)},
        )
        mockContainer.put_archive.return_value = True
        mockContainer.exec_run.return_value = (
            0,
            b"/workspace/GJ1132/script.json\n",
        )

        yield {
            "mockClient": mockClient,
            "mockContainer": mockContainer,
            "sContainerId": mockContainer.id,
        }


@pytest.fixture
def client(mockDockerEnv):
    from pipeleyen.serverApplication import fappCreateApplication

    app = fappCreateApplication()
    return TestClient(app)


class TestGetContainers:
    def test_returnsContainerList(self, client):
        response = client.get("/api/containers")
        assert response.status_code == 200
        listContainers = response.json()
        assert len(listContainers) == 1
        assert listContainers[0]["sName"] == "test-gj1132"


class TestConnectToContainer:
    def test_loadsScript(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        response = client.post(
            f"/api/connect/{sId}",
            params={"sScriptPath": "/workspace/GJ1132/script.json"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sContainerId"] == sId
        assert data["sScriptPath"] == "/workspace/GJ1132/script.json"
        assert "listScenes" in data["dictScript"]
        assert len(data["dictScript"]["listScenes"]) == 3


class TestSceneCrud:
    def _fnConnect(self, client, sContainerId):
        client.post(
            f"/api/connect/{sContainerId}",
            params={"sScriptPath": "/workspace/GJ1132/script.json"},
        )

    def test_getSceneList(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.get(f"/api/scenes/{sId}")
        assert response.status_code == 200
        listScenes = response.json()
        assert len(listScenes) == 3
        assert listScenes[0]["sName"] == "Scene Alpha"

    def test_getScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.get(f"/api/scenes/{sId}/1")
        assert response.status_code == 200
        assert response.json()["sName"] == "Scene Beta"

    def test_createScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.post(
            f"/api/scenes/{sId}/create",
            json={
                "sName": "New Scene",
                "sDirectory": "new_dir",
                "saCommands": ["python new.py"],
                "saOutputFiles": ["new.pdf"],
            },
        )
        assert response.status_code == 200
        assert response.json()["dictScene"]["sName"] == "New Scene"
        assert response.json()["iIndex"] == 3

    def test_insertScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.post(
            f"/api/scenes/{sId}/insert/1",
            json={
                "sName": "Inserted",
                "sDirectory": "insert_dir",
                "saCommands": ["python insert.py"],
                "saOutputFiles": [],
            },
        )
        assert response.status_code == 200
        assert response.json()["iIndex"] == 1

    def test_updateScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.put(
            f"/api/scenes/{sId}/0",
            json={"sName": "Updated Alpha"},
        )
        assert response.status_code == 200
        assert response.json()["sName"] == "Updated Alpha"

    def test_deleteScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.delete(f"/api/scenes/{sId}/0")
        assert response.status_code == 200
        listScenes = client.get(f"/api/scenes/{sId}").json()
        assert len(listScenes) == 2

    def test_reorderScene(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.post(
            f"/api/scenes/{sId}/reorder",
            json={"iFromIndex": 0, "iToIndex": 2},
        )
        assert response.status_code == 200
        dictResult = response.json()
        listScenes = dictResult["listScenes"]
        assert listScenes[0]["sName"] == "Scene Beta"
        assert listScenes[2]["sName"] == "Scene Alpha"


class TestSettings:
    def _fnConnect(self, client, sContainerId):
        client.post(
            f"/api/connect/{sContainerId}",
            params={"sScriptPath": "/workspace/GJ1132/script.json"},
        )

    def test_getSettings(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.get(f"/api/settings/{sId}")
        assert response.status_code == 200
        data = response.json()
        assert data["sPlotDirectory"] == "Plot"
        assert data["sFigureType"] == "pdf"

    def test_updateSettings(self, client, mockDockerEnv):
        sId = mockDockerEnv["sContainerId"]
        self._fnConnect(client, sId)
        response = client.put(
            f"/api/settings/{sId}",
            json={"sFigureType": "png"},
        )
        assert response.status_code == 200
        assert response.json()["sFigureType"] == "png"
        response2 = client.get(f"/api/settings/{sId}")
        assert response2.json()["sFigureType"] == "png"


class TestServeIndex:
    def test_servesHtml(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert "PIPELEYEN" in response.text
