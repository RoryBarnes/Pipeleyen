"""Docker container discovery, command execution, and file transfer."""

import io
import tarfile

import docker


class DockerConnection:
    """Wraps docker-py client for container operations."""

    def __init__(self):
        self._clientDocker = docker.from_env()
        self._dictContainers = {}

    def flistGetRunningContainers(self):
        """Return list of dicts with container id, name, image."""
        listContainers = self._clientDocker.containers.list(
            filters={"status": "running"}
        )
        listResult = []
        for container in listContainers:
            listResult.append(
                {
                    "sContainerId": container.id,
                    "sShortId": container.short_id,
                    "sName": container.name,
                    "sImage": str(container.image.tags[0])
                    if container.image.tags
                    else str(container.image.id[:12]),
                }
            )
            self._dictContainers[container.id] = container
        return listResult

    def fcontainerGetById(self, sContainerId):
        """Return the container object, refreshing if needed."""
        if sContainerId in self._dictContainers:
            return self._dictContainers[sContainerId]
        container = self._clientDocker.containers.get(sContainerId)
        self._dictContainers[sContainerId] = container
        return container

    def ftResultExecuteCommand(
        self, sContainerId, sCommand, sWorkdir=None
    ):
        """Run a command and return (iExitCode, sOutput)."""
        container = self.fcontainerGetById(sContainerId)
        dictKwargs = {"cmd": ["/bin/bash", "-c", sCommand]}
        if sWorkdir:
            dictKwargs["workdir"] = sWorkdir
        iExitCode, baOutput = container.exec_run(**dictKwargs)
        sOutput = baOutput.decode("utf-8", errors="replace")
        return (iExitCode, sOutput)

    def fbaFetchFile(self, sContainerId, sFilePath):
        """Fetch a file from the container and return its bytes."""
        container = self.fcontainerGetById(sContainerId)
        taBits, taStat = container.get_archive(sFilePath)
        baArchive = b"".join(taBits)
        fileTar = tarfile.open(fileobj=io.BytesIO(baArchive))
        member = fileTar.getmembers()[0]
        fileExtracted = fileTar.extractfile(member)
        if fileExtracted is None:
            raise FileNotFoundError(
                f"Cannot read file from container: {sFilePath}"
            )
        return fileExtracted.read()

    def fnWriteFile(self, sContainerId, sFilePath, baContent):
        """Write bytes to a file inside the container."""
        import posixpath

        container = self.fcontainerGetById(sContainerId)
        sDirectory = posixpath.dirname(sFilePath)
        sFilename = posixpath.basename(sFilePath)
        bufferTar = io.BytesIO()
        with tarfile.open(fileobj=bufferTar, mode="w") as fileTar:
            info = tarfile.TarInfo(name=sFilename)
            info.size = len(baContent)
            fileTar.addfile(info, io.BytesIO(baContent))
        bufferTar.seek(0)
        container.put_archive(sDirectory, bufferTar)

    def fdictExecCreate(
        self, sContainerId, sCommand="/bin/bash", sUser=None
    ):
        """Create an interactive exec instance, return exec id."""
        container = self.fcontainerGetById(sContainerId)
        dictKwargs = {
            "cmd": sCommand,
            "tty": True,
            "stdin": True,
            "stdout": True,
            "stderr": True,
        }
        if sUser:
            dictKwargs["user"] = sUser
        sExecId = self._clientDocker.api.exec_create(
            container.id, **dictKwargs
        )["Id"]
        return sExecId

    def fsocketExecStart(self, sExecId):
        """Start exec and return the raw socket."""
        return self._clientDocker.api.exec_start(
            sExecId, socket=True, tty=True
        )

    def fnExecResize(self, sExecId, iRows, iColumns):
        """Resize the PTY of an exec instance."""
        self._clientDocker.api.exec_resize(
            sExecId, height=iRows, width=iColumns
        )
