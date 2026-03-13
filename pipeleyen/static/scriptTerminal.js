/* Pipeleyen — Terminal management with xterm.js */

const PipeleyenTerminal = (function () {
    "use strict";

    let listTabs = [];
    let iActiveTabIndex = -1;
    let iTabCounter = 0;

    function fnCreateTab() {
        const sContainerId = PipeleyenApp.fsGetContainerId();
        if (!sContainerId) return;

        iTabCounter++;
        const dictTab = {
            iId: iTabCounter,
            sLabel: "Terminal " + iTabCounter,
            terminal: null,
            fitAddon: null,
            websocket: null,
        };
        listTabs.push(dictTab);
        fnRenderTabs();
        fnActivateTab(listTabs.length - 1);
    }

    function fnRenderTabs() {
        const elTabs = document.getElementById("terminalTabs");
        /* Keep the add button, clear the rest */
        const elAdd = document.getElementById("terminalTabAdd");
        elTabs.innerHTML = "";
        listTabs.forEach(function (dictTab, iIndex) {
            const elTab = document.createElement("div");
            elTab.className =
                "terminal-tab" +
                (iIndex === iActiveTabIndex ? " active" : "");
            elTab.innerHTML =
                "<span>" +
                dictTab.sLabel +
                "</span>" +
                '<span class="close-tab">&times;</span>';
            elTab.addEventListener("click", function (event) {
                if (
                    event.target.classList.contains("close-tab")
                ) {
                    fnCloseTab(iIndex);
                } else {
                    fnActivateTab(iIndex);
                }
            });
            elTabs.appendChild(elTab);
        });
        elTabs.appendChild(elAdd);
    }

    function fnActivateTab(iIndex) {
        if (iIndex < 0 || iIndex >= listTabs.length) return;

        /* Hide current terminal */
        if (iActiveTabIndex >= 0 && iActiveTabIndex < listTabs.length) {
            const dictOldTab = listTabs[iActiveTabIndex];
            if (dictOldTab.terminal && dictOldTab.terminal.element) {
                dictOldTab.terminal.element.style.display = "none";
            }
        }

        iActiveTabIndex = iIndex;
        const dictTab = listTabs[iIndex];

        if (!dictTab.terminal) {
            fnInitializeTerminal(dictTab);
        } else {
            dictTab.terminal.element.style.display = "";
            dictTab.fitAddon.fit();
            dictTab.terminal.focus();
        }
        fnRenderTabs();
    }

    function fnInitializeTerminal(dictTab) {
        const elContainer =
            document.getElementById("terminalContainer");

        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
            theme: {
                background: "#0d0d1a",
                foreground: "#e0e0e8",
                cursor: "#13aed5",
                selectionBackground: "rgba(19, 174, 213, 0.3)",
                black: "#1e1e2e",
                red: "#c91111",
                green: "#2ecc71",
                yellow: "#e09401",
                blue: "#1321d8",
                magenta: "#642197",
                cyan: "#13aed5",
                white: "#e0e0e8",
                brightBlack: "#6a6a88",
                brightRed: "#e04040",
                brightGreen: "#4edc91",
                brightYellow: "#f0b030",
                brightBlue: "#4050f0",
                brightMagenta: "#8040c0",
                brightCyan: "#40c8e8",
                brightWhite: "#ffffff",
            },
        });

        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(elContainer);
        fitAddon.fit();

        dictTab.terminal = terminal;
        dictTab.fitAddon = fitAddon;

        /* Connect WebSocket */
        const sProtocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";
        const sContainerId = PipeleyenApp.fsGetContainerId();
        const sUrl =
            sProtocol +
            "//" +
            window.location.host +
            "/ws/terminal/" +
            sContainerId;
        const ws = new WebSocket(sUrl);
        dictTab.websocket = ws;

        ws.binaryType = "arraybuffer";

        ws.onopen = function () {
            /* Send initial resize */
            ws.send(
                JSON.stringify({
                    sType: "resize",
                    iRows: terminal.rows,
                    iColumns: terminal.cols,
                })
            );
        };

        ws.onmessage = function (event) {
            if (event.data instanceof ArrayBuffer) {
                terminal.write(new Uint8Array(event.data));
            } else if (typeof event.data === "string") {
                try {
                    const dictData = JSON.parse(event.data);
                    if (dictData.sType === "error") {
                        terminal.write(
                            "\r\nError: " + dictData.sMessage + "\r\n"
                        );
                    }
                } catch (_) {
                    terminal.write(event.data);
                }
            }
        };

        ws.onclose = function () {
            terminal.write("\r\n[Connection closed]\r\n");
        };

        terminal.onData(function (sData) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(new TextEncoder().encode(sData));
            }
        });

        terminal.onResize(function (size) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                    JSON.stringify({
                        sType: "resize",
                        iRows: size.rows,
                        iColumns: size.cols,
                    })
                );
            }
        });

        /* Handle window resize */
        const fnResizeObserver = new ResizeObserver(function () {
            if (listTabs[iActiveTabIndex] === dictTab) {
                fitAddon.fit();
            }
        });
        fnResizeObserver.observe(elContainer);

        terminal.focus();
    }

    function fnCloseTab(iIndex) {
        if (iIndex < 0 || iIndex >= listTabs.length) return;
        const dictTab = listTabs[iIndex];

        if (dictTab.websocket) {
            dictTab.websocket.close();
        }
        if (dictTab.terminal) {
            dictTab.terminal.dispose();
        }

        listTabs.splice(iIndex, 1);

        if (listTabs.length === 0) {
            iActiveTabIndex = -1;
            document.getElementById("terminalContainer").innerHTML =
                "";
        } else if (iActiveTabIndex >= listTabs.length) {
            iActiveTabIndex = listTabs.length - 1;
            fnActivateTab(iActiveTabIndex);
        } else if (iActiveTabIndex === iIndex) {
            const iNewIndex = Math.min(iIndex, listTabs.length - 1);
            iActiveTabIndex = -1;
            fnActivateTab(iNewIndex);
        }
        fnRenderTabs();
    }

    function fnCloseAll() {
        while (listTabs.length > 0) {
            fnCloseTab(0);
        }
    }

    /* Bind the add-tab button */
    document.addEventListener("DOMContentLoaded", function () {
        document
            .getElementById("terminalTabAdd")
            .addEventListener("click", fnCreateTab);
    });

    return {
        fnCreateTab: fnCreateTab,
        fnCloseAll: fnCloseAll,
    };
})();
