/* Pipeleyen — Figure viewer logic */

const PipeleyenFigureViewer = (function () {
    "use strict";

    const SET_FIGURE_EXTENSIONS = new Set([
        ".pdf", ".png", ".jpg", ".jpeg", ".svg",
    ]);

    function fbIsFigureFile(sPath) {
        const iDot = sPath.lastIndexOf(".");
        if (iDot === -1) return false;
        return SET_FIGURE_EXTENSIONS.has(
            sPath.substring(iDot).toLowerCase()
        );
    }

    function fnLoadSceneFigures(iSceneIndex) {
        const dictScript = PipeleyenApp.fdictGetScript();
        if (!dictScript || iSceneIndex < 0) return;

        const dictScene = dictScript.listScenes[iSceneIndex];
        const listOutputFiles = dictScene.saOutputFiles || [];
        const listFigures = listOutputFiles.filter(fbIsFigureFile);

        const elSelect = document.getElementById("selectFigure");
        elSelect.innerHTML =
            '<option value="">Select a figure...</option>';
        listFigures.forEach(function (sPath) {
            const elOption = document.createElement("option");
            elOption.value = sPath;
            /* Show just the filename */
            const sFilename = sPath.split("/").pop();
            elOption.textContent = sFilename;
            elSelect.appendChild(elOption);
        });

        elSelect.onchange = function () {
            if (elSelect.value) {
                fnDisplayFigure(elSelect.value);
            } else {
                fnClearViewport();
            }
        };

        /* Auto-select first figure */
        if (listFigures.length > 0) {
            elSelect.value = listFigures[0];
            fnDisplayFigure(listFigures[0]);
        } else {
            fnClearViewport();
        }
    }

    function fnDisplayFigure(sPath) {
        const sContainerId = PipeleyenApp.fsGetContainerId();
        const sUrl =
            "/api/figure/" + sContainerId + "/" + sPath;
        const sExtension = sPath
            .substring(sPath.lastIndexOf("."))
            .toLowerCase();

        const elViewport = document.getElementById("figureViewport");

        if (sExtension === ".pdf") {
            fnRenderPdf(sUrl, elViewport);
        } else {
            fnRenderImage(sUrl, elViewport);
        }
    }

    function fnRenderImage(sUrl, elViewport) {
        elViewport.innerHTML = "";
        const elImg = document.createElement("img");
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
                '<span class="placeholder">' +
                "PDF.js not loaded. Showing as download link." +
                '</span><br><a href="' +
                sUrl +
                '" target="_blank" style="color:var(--color-pale-blue)">' +
                "Download PDF</a>";
            return;
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        pdfjsLib.getDocument(sUrl).promise.then(function (pdfDocument) {
            pdfDocument.getPage(1).then(function (page) {
                const dScale = 2.0;
                const viewport = page.getViewport({ scale: dScale });
                const elCanvas = document.createElement("canvas");
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
                '<span class="placeholder">PDF render error: ' +
                error.message +
                "</span>";
        });
    }

    function fnClearViewport() {
        document.getElementById("figureViewport").innerHTML =
            '<span class="placeholder">' +
            "Select a scene to view its figures</span>";
    }

    /* Refresh button */
    document.addEventListener("DOMContentLoaded", function () {
        document.getElementById("btnRefreshFigure").addEventListener(
            "click",
            function () {
                const elSelect =
                    document.getElementById("selectFigure");
                if (elSelect.value) {
                    fnDisplayFigure(elSelect.value);
                }
            }
        );
    });

    return {
        fnLoadSceneFigures: fnLoadSceneFigures,
    };
})();
