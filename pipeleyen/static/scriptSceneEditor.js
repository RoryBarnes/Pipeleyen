/* Pipeleyen — Scene CRUD modal forms */

const PipeleyenSceneEditor = (function () {
    "use strict";

    let sMode = "create";  /* "create", "edit", or "insert" */
    let iEditIndex = -1;
    let iInsertPosition = -1;

    function fnOpenCreateModal() {
        sMode = "create";
        iEditIndex = -1;
        iInsertPosition = -1;
        fnClearForm();
        document.getElementById("modalTitle").textContent = "New Scene";
        fnShowModal();
    }

    function fnOpenInsertModal(iPosition) {
        sMode = "insert";
        iEditIndex = -1;
        iInsertPosition = iPosition;
        fnClearForm();
        document.getElementById("modalTitle").textContent =
            "Insert Scene at Position " + (iPosition + 1);
        fnShowModal();
    }

    function fnOpenEditModal(iIndex) {
        sMode = "edit";
        iEditIndex = iIndex;
        iInsertPosition = -1;

        const dictScript = PipeleyenApp.fdictGetScript();
        const dictScene = dictScript.listScenes[iIndex];

        document.getElementById("inputSceneName").value =
            dictScene.sName || "";
        document.getElementById("inputSceneDirectory").value =
            dictScene.sDirectory || "";
        document.getElementById("inputPlotOnly").checked =
            dictScene.bPlotOnly !== false;
        document.getElementById("inputSetupCommands").value =
            (dictScene.saSetupCommands || []).join("\n");
        document.getElementById("inputCommands").value =
            (dictScene.saCommands || []).join("\n");
        document.getElementById("inputOutputFiles").value =
            (dictScene.saOutputFiles || []).join("\n");

        document.getElementById("modalTitle").textContent =
            "Edit Scene: " + dictScene.sName;
        fnShowModal();
    }

    function fnClearForm() {
        document.getElementById("inputSceneName").value = "";
        document.getElementById("inputSceneDirectory").value = "";
        document.getElementById("inputPlotOnly").checked = true;
        document.getElementById("inputSetupCommands").value = "";
        document.getElementById("inputCommands").value = "";
        document.getElementById("inputOutputFiles").value = "";
    }

    function fnShowModal() {
        document
            .getElementById("modalSceneEditor")
            .classList.add("active");
        document.getElementById("inputSceneName").focus();
    }

    function fnHideModal() {
        document
            .getElementById("modalSceneEditor")
            .classList.remove("active");
    }

    function flistParseTextarea(sElementId) {
        const sValue =
            document.getElementById(sElementId).value.trim();
        if (!sValue) return [];
        return sValue.split("\n").filter(function (sLine) {
            return sLine.trim().length > 0;
        });
    }

    function fdictBuildSceneFromForm() {
        return {
            sName: document
                .getElementById("inputSceneName")
                .value.trim(),
            sDirectory: document
                .getElementById("inputSceneDirectory")
                .value.trim(),
            bPlotOnly: document.getElementById("inputPlotOnly")
                .checked,
            saSetupCommands: flistParseTextarea(
                "inputSetupCommands"
            ),
            saCommands: flistParseTextarea("inputCommands"),
            saOutputFiles: flistParseTextarea("inputOutputFiles"),
        };
    }

    async function fnSave() {
        const dictData = fdictBuildSceneFromForm();
        if (!dictData.sName) {
            PipeleyenApp.fnShowToast(
                "Scene name is required",
                "error"
            );
            return;
        }

        const sContainerId = PipeleyenApp.fsGetContainerId();
        const dictScript = PipeleyenApp.fdictGetScript();

        try {
            if (sMode === "edit") {
                const response = await fetch(
                    "/api/scenes/" +
                        sContainerId +
                        "/" +
                        iEditIndex,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(dictData),
                    }
                );
                if (response.ok) {
                    const dictUpdated = await response.json();
                    dictScript.listScenes[iEditIndex] = dictUpdated;
                    PipeleyenApp.fnShowToast(
                        "Scene updated",
                        "success"
                    );
                } else {
                    throw new Error("Update failed");
                }
            } else if (sMode === "insert") {
                const response = await fetch(
                    "/api/scenes/" +
                        sContainerId +
                        "/insert/" +
                        iInsertPosition,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(dictData),
                    }
                );
                if (response.ok) {
                    const result = await response.json();
                    dictScript.listScenes.splice(
                        iInsertPosition,
                        0,
                        result.dictScene
                    );
                    PipeleyenApp.fnShowToast(
                        "Scene inserted",
                        "success"
                    );
                } else {
                    throw new Error("Insert failed");
                }
            } else {
                const response = await fetch(
                    "/api/scenes/" +
                        sContainerId +
                        "/create",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(dictData),
                    }
                );
                if (response.ok) {
                    const result = await response.json();
                    dictScript.listScenes.push(result.dictScene);
                    PipeleyenApp.fnShowToast(
                        "Scene created",
                        "success"
                    );
                } else {
                    throw new Error("Create failed");
                }
            }
            PipeleyenApp.fnRenderSceneList();
            fnHideModal();
        } catch (error) {
            PipeleyenApp.fnShowToast(
                "Save failed: " + error.message,
                "error"
            );
        }
    }

    /* Bind modal events */
    document.addEventListener("DOMContentLoaded", function () {
        document
            .getElementById("btnNewScene")
            .addEventListener("click", fnOpenCreateModal);
        document
            .getElementById("btnModalCancel")
            .addEventListener("click", fnHideModal);
        document
            .getElementById("btnModalSave")
            .addEventListener("click", fnSave);

        /* Close modal on overlay click */
        document
            .getElementById("modalSceneEditor")
            .addEventListener("click", function (event) {
                if (event.target === this) {
                    fnHideModal();
                }
            });

        /* Escape key closes modal */
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                fnHideModal();
            }
        });
    });

    return {
        fnOpenCreateModal: fnOpenCreateModal,
        fnOpenEditModal: fnOpenEditModal,
        fnOpenInsertModal: fnOpenInsertModal,
    };
})();
