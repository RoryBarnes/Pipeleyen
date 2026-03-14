/* Pipeleyen — Main application logic */

const PipeleyenApp = (function () {
    "use strict";

    let sContainerId = null;
    let dictScript = null;
    let sScriptPath = null;
    let iSelectedSceneIndex = -1;
    let iExpandedSceneIndex = -1;
    let wsPipeline = null;
    let dictSceneStatus = {};

    /* --- Initialization --- */

    function fnInitialize() {
        fnLoadContainers();
        fnBindToolbarEvents();
        fnBindContextMenuEvents();
        fnBindLeftPanelTabs();
        fnBindResizeHandles();
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
            const responseScripts = await fetch("/api/scripts/" + sId);
            const listScripts = await responseScripts.json();

            let sChosenPath = null;
            if (listScripts.length === 0) {
                fnShowToast("No script.json found in container", "error");
                return;
            } else if (listScripts.length === 1) {
                sChosenPath = listScripts[0];
            } else {
                sChosenPath = prompt(
                    "Multiple script.json files found:\n\n" +
                    listScripts
                        .map(function (s, i) { return (i + 1) + ") " + s; })
                        .join("\n") +
                    "\n\nEnter the full path:",
                    listScripts[0]
                );
                if (!sChosenPath) return;
            }

            const response = await fetch(
                "/api/connect/" + sId +
                "?sScriptPath=" + encodeURIComponent(sChosenPath),
                { method: "POST" }
            );
            if (!response.ok) {
                const detail = await response.json();
                fnShowToast(detail.detail || "Connection failed", "error");
                return;
            }
            const data = await response.json();
            sContainerId = sId;
            dictScript = data.dictScript;
            sScriptPath = data.sScriptPath;
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
        sScriptPath = null;
        iSelectedSceneIndex = -1;
        iExpandedSceneIndex = -1;
        dictSceneStatus = {};
        if (wsPipeline) {
            wsPipeline.close();
            wsPipeline = null;
        }
        PipeleyenTerminal.fnCloseAll();
        document.getElementById("mainLayout").classList.remove("active");
        document.getElementById("containerPicker").style.display = "flex";
        fnLoadContainers();
    }

    /* --- Left Panel Tabs --- */

    function fnBindLeftPanelTabs() {
        document.querySelectorAll(".left-tab").forEach(function (el) {
            el.addEventListener("click", function () {
                document.querySelectorAll(".left-tab").forEach(function (t) {
                    t.classList.remove("active");
                });
                el.classList.add("active");
                var sPanel = el.dataset.panel;
                document.getElementById("panelScenes").classList.toggle(
                    "active", sPanel === "scenes"
                );
                document.getElementById("panelFiles").classList.toggle(
                    "active", sPanel === "files"
                );
                if (sPanel === "files") {
                    PipeleyenFiles.fnLoadDirectory(
                        fsGetScriptDirectory()
                    );
                }
            });
        });
    }

    function fsGetScriptDirectory() {
        if (!sScriptPath) return "/workspace";
        var iLastSlash = sScriptPath.lastIndexOf("/");
        return iLastSlash > 0 ? sScriptPath.substring(0, iLastSlash) : "/workspace";
    }

    /* --- Scene List --- */

    function fnRenderSceneList() {
        var elList = document.getElementById("listScenes");
        if (!dictScript || !dictScript.listScenes) {
            elList.innerHTML = "";
            return;
        }
        var sHtml = "";
        dictScript.listScenes.forEach(function (scene, iIndex) {
            var sStatusClass = dictSceneStatus[iIndex] || "";
            var bEnabled = scene.bEnabled !== false;
            var bSelected = iIndex === iSelectedSceneIndex;
            var bExpanded = iIndex === iExpandedSceneIndex;

            sHtml +=
                '<div class="scene-item' +
                (bSelected ? " selected" : "") +
                '" data-index="' + iIndex + '" draggable="true">' +
                '<input type="checkbox" class="scene-checkbox"' +
                (bEnabled ? " checked" : "") + ">" +
                '<span class="scene-number">' +
                String(iIndex + 1).padStart(2, "0") + "</span>" +
                '<span class="scene-name" title="' +
                fnEscapeHtml(scene.sName) + '">' +
                fnEscapeHtml(scene.sName) + "</span>" +
                '<span class="scene-status ' + sStatusClass + '"></span>' +
                '<span class="scene-actions">' +
                '<button class="btn-icon scene-edit" title="Edit">&#9998;</button>' +
                "</span></div>";

            /* Expandable detail */
            sHtml += '<div class="scene-detail' +
                (bExpanded ? " expanded" : "") +
                '" data-index="' + iIndex + '">';
            sHtml += '<div class="detail-label">Directory</div>';
            sHtml += '<div class="detail-field" data-view="field" data-field="sDirectory">' +
                fnEscapeHtml(scene.sDirectory) + "</div>";
            sHtml += '<div class="detail-label">Plot Only: ' +
                (scene.bPlotOnly !== false ? "Yes" : "No") + "</div>";

            if (scene.saSetupCommands && scene.saSetupCommands.length > 0) {
                sHtml += '<div class="detail-label">Setup Commands</div>';
                scene.saSetupCommands.forEach(function (sCmd) {
                    sHtml += '<div class="detail-command" data-view="command">' +
                        fnEscapeHtml(sCmd) + "</div>";
                });
            }
            if (scene.saCommands && scene.saCommands.length > 0) {
                sHtml += '<div class="detail-label">Commands</div>';
                scene.saCommands.forEach(function (sCmd) {
                    sHtml += '<div class="detail-command" data-view="command">' +
                        fnEscapeHtml(sCmd) + "</div>";
                });
            }
            if (scene.saOutputFiles && scene.saOutputFiles.length > 0) {
                sHtml += '<div class="detail-label">Output Files</div>';
                scene.saOutputFiles.forEach(function (sFile) {
                    var bIsFigure = fbIsFigureFile(sFile);
                    sHtml += '<div class="detail-output' +
                        (bIsFigure ? " figure" : "") +
                        '" data-view="output" data-path="' +
                        fnEscapeHtml(sFile) + '">' +
                        fnEscapeHtml(sFile) + "</div>";
                });
            }
            sHtml += "</div>";
        });
        elList.innerHTML = sHtml;
        fnBindSceneEvents();
    }

    function fbIsFigureFile(sPath) {
        var sLower = sPath.toLowerCase();
        return sLower.endsWith(".pdf") || sLower.endsWith(".png") ||
            sLower.endsWith(".jpg") || sLower.endsWith(".jpeg") ||
            sLower.endsWith(".svg");
    }

    function fnBindSceneEvents() {
        var elList = document.getElementById("listScenes");
        elList.querySelectorAll(".scene-item").forEach(function (el) {
            var iIndex = parseInt(el.dataset.index);

            el.addEventListener("click", function (event) {
                if (event.target.classList.contains("scene-checkbox") ||
                    event.target.classList.contains("scene-edit")) {
                    return;
                }
                fnToggleSceneExpand(iIndex);
            });

            el.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                fnShowContextMenu(event.pageX, event.pageY, iIndex);
            });

            el.querySelector(".scene-checkbox").addEventListener(
                "change", function (event) {
                    fnToggleSceneEnabled(iIndex, event.target.checked);
                }
            );

            var btnEdit = el.querySelector(".scene-edit");
            if (btnEdit) {
                btnEdit.addEventListener("click", function () {
                    PipeleyenSceneEditor.fnOpenEditModal(iIndex);
                });
            }

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
                var iFromIndex = parseInt(
                    event.dataTransfer.getData("text/plain")
                );
                if (iFromIndex !== iIndex) {
                    fnReorderScene(iFromIndex, iIndex);
                }
            });
        });

        /* Bind detail item clicks */
        elList.querySelectorAll("[data-view='output']").forEach(function (el) {
            el.addEventListener("click", function () {
                var sPath = el.dataset.path;
                if (fbIsFigureFile(sPath)) {
                    PipeleyenFigureViewer.fnDisplayFigureByTemplate(sPath);
                } else {
                    fnShowFieldView("Output File", sPath);
                }
            });
        });

        elList.querySelectorAll("[data-view='command']").forEach(function (el) {
            el.addEventListener("click", function () {
                fnShowFieldView("Command", el.textContent);
            });
        });

        elList.querySelectorAll("[data-view='field']").forEach(function (el) {
            el.addEventListener("click", function () {
                fnShowFieldView(el.dataset.field, el.textContent);
            });
        });
    }

    function fnToggleSceneExpand(iIndex) {
        if (iExpandedSceneIndex === iIndex) {
            iExpandedSceneIndex = -1;
        } else {
            iExpandedSceneIndex = iIndex;
        }
        iSelectedSceneIndex = iIndex;
        fnRenderSceneList();
        PipeleyenFigureViewer.fnLoadSceneFigures(iIndex);
    }

    function fnShowFieldView(sLabel, sValue) {
        var elViewport = document.getElementById("figureViewport");
        var elViewContent = document.getElementById("viewContent");
        elViewport.style.display = "none";
        elViewContent.classList.add("active");
        elViewContent.innerHTML =
            '<div class="view-title">' + fnEscapeHtml(sLabel) + "</div>" +
            "<pre>" + fnEscapeHtml(sValue) + "</pre>";
    }

    function fnShowFigureViewport() {
        document.getElementById("figureViewport").style.display = "";
        document.getElementById("viewContent").classList.remove("active");
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
            var response = await fetch(
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
                var scene = dictScript.listScenes.splice(iFromIndex, 1)[0];
                dictScript.listScenes.splice(iToIndex, 0, scene);
                fnRenderSceneList();
                fnShowToast("Scene reordered", "success");
            }
        } catch (error) {
            fnShowToast("Reorder failed", "error");
        }
    }

    /* --- Resize Handles --- */

    function fnBindResizeHandles() {
        /* Horizontal: left panel width */
        var elLeft = document.getElementById("panelLeft");
        var elHandleH = elLeft.querySelector(".resize-handle-horizontal");
        if (elHandleH) {
            fnMakeDraggable(elHandleH, function (iDeltaX) {
                var iWidth = elLeft.offsetWidth + iDeltaX;
                iWidth = Math.max(180, Math.min(iWidth, 600));
                document.getElementById("mainLayout").style.gridTemplateColumns =
                    iWidth + "px 1fr";
            });
        }

        /* Vertical: figure/terminal split */
        var elHandleV = document.getElementById("resizeHandleVertical");
        if (elHandleV) {
            var elFigure = document.getElementById("panelFigure");
            fnMakeDraggableVertical(elHandleV, function (iDeltaY) {
                var iHeight = elFigure.offsetHeight + iDeltaY;
                iHeight = Math.max(80, iHeight);
                elFigure.style.flex = "0 0 " + iHeight + "px";
            });
        }
    }

    function fnMakeDraggable(elHandle, fnOnMove) {
        var iStartX = 0;
        elHandle.addEventListener("mousedown", function (event) {
            iStartX = event.clientX;
            event.preventDefault();
            function fnMouseMove(e) {
                var iDelta = e.clientX - iStartX;
                iStartX = e.clientX;
                fnOnMove(iDelta);
            }
            function fnMouseUp() {
                document.removeEventListener("mousemove", fnMouseMove);
                document.removeEventListener("mouseup", fnMouseUp);
            }
            document.addEventListener("mousemove", fnMouseMove);
            document.addEventListener("mouseup", fnMouseUp);
        });
    }

    function fnMakeDraggableVertical(elHandle, fnOnMove) {
        elHandle.addEventListener("mousedown", function (event) {
            var iStartY = event.clientY;
            event.preventDefault();
            function fnMouseMove(e) {
                var iDelta = e.clientY - iStartY;
                iStartY = e.clientY;
                fnOnMove(iDelta);
            }
            function fnMouseUp() {
                document.removeEventListener("mousemove", fnMouseMove);
                document.removeEventListener("mouseup", fnMouseUp);
                PipeleyenTerminal.fnFitActiveTerminal();
            }
            document.addEventListener("mousemove", fnMouseMove);
            document.addEventListener("mouseup", fnMouseUp);
        });
    }

    /* --- Toolbar Events --- */

    function fnBindToolbarEvents() {
        document.getElementById("btnRunSelected").addEventListener(
            "click", fnRunSelected
        );
        document.getElementById("btnRunAll").addEventListener(
            "click", fnRunAll
        );
        document.getElementById("btnVerify").addEventListener(
            "click", fnVerify
        );
        document.getElementById("btnVsCode").addEventListener(
            "click", fnOpenVsCode
        );
        document.getElementById("btnDisconnect").addEventListener(
            "click", fnDisconnect
        );
    }

    function fnConnectPipelineWebSocket() {
        if (wsPipeline && wsPipeline.readyState === WebSocket.OPEN) {
            return wsPipeline;
        }
        var sProtocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";
        var sUrl =
            sProtocol + "//" + window.location.host +
            "/ws/pipeline/" + sContainerId;
        wsPipeline = new WebSocket(sUrl);
        wsPipeline.onmessage = function (event) {
            fnHandlePipelineEvent(JSON.parse(event.data));
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
                "Pipeline failed (exit " + dictEvent.iExitCode + ")", "error"
            );
        }
    }

    function fnSendPipelineAction(dictAction) {
        var ws = fnConnectPipelineWebSocket();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(dictAction));
        } else {
            ws.addEventListener("open", function () {
                ws.send(JSON.stringify(dictAction));
            }, { once: true });
        }
    }

    function fnRunSelected() {
        var listIndices = [];
        document.querySelectorAll(".scene-checkbox:checked")
            .forEach(function (el) {
                var iIndex = parseInt(
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
        var sHexId = sContainerId.replace(/-/g, "");
        var sUri =
            "vscode://ms-vscode-remote.remote-containers/attach?containerId=" +
            sHexId;
        window.open(sUri, "_blank");
        fnShowToast("Opening VS Code...", "success");
    }

    /* --- Context Menu --- */

    var iContextSceneIndex = -1;

    function fnShowContextMenu(iX, iY, iIndex) {
        iContextSceneIndex = iIndex;
        var el = document.getElementById("contextMenu");
        el.style.left = iX + "px";
        el.style.top = iY + "px";
        el.classList.add("active");
    }

    function fnHideContextMenu() {
        document.getElementById("contextMenu").classList.remove("active");
    }

    function fnBindContextMenuEvents() {
        document.querySelectorAll(".context-menu-item")
            .forEach(function (el) {
                el.addEventListener("click", function (event) {
                    event.stopPropagation();
                    fnHandleContextAction(el.dataset.action, iContextSceneIndex);
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
        var sName = dictScript.listScenes[iIndex].sName;
        if (!confirm('Delete scene "' + sName + '"?')) {
            return;
        }
        try {
            var response = await fetch(
                "/api/scenes/" + sContainerId + "/" + iIndex,
                { method: "DELETE" }
            );
            if (response.ok) {
                dictScript.listScenes.splice(iIndex, 1);
                if (iSelectedSceneIndex === iIndex) {
                    iSelectedSceneIndex = -1;
                }
                if (iExpandedSceneIndex === iIndex) {
                    iExpandedSceneIndex = -1;
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
        var el = document.createElement("div");
        el.className = "toast " + (sType || "");
        el.textContent = sMessage;
        document.getElementById("toastContainer").appendChild(el);
        setTimeout(function () { el.remove(); }, 4000);
    }

    /* --- Utilities --- */

    function fnEscapeHtml(sText) {
        var el = document.createElement("span");
        el.textContent = sText;
        return el.innerHTML;
    }

    /* --- Public API --- */

    return {
        fnInitialize: fnInitialize,
        fnShowToast: fnShowToast,
        fnRenderSceneList: fnRenderSceneList,
        fnEscapeHtml: fnEscapeHtml,
        fnShowFigureViewport: fnShowFigureViewport,
        fnShowFieldView: fnShowFieldView,
        fsGetContainerId: function () { return sContainerId; },
        fdictGetScript: function () { return dictScript; },
        fsGetScriptPath: function () { return sScriptPath; },
        fiGetSelectedSceneIndex: function () { return iSelectedSceneIndex; },
    };
})();

/* --- File Browser --- */

var PipeleyenFiles = (function () {
    "use strict";

    var sCurrentPath = "/workspace";

    async function fnLoadDirectory(sPath) {
        sCurrentPath = sPath || "/workspace";
        var sContainerId = PipeleyenApp.fsGetContainerId();
        if (!sContainerId) return;

        fnRenderBreadcrumb(sCurrentPath);

        try {
            var response = await fetch(
                "/api/files/" + sContainerId + "/" +
                encodeURIComponent(sCurrentPath)
            );
            var listEntries = await response.json();
            fnRenderFileList(listEntries);
        } catch (error) {
            document.getElementById("listFiles").innerHTML =
                '<p style="padding:14px;color:var(--text-muted)">Error loading directory</p>';
        }
    }

    function fnRenderBreadcrumb(sPath) {
        var elBreadcrumb = document.getElementById("fileBreadcrumb");
        var listParts = sPath.split("/").filter(Boolean);
        var sHtml = "";
        var sBuiltPath = "";
        listParts.forEach(function (sPart, iIndex) {
            sBuiltPath += "/" + sPart;
            var sPathCopy = sBuiltPath;
            if (iIndex > 0) sHtml += " / ";
            sHtml += '<span class="crumb" data-path="' +
                sPathCopy + '">' + sPart + "</span>";
        });
        elBreadcrumb.innerHTML = sHtml;
        elBreadcrumb.querySelectorAll(".crumb").forEach(function (el) {
            el.addEventListener("click", function () {
                fnLoadDirectory(el.dataset.path);
            });
        });
    }

    function fnRenderFileList(listEntries) {
        var elList = document.getElementById("listFiles");
        if (listEntries.length === 0) {
            elList.innerHTML =
                '<p style="padding:14px;color:var(--text-muted)">Empty directory</p>';
            return;
        }

        /* Sort: directories first, then files */
        listEntries.sort(function (a, b) {
            if (a.bIsDirectory !== b.bIsDirectory) {
                return a.bIsDirectory ? -1 : 1;
            }
            return a.sName.localeCompare(b.sName);
        });

        elList.innerHTML = listEntries.map(function (entry) {
            var sIconClass = entry.bIsDirectory ? "dir" : "";
            var sIcon = entry.bIsDirectory ? "&#128193;" : "&#128196;";
            var sLower = entry.sName.toLowerCase();
            if (sLower.endsWith(".pdf") || sLower.endsWith(".png") ||
                sLower.endsWith(".jpg") || sLower.endsWith(".svg")) {
                sIconClass = "figure";
            }
            return (
                '<div class="file-item" data-path="' + entry.sPath +
                '" data-is-dir="' + entry.bIsDirectory + '">' +
                '<span class="file-icon ' + sIconClass + '">' +
                sIcon + "</span>" +
                '<span class="file-name">' + entry.sName + "</span>" +
                "</div>"
            );
        }).join("");

        elList.querySelectorAll(".file-item").forEach(function (el) {
            el.addEventListener("click", function () {
                if (el.dataset.isDir === "true") {
                    fnLoadDirectory(el.dataset.path);
                } else {
                    PipeleyenFigureViewer.fnDisplayFileFromContainer(
                        el.dataset.path
                    );
                }
            });
        });
    }

    return {
        fnLoadDirectory: fnLoadDirectory,
    };
})();

document.addEventListener("DOMContentLoaded", PipeleyenApp.fnInitialize);
