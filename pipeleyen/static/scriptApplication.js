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
        fnBindGlobalSettingsToggle();
        fnBindMoveModalCancel();
        document.addEventListener("click", function () {
            fnHideContextMenu();
        });
    }

    /* --- Container Picker --- */

    async function fnLoadContainers() {
        try {
            var response = await fetch("/api/containers");
            var listContainers = await response.json();
            fnRenderContainerList(listContainers);
        } catch (error) {
            document.getElementById("listContainers").innerHTML =
                '<p style="color: var(--color-red);">Cannot connect to Docker</p>';
        }
    }

    function fnRenderContainerList(listContainers) {
        var elList = document.getElementById("listContainers");
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
                    container.sContainerId + '">' +
                    '<span class="name">' +
                    fnEscapeHtml(container.sName) + "</span>" +
                    '<span class="image">' +
                    fnEscapeHtml(container.sImage) + "</span></div>"
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
            var responseScripts = await fetch("/api/scripts/" + sId);
            var listScripts = await responseScripts.json();
            var sChosenPath = null;
            if (listScripts.length === 0) {
                fnShowToast("No script.json found in container", "error");
                return;
            } else if (listScripts.length === 1) {
                sChosenPath = listScripts[0];
            } else {
                sChosenPath = prompt(
                    "Multiple script.json files found:\n\n" +
                    listScripts.map(function (s, i) {
                        return (i + 1) + ") " + s;
                    }).join("\n") + "\n\nEnter the full path:",
                    listScripts[0]
                );
                if (!sChosenPath) return;
            }
            var response = await fetch(
                "/api/connect/" + sId +
                "?sScriptPath=" + encodeURIComponent(sChosenPath),
                { method: "POST" }
            );
            if (!response.ok) {
                var detail = await response.json();
                fnShowToast(detail.detail || "Connection failed", "error");
                return;
            }
            var data = await response.json();
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

    /* --- Template Resolution --- */

    function fdictBuildClientVariables() {
        if (!dictScript) return {};
        var sScriptDir = fsGetScriptDirectory();
        return {
            sPlotDirectory: dictScript.sPlotDirectory || "Plot",
            sRepoRoot: sScriptDir,
            iNumberOfCores: dictScript.iNumberOfCores || -1,
            sFigureType: (dictScript.sFigureType || "pdf").toLowerCase(),
        };
    }

    function fsResolveTemplate(sTemplate, dictVariables) {
        return sTemplate.replace(/\{([^}]+)\}/g, function (sMatch, sToken) {
            if (dictVariables.hasOwnProperty(sToken)) {
                return String(dictVariables[sToken]);
            }
            return sMatch;
        });
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
                    PipeleyenFiles.fnLoadDirectory(fsGetScriptDirectory());
                }
            });
        });
    }

    function fsGetScriptDirectory() {
        if (!sScriptPath) return "/workspace";
        var iLastSlash = sScriptPath.lastIndexOf("/");
        return iLastSlash > 0 ? sScriptPath.substring(0, iLastSlash) : "/workspace";
    }

    /* --- Global Settings --- */

    function fnBindGlobalSettingsToggle() {
        document.getElementById("btnGlobalSettings").addEventListener(
            "click", function () {
                var el = document.getElementById("globalSettingsPanel");
                var bExpanded = el.classList.toggle("expanded");
                if (bExpanded) fnRenderGlobalSettings();
            }
        );
    }

    function fnRenderGlobalSettings() {
        if (!dictScript) return;
        var el = document.getElementById("globalSettingsPanel");
        el.innerHTML =
            '<div class="gs-row">' +
            '<span class="gs-label">Plot Dir</span>' +
            '<input class="gs-input" id="gsPlotDirectory" value="' +
            fnEscapeHtml(dictScript.sPlotDirectory || "Plot") + '">' +
            '</div>' +
            '<div class="gs-row">' +
            '<span class="gs-label">Figure Type</span>' +
            '<input class="gs-input" id="gsFigureType" value="' +
            fnEscapeHtml(dictScript.sFigureType || "pdf") + '">' +
            '</div>' +
            '<div class="gs-row">' +
            '<span class="gs-label">Cores</span>' +
            '<input class="gs-input" id="gsNumberOfCores" type="number" value="' +
            (dictScript.iNumberOfCores || -1) + '">' +
            '</div>';
        el.querySelectorAll(".gs-input").forEach(function (inp) {
            inp.addEventListener("change", fnSaveGlobalSettings);
        });
    }

    async function fnSaveGlobalSettings() {
        var dictUpdates = {
            sPlotDirectory: document.getElementById("gsPlotDirectory").value,
            sFigureType: document.getElementById("gsFigureType").value,
            iNumberOfCores: parseInt(
                document.getElementById("gsNumberOfCores").value
            ),
        };
        try {
            var response = await fetch(
                "/api/settings/" + sContainerId,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(dictUpdates),
                }
            );
            if (response.ok) {
                var result = await response.json();
                dictScript.sPlotDirectory = result.sPlotDirectory;
                dictScript.sFigureType = result.sFigureType;
                dictScript.iNumberOfCores = result.iNumberOfCores;
                fnShowToast("Settings saved", "success");
                fnRenderSceneList();
            }
        } catch (error) {
            fnShowToast("Failed to save settings", "error");
        }
    }

    /* --- Scene List --- */

    function fnRenderSceneList() {
        var elList = document.getElementById("listScenes");
        if (!dictScript || !dictScript.listScenes) {
            elList.innerHTML = "";
            return;
        }
        var dictVars = fdictBuildClientVariables();
        var sHtml = "";
        dictScript.listScenes.forEach(function (scene, iIndex) {
            sHtml += fsRenderSceneItem(scene, iIndex, dictVars);
        });
        elList.innerHTML = sHtml;
        fnBindSceneEvents();
    }

    function fsRenderSceneItem(scene, iIndex, dictVars) {
        var sStatusClass = dictSceneStatus[iIndex] || "";
        var bEnabled = scene.bEnabled !== false;
        var bSelected = iIndex === iSelectedSceneIndex;
        var bExpanded = iIndex === iExpandedSceneIndex;

        var sHtml =
            '<div class="scene-item' + (bSelected ? " selected" : "") +
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

        sHtml += '<div class="scene-detail' +
            (bExpanded ? " expanded" : "") +
            '" data-index="' + iIndex + '">';

        /* Directory */
        var sResolvedDir = fsResolveTemplate(scene.sDirectory, dictVars);
        sHtml += '<div class="detail-label">Directory</div>';
        sHtml += '<div class="detail-field" data-view="field">' +
            fnEscapeHtml(sResolvedDir) + "</div>";
        sHtml += '<div class="detail-label">Plot Only: ' +
            (scene.bPlotOnly !== false ? "Yes" : "No") + "</div>";

        /* Setup Commands */
        if (scene.saSetupCommands && scene.saSetupCommands.length > 0) {
            sHtml += '<div class="detail-label">Setup Commands</div>';
            scene.saSetupCommands.forEach(function (sCmd, iCmdIdx) {
                sHtml += fsRenderDetailItem(
                    sCmd, dictVars, "command", "saSetupCommands",
                    iIndex, iCmdIdx
                );
            });
        }

        /* Commands */
        if (scene.saCommands && scene.saCommands.length > 0) {
            sHtml += '<div class="detail-label">Commands</div>';
            scene.saCommands.forEach(function (sCmd, iCmdIdx) {
                sHtml += fsRenderDetailItem(
                    sCmd, dictVars, "command", "saCommands",
                    iIndex, iCmdIdx
                );
            });
        }

        /* Output Files */
        if (scene.saOutputFiles && scene.saOutputFiles.length > 0) {
            sHtml += '<div class="detail-label">Output Files</div>';
            scene.saOutputFiles.forEach(function (sFile, iFileIdx) {
                sHtml += fsRenderDetailItem(
                    sFile, dictVars, "output", "saOutputFiles",
                    iIndex, iFileIdx, sResolvedDir
                );
            });
        }

        sHtml += "</div>";
        return sHtml;
    }

    function fsRenderDetailItem(
        sRaw, dictVars, sType, sArrayKey, iSceneIdx, iItemIdx,
        sSceneDirectory
    ) {
        var sResolved = fsResolveTemplate(sRaw, dictVars);
        var sFullPath = sResolved;
        if (sType === "output" && sSceneDirectory &&
            !sResolved.startsWith("/")) {
            sFullPath = sSceneDirectory + "/" + sResolved;
        }
        var bIsFigure = sType === "output" && fbIsFigureFile(sResolved);

        var sHtml = '<div class="detail-item ' + sType +
            '" data-scene="' + iSceneIdx +
            '" data-array="' + sArrayKey +
            '" data-idx="' + iItemIdx +
            '" data-resolved="' + fnEscapeHtml(sFullPath) +
            '" draggable="true">';

        sHtml += '<div class="detail-text' +
            (bIsFigure ? " figure" : "") + '">' +
            fnEscapeHtml(sResolved) +
            '</div>';

        sHtml += '<div class="detail-actions">' +
            '<button class="action-edit" title="Edit">&#9998;</button>' +
            '<button class="action-copy" title="Copy">&#9112;</button>' +
            '<button class="action-move" title="Move to scene">&#8644;</button>' +
            '<button class="action-delete" title="Delete">&#10005;</button>' +
            '</div>';

        sHtml += '</div>';
        return sHtml;
    }

    function fbIsFigureFile(sPath) {
        var sLower = sPath.toLowerCase();
        return sLower.endsWith(".pdf") || sLower.endsWith(".png") ||
            sLower.endsWith(".jpg") || sLower.endsWith(".jpeg") ||
            sLower.endsWith(".svg");
    }

    /* --- Scene Event Binding --- */

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
                event.dataTransfer.setData("pipeleyen/scene", String(iIndex));
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

        /* Bind detail item clicks and actions */
        elList.querySelectorAll(".detail-item").forEach(function (el) {
            fnBindDetailItemEvents(el);
        });
    }

    function fnBindDetailItemEvents(el) {
        var iScene = parseInt(el.dataset.scene);
        var sArray = el.dataset.array;
        var iIdx = parseInt(el.dataset.idx);
        var sResolved = el.dataset.resolved;

        /* Click on text to view */
        var elText = el.querySelector(".detail-text");
        if (elText) {
            elText.addEventListener("click", function () {
                if (el.classList.contains("output")) {
                    PipeleyenFigureViewer.fnDisplayInNextViewer(sResolved);
                }
            });
        }

        /* Drag detail items to viewer panels */
        el.addEventListener("dragstart", function (event) {
            event.stopPropagation();
            event.dataTransfer.setData("pipeleyen/filepath", sResolved);
        });

        /* Action: Edit */
        var btnEdit = el.querySelector(".action-edit");
        if (btnEdit) {
            btnEdit.addEventListener("click", function (event) {
                event.stopPropagation();
                fnInlineEditItem(el, iScene, sArray, iIdx);
            });
        }

        /* Action: Copy */
        var btnCopy = el.querySelector(".action-copy");
        if (btnCopy) {
            btnCopy.addEventListener("click", function (event) {
                event.stopPropagation();
                navigator.clipboard.writeText(sResolved).then(function () {
                    fnShowToast("Copied to clipboard", "success");
                });
            });
        }

        /* Action: Move */
        var btnMove = el.querySelector(".action-move");
        if (btnMove) {
            btnMove.addEventListener("click", function (event) {
                event.stopPropagation();
                fnShowMoveModal(iScene, sArray, iIdx);
            });
        }

        /* Action: Delete */
        var btnDelete = el.querySelector(".action-delete");
        if (btnDelete) {
            btnDelete.addEventListener("click", function (event) {
                event.stopPropagation();
                fnDeleteDetailItem(iScene, sArray, iIdx);
            });
        }
    }

    /* --- Detail Item Actions --- */

    function fnInlineEditItem(el, iScene, sArray, iIdx) {
        var sRaw = dictScript.listScenes[iScene][sArray][iIdx];
        var elText = el.querySelector(".detail-text");
        var elActions = el.querySelector(".detail-actions");
        elActions.style.display = "none";

        var elInput = document.createElement("input");
        elInput.type = "text";
        elInput.className = "detail-edit-input";
        elInput.value = sRaw;
        elText.style.display = "none";
        el.insertBefore(elInput, elActions);
        elInput.focus();
        elInput.select();

        function fnFinishEdit() {
            var sNewValue = elInput.value.trim();
            if (sNewValue && sNewValue !== sRaw) {
                dictScript.listScenes[iScene][sArray][iIdx] = sNewValue;
                fnSaveSceneArray(iScene, sArray);
            }
            elInput.remove();
            elText.style.display = "";
            elActions.style.display = "";
            fnRenderSceneList();
        }

        elInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") fnFinishEdit();
            if (event.key === "Escape") {
                elInput.remove();
                elText.style.display = "";
                elActions.style.display = "";
            }
        });
        elInput.addEventListener("blur", fnFinishEdit);
    }

    async function fnDeleteDetailItem(iScene, sArray, iIdx) {
        var sValue = dictScript.listScenes[iScene][sArray][iIdx];
        if (!confirm("Delete this item?\n\n" + sValue)) return;
        dictScript.listScenes[iScene][sArray].splice(iIdx, 1);
        await fnSaveSceneArray(iScene, sArray);
        fnRenderSceneList();
    }

    function fnShowMoveModal(iSourceScene, sArray, iIdx) {
        var elList = document.getElementById("moveSceneList");
        var sHtml = "";
        dictScript.listScenes.forEach(function (scene, iIndex) {
            if (iIndex === iSourceScene) return;
            sHtml += '<div class="move-scene-item" data-target="' +
                iIndex + '">' +
                String(iIndex + 1).padStart(2, "0") + ". " +
                fnEscapeHtml(scene.sName) + "</div>";
        });
        elList.innerHTML = sHtml;
        document.getElementById("modalMoveCommand")
            .classList.add("active");

        elList.querySelectorAll(".move-scene-item").forEach(function (el) {
            el.addEventListener("click", function () {
                var iTarget = parseInt(el.dataset.target);
                fnMoveItem(iSourceScene, iTarget, sArray, iIdx);
                document.getElementById("modalMoveCommand")
                    .classList.remove("active");
            });
        });
    }

    function fnBindMoveModalCancel() {
        document.getElementById("btnMoveCancel").addEventListener(
            "click", function () {
                document.getElementById("modalMoveCommand")
                    .classList.remove("active");
            }
        );
    }

    async function fnMoveItem(iSource, iTarget, sArray, iIdx) {
        var sValue = dictScript.listScenes[iSource][sArray].splice(iIdx, 1)[0];
        var sTargetArray = sArray;
        dictScript.listScenes[iTarget][sTargetArray].push(sValue);
        await fnSaveSceneArray(iSource, sArray);
        await fnSaveSceneArray(iTarget, sTargetArray);
        fnRenderSceneList();
        fnShowToast("Moved to " + dictScript.listScenes[iTarget].sName, "success");
    }

    async function fnSaveSceneArray(iScene, sArray) {
        var dictUpdate = {};
        dictUpdate[sArray] = dictScript.listScenes[iScene][sArray];
        try {
            await fetch(
                "/api/scenes/" + sContainerId + "/" + iScene,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(dictUpdate),
                }
            );
        } catch (error) {
            fnShowToast("Save failed", "error");
        }
    }

    /* --- Scene Expand/Collapse --- */

    function fnToggleSceneExpand(iIndex) {
        if (iExpandedSceneIndex === iIndex) {
            iExpandedSceneIndex = -1;
        } else {
            iExpandedSceneIndex = iIndex;
        }
        iSelectedSceneIndex = iIndex;
        fnRenderSceneList();
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

        var elHandleV = document.getElementById("resizeHandleVertical");
        if (elHandleV) {
            var elViewerDual = document.getElementById("panelViewerDual");
            fnMakeDraggableVertical(elHandleV, function (iDeltaY) {
                var iHeight = elViewerDual.offsetHeight + iDeltaY;
                iHeight = Math.max(80, iHeight);
                elViewerDual.style.flex = "0 0 " + iHeight + "px";
            });
        }

        var elHandleViewer = document.getElementById("resizeHandleViewer");
        if (elHandleViewer) {
            var elViewerA = document.getElementById("viewerA");
            fnMakeDraggable(elHandleViewer, function (iDeltaX) {
                var iWidth = elViewerA.offsetWidth + iDeltaX;
                iWidth = Math.max(100, iWidth);
                elViewerA.style.flex = "0 0 " + iWidth + "px";
            });
        }
    }

    function fnMakeDraggable(elHandle, fnOnMove) {
        elHandle.addEventListener("mousedown", function (event) {
            var iStartX = event.clientX;
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
        var sUrl = sProtocol + "//" + window.location.host +
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
        if (!confirm('Delete scene "' + sName + '"?')) return;
        try {
            var response = await fetch(
                "/api/scenes/" + sContainerId + "/" + iIndex,
                { method: "DELETE" }
            );
            if (response.ok) {
                dictScript.listScenes.splice(iIndex, 1);
                if (iSelectedSceneIndex === iIndex) iSelectedSceneIndex = -1;
                if (iExpandedSceneIndex === iIndex) iExpandedSceneIndex = -1;
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
        fsGetContainerId: function () { return sContainerId; },
        fdictGetScript: function () { return dictScript; },
        fsGetScriptPath: function () { return sScriptPath; },
        fiGetSelectedSceneIndex: function () { return iSelectedSceneIndex; },
        fdictBuildClientVariables: fdictBuildClientVariables,
        fsResolveTemplate: fsResolveTemplate,
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
                '" data-is-dir="' + entry.bIsDirectory +
                '" draggable="true">' +
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
                    PipeleyenFigureViewer.fnDisplayInNextViewer(
                        el.dataset.path
                    );
                }
            });
            el.addEventListener("dragstart", function (event) {
                event.dataTransfer.setData(
                    "pipeleyen/filepath", el.dataset.path
                );
            });
        });
    }

    return {
        fnLoadDirectory: fnLoadDirectory,
    };
})();

document.addEventListener("DOMContentLoaded", PipeleyenApp.fnInitialize);
