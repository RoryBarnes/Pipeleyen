/* Pipeleyen — Main application logic */

const PipeleyenApp = (function () {
    "use strict";

    let sContainerId = null;
    let dictScript = null;
    let iSelectedSceneIndex = -1;
    let wsPipeline = null;
    let dictSceneStatus = {};

    /* --- Initialization --- */

    function fnInitialize() {
        fnLoadContainers();
        fnBindToolbarEvents();
        fnBindContextMenuEvents();
        document.addEventListener("click", function () {
            fnHideContextMenu();
        });
    }

    /* --- Container Picker --- */

    async function fnLoadContainers() {
        try {
            const response = await fetch("/api/containers");
            const listContainers = await response.json();
            fnRenderContainerList(listContainers);
        } catch (error) {
            document.getElementById("listContainers").innerHTML =
                '<p style="color: var(--color-red);">Cannot connect to Docker</p>';
        }
    }

    function fnRenderContainerList(listContainers) {
        const elList = document.getElementById("listContainers");
        if (listContainers.length === 0) {
            elList.innerHTML =
                '<p style="color: var(--text-muted); text-align: center;">' +
                "No running containers found</p>";
            return;
        }
        elList.innerHTML = listContainers
            .map(function (container) {
                return (
                    '<div class="container-card" data-id="' +
                    container.sContainerId +
                    '">' +
                    '<span class="name">' +
                    fnEscapeHtml(container.sName) +
                    "</span>" +
                    '<span class="image">' +
                    fnEscapeHtml(container.sImage) +
                    "</span>" +
                    "</div>"
                );
            })
            .join("");
        elList.querySelectorAll(".container-card").forEach(function (el) {
            el.addEventListener("click", function () {
                fnConnectToContainer(el.dataset.id);
            });
        });
    }

    async function fnConnectToContainer(sId) {
        try {
            const response = await fetch("/api/connect/" + sId, {
                method: "POST",
            });
            if (!response.ok) {
                const detail = await response.json();
                fnShowToast(detail.detail || "Connection failed", "error");
                return;
            }
            const data = await response.json();
            sContainerId = sId;
            dictScript = data.dictScript;
            fnShowMainLayout();
            fnRenderSceneList();
            PipeleyenTerminal.fnCreateTab();
        } catch (error) {
            fnShowToast("Connection failed: " + error.message, "error");
        }
    }

    function fnShowMainLayout() {
        document.getElementById("containerPicker").style.display = "none";
        document.getElementById("mainLayout").classList.add("active");
    }

    function fnDisconnect() {
        sContainerId = null;
        dictScript = null;
        iSelectedSceneIndex = -1;
        dictSceneStatus = {};
        PipeleyenTerminal.fnCloseAll();
        document.getElementById("mainLayout").classList.remove("active");
        document.getElementById("containerPicker").style.display = "flex";
        fnLoadContainers();
    }

    /* --- Scene List --- */

    function fnRenderSceneList() {
        const elList = document.getElementById("listScenes");
        if (!dictScript || !dictScript.listScenes) {
            elList.innerHTML = "";
            return;
        }
        elList.innerHTML = dictScript.listScenes
            .map(function (scene, iIndex) {
                const sStatusClass =
                    dictSceneStatus[iIndex] || "";
                const bEnabled = scene.bEnabled !== false;
                const bSelected = iIndex === iSelectedSceneIndex;
                return (
                    '<div class="scene-item' +
                    (bSelected ? " selected" : "") +
                    '" data-index="' +
                    iIndex +
                    '" draggable="true">' +
                    '<input type="checkbox" class="scene-checkbox"' +
                    (bEnabled ? " checked" : "") +
                    ">" +
                    '<span class="scene-number">' +
                    String(iIndex + 1).padStart(2, "0") +
                    "</span>" +
                    '<span class="scene-name" title="' +
                    fnEscapeHtml(scene.sName) +
                    '">' +
                    fnEscapeHtml(scene.sName) +
                    "</span>" +
                    '<span class="scene-status ' +
                    sStatusClass +
                    '"></span>' +
                    '<span class="scene-actions">' +
                    '<button class="btn-icon scene-edit" title="Edit">&#9998;</button>' +
                    "</span>" +
                    "</div>"
                );
            })
            .join("");
        fnBindSceneEvents();
    }

    function fnBindSceneEvents() {
        const elList = document.getElementById("listScenes");
        elList.querySelectorAll(".scene-item").forEach(function (el) {
            const iIndex = parseInt(el.dataset.index);

            el.addEventListener("click", function (event) {
                if (
                    event.target.classList.contains("scene-checkbox") ||
                    event.target.classList.contains("scene-edit")
                ) {
                    return;
                }
                fnSelectScene(iIndex);
            });

            el.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                fnShowContextMenu(event.pageX, event.pageY, iIndex);
            });

            el.querySelector(".scene-checkbox").addEventListener(
                "change",
                function (event) {
                    fnToggleSceneEnabled(iIndex, event.target.checked);
                }
            );

            const btnEdit = el.querySelector(".scene-edit");
            if (btnEdit) {
                btnEdit.addEventListener("click", function () {
                    PipeleyenSceneEditor.fnOpenEditModal(iIndex);
                });
            }

            /* Drag and drop reordering */
            el.addEventListener("dragstart", function (event) {
                event.dataTransfer.setData("text/plain", String(iIndex));
                el.classList.add("dragging");
            });
            el.addEventListener("dragend", function () {
                el.classList.remove("dragging");
            });
            el.addEventListener("dragover", function (event) {
                event.preventDefault();
            });
            el.addEventListener("drop", function (event) {
                event.preventDefault();
                const iFromIndex = parseInt(
                    event.dataTransfer.getData("text/plain")
                );
                if (iFromIndex !== iIndex) {
                    fnReorderScene(iFromIndex, iIndex);
                }
            });
        });
    }

    function fnSelectScene(iIndex) {
        iSelectedSceneIndex = iIndex;
        fnRenderSceneList();
        PipeleyenFigureViewer.fnLoadSceneFigures(iIndex);
    }

    async function fnToggleSceneEnabled(iIndex, bEnabled) {
        try {
            await fetch(
                "/api/scenes/" + sContainerId + "/" + iIndex,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bEnabled: bEnabled }),
                }
            );
            dictScript.listScenes[iIndex].bEnabled = bEnabled;
        } catch (error) {
            fnShowToast("Failed to update scene", "error");
        }
    }

    async function fnReorderScene(iFromIndex, iToIndex) {
        try {
            const response = await fetch(
                "/api/scenes/" + sContainerId + "/reorder",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        iFromIndex: iFromIndex,
                        iToIndex: iToIndex,
                    }),
                }
            );
            if (response.ok) {
                const scene = dictScript.listScenes.splice(iFromIndex, 1)[0];
                dictScript.listScenes.splice(iToIndex, 0, scene);
                fnRenderSceneList();
                fnShowToast("Scene reordered", "success");
            }
        } catch (error) {
            fnShowToast("Reorder failed", "error");
        }
    }

    /* --- Toolbar Events --- */

    function fnBindToolbarEvents() {
        document.getElementById("btnRunSelected").addEventListener(
            "click",
            fnRunSelected
        );
        document.getElementById("btnRunAll").addEventListener(
            "click",
            fnRunAll
        );
        document.getElementById("btnVerify").addEventListener(
            "click",
            fnVerify
        );
        document.getElementById("btnVsCode").addEventListener(
            "click",
            fnOpenVsCode
        );
        document.getElementById("btnDisconnect").addEventListener(
            "click",
            fnDisconnect
        );
    }

    function fnConnectPipelineWebSocket() {
        if (wsPipeline) {
            return wsPipeline;
        }
        const sProtocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";
        const sUrl =
            sProtocol +
            "//" +
            window.location.host +
            "/ws/pipeline/" +
            sContainerId;
        wsPipeline = new WebSocket(sUrl);
        wsPipeline.onmessage = function (event) {
            const dictEvent = JSON.parse(event.data);
            fnHandlePipelineEvent(dictEvent);
        };
        wsPipeline.onclose = function () {
            wsPipeline = null;
        };
        return wsPipeline;
    }

    function fnHandlePipelineEvent(dictEvent) {
        if (dictEvent.sType === "scenePass") {
            dictSceneStatus[dictEvent.iSceneNumber - 1] = "pass";
            fnRenderSceneList();
        } else if (dictEvent.sType === "sceneFail") {
            dictSceneStatus[dictEvent.iSceneNumber - 1] = "fail";
            fnRenderSceneList();
        } else if (dictEvent.sType === "started") {
            fnShowToast("Pipeline started", "success");
        } else if (dictEvent.sType === "completed") {
            fnShowToast("Pipeline completed", "success");
        } else if (dictEvent.sType === "failed") {
            fnShowToast(
                "Pipeline failed (exit " + dictEvent.iExitCode + ")",
                "error"
            );
        } else if (dictEvent.sType === "output") {
            /* Output lines could be shown in a log panel */
        }
    }

    function fnSendPipelineAction(dictAction) {
        const ws = fnConnectPipelineWebSocket();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(dictAction));
        } else {
            ws.addEventListener("open", function () {
                ws.send(JSON.stringify(dictAction));
            }, { once: true });
        }
    }

    function fnRunSelected() {
        const listIndices = [];
        document
            .querySelectorAll(".scene-checkbox:checked")
            .forEach(function (el) {
                const iIndex = parseInt(
                    el.closest(".scene-item").dataset.index
                );
                listIndices.push(iIndex);
                dictSceneStatus[iIndex] = "running";
            });
        fnRenderSceneList();
        fnSendPipelineAction({
            sAction: "runSelected",
            listSceneIndices: listIndices,
        });
    }

    function fnRunAll() {
        dictScript.listScenes.forEach(function (_, iIndex) {
            dictSceneStatus[iIndex] = "running";
        });
        fnRenderSceneList();
        fnSendPipelineAction({ sAction: "runAll" });
    }

    function fnVerify() {
        fnSendPipelineAction({ sAction: "verify" });
    }

    function fnOpenVsCode() {
        const sHexId = sContainerId.replace(/-/g, "");
        const sUri =
            "vscode://ms-vscode-remote.remote-containers/attach?containerId=" +
            sHexId;
        window.open(sUri, "_blank");
        fnShowToast("Opening VS Code...", "success");
    }

    /* --- Context Menu --- */

    let iContextSceneIndex = -1;

    function fnShowContextMenu(iX, iY, iIndex) {
        iContextSceneIndex = iIndex;
        const el = document.getElementById("contextMenu");
        el.style.left = iX + "px";
        el.style.top = iY + "px";
        el.classList.add("active");
    }

    function fnHideContextMenu() {
        document.getElementById("contextMenu").classList.remove("active");
    }

    function fnBindContextMenuEvents() {
        document
            .querySelectorAll(".context-menu-item")
            .forEach(function (el) {
                el.addEventListener("click", function (event) {
                    event.stopPropagation();
                    const sAction = el.dataset.action;
                    fnHandleContextAction(sAction, iContextSceneIndex);
                    fnHideContextMenu();
                });
            });
    }

    function fnHandleContextAction(sAction, iIndex) {
        if (sAction === "edit") {
            PipeleyenSceneEditor.fnOpenEditModal(iIndex);
        } else if (sAction === "runFrom") {
            fnSendPipelineAction({
                sAction: "runFrom",
                iStartScene: iIndex + 1,
            });
        } else if (sAction === "insertBefore") {
            PipeleyenSceneEditor.fnOpenInsertModal(iIndex);
        } else if (sAction === "insertAfter") {
            PipeleyenSceneEditor.fnOpenInsertModal(iIndex + 1);
        } else if (sAction === "delete") {
            fnDeleteScene(iIndex);
        }
    }

    async function fnDeleteScene(iIndex) {
        const sName = dictScript.listScenes[iIndex].sName;
        if (!confirm('Delete scene "' + sName + '"?')) {
            return;
        }
        try {
            const response = await fetch(
                "/api/scenes/" + sContainerId + "/" + iIndex,
                { method: "DELETE" }
            );
            if (response.ok) {
                dictScript.listScenes.splice(iIndex, 1);
                if (iSelectedSceneIndex === iIndex) {
                    iSelectedSceneIndex = -1;
                }
                fnRenderSceneList();
                fnShowToast("Scene deleted", "success");
            }
        } catch (error) {
            fnShowToast("Delete failed", "error");
        }
    }

    /* --- Toast Notifications --- */

    function fnShowToast(sMessage, sType) {
        const el = document.createElement("div");
        el.className = "toast " + (sType || "");
        el.textContent = sMessage;
        document.getElementById("toastContainer").appendChild(el);
        setTimeout(function () {
            el.remove();
        }, 4000);
    }

    /* --- Utilities --- */

    function fnEscapeHtml(sText) {
        const el = document.createElement("span");
        el.textContent = sText;
        return el.innerHTML;
    }

    /* --- Public API --- */

    return {
        fnInitialize: fnInitialize,
        fnShowToast: fnShowToast,
        fnRenderSceneList: fnRenderSceneList,
        fnEscapeHtml: fnEscapeHtml,
        fsGetContainerId: function () {
            return sContainerId;
        },
        fdictGetScript: function () {
            return dictScript;
        },
        fiGetSelectedSceneIndex: function () {
            return iSelectedSceneIndex;
        },
    };
})();

document.addEventListener("DOMContentLoaded", PipeleyenApp.fnInitialize);
