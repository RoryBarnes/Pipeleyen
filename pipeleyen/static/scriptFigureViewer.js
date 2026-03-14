/* Pipeleyen — Dual figure viewer with history */

const PipeleyenFigureViewer = (function () {
    "use strict";

    var SET_FIGURE_EXTENSIONS = new Set([
        ".pdf", ".png", ".jpg", ".jpeg", ".svg",
    ]);

    /* Two viewer states: A and B */
    var dictViewerA = {
        sId: "A",
        listHistory: [],
        iHistoryIndex: -1,
    };
    var dictViewerB = {
        sId: "B",
        listHistory: [],
        iHistoryIndex: -1,
    };
    var sNextViewer = "A";

    function fbIsFigureFile(sPath) {
        var iDot = sPath.lastIndexOf(".");
        if (iDot === -1) return false;
        return SET_FIGURE_EXTENSIONS.has(
            sPath.substring(iDot).toLowerCase()
        );
    }

    /* --- Public entry points --- */

    function fnLoadSceneFigures(iSceneIndex) {
        var sContainerId = PipeleyenApp.fsGetContainerId();
        if (!sContainerId || iSceneIndex < 0) return;

        fnFetchResolvedScene(iSceneIndex, function (dictScene) {
            var listOutputFiles =
                dictScene.saResolvedOutputFiles ||
                dictScene.saOutputFiles || [];
            var listFigures = listOutputFiles.filter(fbIsFigureFile);

            fnPopulateSelect("selectFigureA", listFigures, dictViewerA);
            fnPopulateSelect("selectFigureB", listFigures, dictViewerB);

            if (listFigures.length > 0) {
                fnNavigateToPath(dictViewerA, listFigures[0]);
            }
        });
    }

    function fnDisplayInNextViewer(sPath) {
        var dictViewer = sNextViewer === "A" ? dictViewerA : dictViewerB;
        fnNavigateToPath(dictViewer, sPath);
        sNextViewer = sNextViewer === "A" ? "B" : "A";
    }

    function fnDisplayTextInNextViewer(sLabel, sText) {
        var dictViewer = sNextViewer === "A" ? dictViewerA : dictViewerB;
        var elViewport = fnGetViewport(dictViewer);
        elViewport.innerHTML =
            '<pre>' + fnEscapeHtml(sLabel + "\n\n" + sText) + '</pre>';
        sNextViewer = sNextViewer === "A" ? "B" : "A";
    }

    function fnDisplayFigureByTemplate(sTemplatePath) {
        var sContainerId = PipeleyenApp.fsGetContainerId();
        var iSceneIndex = PipeleyenApp.fiGetSelectedSceneIndex();
        if (!sContainerId || iSceneIndex < 0) return;

        fnFetchResolvedScene(iSceneIndex, function (dictScene) {
            var listRaw = dictScene.saOutputFiles || [];
            var listResolved =
                dictScene.saResolvedOutputFiles || listRaw;
            var sResolvedPath = sTemplatePath;
            var iMatch = listRaw.indexOf(sTemplatePath);
            if (iMatch >= 0 && iMatch < listResolved.length) {
                sResolvedPath = listResolved[iMatch];
            }
            fnDisplayInNextViewer(sResolvedPath);
        });
    }

    function fnDisplayFileFromContainer(sPath) {
        fnDisplayInNextViewer(sPath);
    }

    /* --- Internal --- */

    function fnFetchResolvedScene(iSceneIndex, fnCallback) {
        var sContainerId = PipeleyenApp.fsGetContainerId();
        fetch("/api/scenes/" + sContainerId + "/" + iSceneIndex)
            .then(function (r) { return r.json(); })
            .then(fnCallback)
            .catch(function () {
                var dictScript = PipeleyenApp.fdictGetScript();
                if (dictScript && dictScript.listScenes[iSceneIndex]) {
                    fnCallback(dictScript.listScenes[iSceneIndex]);
                }
            });
    }

    function fnPopulateSelect(sSelectId, listFigures, dictViewer) {
        var elSelect = document.getElementById(sSelectId);
        elSelect.innerHTML = '<option value="">Select a figure...</option>';
        listFigures.forEach(function (sPath) {
            var elOption = document.createElement("option");
            elOption.value = sPath;
            elOption.textContent = sPath.split("/").pop();
            elSelect.appendChild(elOption);
        });
        elSelect.onchange = function () {
            if (elSelect.value) {
                fnNavigateToPath(dictViewer, elSelect.value);
            }
        };
    }

    function fnGetViewport(dictViewer) {
        return document.getElementById("viewport" + dictViewer.sId);
    }

    function fnNavigateToPath(dictViewer, sPath) {
        /* Trim forward history */
        if (dictViewer.iHistoryIndex < dictViewer.listHistory.length - 1) {
            dictViewer.listHistory = dictViewer.listHistory.slice(
                0, dictViewer.iHistoryIndex + 1
            );
        }
        dictViewer.listHistory.push(sPath);
        dictViewer.iHistoryIndex = dictViewer.listHistory.length - 1;
        fnDisplayInViewport(dictViewer, sPath);
        fnUpdateNavButtons(dictViewer);
    }

    function fnNavigateBack(dictViewer) {
        if (dictViewer.iHistoryIndex <= 0) return;
        dictViewer.iHistoryIndex--;
        var sPath = dictViewer.listHistory[dictViewer.iHistoryIndex];
        fnDisplayInViewport(dictViewer, sPath);
        fnUpdateNavButtons(dictViewer);
    }

    function fnNavigateForward(dictViewer) {
        if (dictViewer.iHistoryIndex >= dictViewer.listHistory.length - 1) {
            return;
        }
        dictViewer.iHistoryIndex++;
        var sPath = dictViewer.listHistory[dictViewer.iHistoryIndex];
        fnDisplayInViewport(dictViewer, sPath);
        fnUpdateNavButtons(dictViewer);
    }

    function fnUpdateNavButtons(dictViewer) {
        var sId = dictViewer.sId;
        document.getElementById("btnBack" + sId).disabled =
            dictViewer.iHistoryIndex <= 0;
        document.getElementById("btnForward" + sId).disabled =
            dictViewer.iHistoryIndex >= dictViewer.listHistory.length - 1;
    }

    function fnDisplayInViewport(dictViewer, sPath) {
        var sContainerId = PipeleyenApp.fsGetContainerId();
        var sUrl = "/api/figure/" + sContainerId + "/" + sPath;
        var elViewport = fnGetViewport(dictViewer);
        var sExtension = sPath.substring(sPath.lastIndexOf(".")).toLowerCase();

        if (sExtension === ".pdf") {
            fnRenderPdf(sUrl, elViewport);
        } else if (fbIsFigureFile(sPath)) {
            fnRenderImage(sUrl, elViewport);
        } else {
            fnRenderText(sUrl, elViewport);
        }
    }

    function fnRenderImage(sUrl, elViewport) {
        elViewport.innerHTML = "";
        var elImg = document.createElement("img");
        elImg.src = sUrl;
        elImg.alt = "Figure";
        elImg.onerror = function () {
            elViewport.innerHTML =
                '<span class="placeholder">Failed to load figure</span>';
        };
        elViewport.appendChild(elImg);
    }

    function fnRenderPdf(sUrl, elViewport) {
        elViewport.innerHTML =
            '<span class="placeholder">Loading PDF...</span>';
        if (typeof pdfjsLib === "undefined") {
            elViewport.innerHTML =
                '<span class="placeholder">PDF.js not loaded</span>' +
                '<br><a href="' + sUrl +
                '" target="_blank" style="color:var(--color-pale-blue)">' +
                "Download PDF</a>";
            return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        pdfjsLib.getDocument(sUrl).promise.then(function (pdfDoc) {
            pdfDoc.getPage(1).then(function (page) {
                var dScale = 2.0;
                var viewport = page.getViewport({ scale: dScale });
                var elCanvas = document.createElement("canvas");
                elCanvas.width = viewport.width;
                elCanvas.height = viewport.height;
                elCanvas.style.width = viewport.width / dScale + "px";
                elCanvas.style.height = viewport.height / dScale + "px";
                elViewport.innerHTML = "";
                elViewport.appendChild(elCanvas);
                page.render({
                    canvasContext: elCanvas.getContext("2d"),
                    viewport: viewport,
                });
            });
        }).catch(function (error) {
            elViewport.innerHTML =
                '<span class="placeholder">PDF error: ' +
                error.message + "</span>";
        });
    }

    function fnRenderText(sUrl, elViewport) {
        elViewport.innerHTML =
            '<span class="placeholder">Loading...</span>';
        fetch(sUrl)
            .then(function (r) {
                if (!r.ok) throw new Error("Not found");
                return r.text();
            })
            .then(function (sText) {
                elViewport.innerHTML =
                    '<pre>' + fnEscapeHtml(sText) + '</pre>';
            })
            .catch(function () {
                elViewport.innerHTML =
                    '<span class="placeholder">Cannot display file</span>';
            });
    }

    function fnEscapeHtml(sText) {
        var el = document.createElement("span");
        el.textContent = sText;
        return el.innerHTML;
    }

    /* --- Drag and Drop --- */

    function fnBindDropTargets() {
        ["viewportA", "viewportB"].forEach(function (sViewportId) {
            var elViewport = document.getElementById(sViewportId);
            var dictViewer = sViewportId === "viewportA" ?
                dictViewerA : dictViewerB;

            elViewport.addEventListener("dragover", function (event) {
                event.preventDefault();
                elViewport.classList.add("drag-over");
            });
            elViewport.addEventListener("dragleave", function () {
                elViewport.classList.remove("drag-over");
            });
            elViewport.addEventListener("drop", function (event) {
                event.preventDefault();
                elViewport.classList.remove("drag-over");
                var sPath = event.dataTransfer.getData("pipeleyen/filepath");
                if (sPath) {
                    fnNavigateToPath(dictViewer, sPath);
                }
            });
        });
    }

    /* --- Init --- */

    document.addEventListener("DOMContentLoaded", function () {
        fnBindDropTargets();

        document.getElementById("btnBackA").addEventListener("click",
            function () { fnNavigateBack(dictViewerA); });
        document.getElementById("btnForwardA").addEventListener("click",
            function () { fnNavigateForward(dictViewerA); });
        document.getElementById("btnBackB").addEventListener("click",
            function () { fnNavigateBack(dictViewerB); });
        document.getElementById("btnForwardB").addEventListener("click",
            function () { fnNavigateForward(dictViewerB); });

        document.getElementById("btnRefreshA").addEventListener("click",
            function () {
                if (dictViewerA.iHistoryIndex >= 0) {
                    fnDisplayInViewport(
                        dictViewerA,
                        dictViewerA.listHistory[dictViewerA.iHistoryIndex]
                    );
                }
            });
        document.getElementById("btnRefreshB").addEventListener("click",
            function () {
                if (dictViewerB.iHistoryIndex >= 0) {
                    fnDisplayInViewport(
                        dictViewerB,
                        dictViewerB.listHistory[dictViewerB.iHistoryIndex]
                    );
                }
            });
    });

    return {
        fnLoadSceneFigures: fnLoadSceneFigures,
        fnDisplayFigureByTemplate: fnDisplayFigureByTemplate,
        fnDisplayFileFromContainer: fnDisplayFileFromContainer,
        fnDisplayInNextViewer: fnDisplayInNextViewer,
        fnDisplayTextInNextViewer: fnDisplayTextInNextViewer,
    };
})();
