"use strict";
var el = document.getElementById('editor');
el.style.height = '655px';
el.style.width = '100%';

const MAX_MEMORY = 500;
const ADDR_REGEX = /^[a]{1}[0-9]+/;
const LABEL_REGEX = /^[a-zA-Z_]{1}[a-zA-Z0-9_]+\:/;
const COMMENT_REGEX = /#(.*)/;
const LABEL_INLINE_REGEX = /^[a-zA-Z_]{1}[a-zA-Z0-9_]+/;
const OVERLAY_WIDGET = {
    button: (function () {
        const button = document.createElement("button");
        button.innerText = "</> View Disassembly";
        button.id = "disassembly";
        button.onclick = selectPreviewTab;
        return button;
    })(),

    getId: function () { return this.button.id; },
    getDomNode: function () { return this.button; },
    getPosition: function () { return null; },
};

var editor = null;
var model = null;

var init = function ()
{
    require(['vs/editor/editor.main'], function()
    {
        const EditorZoom = require('vs/editor/common/config/editorZoom').EditorZoom;
        const zoomLevel = window.localStorage.getObj("zoomLevel");

        if (zoomLevel && Number.isInteger(zoomLevel))
        {
            EditorZoom.setZoomLevel(zoomLevel);
        }

        const oldSetZoomLevel = EditorZoom.setZoomLevel;
        EditorZoom.setZoomLevel = (e) =>
        {
            window.localStorage.setObj("zoomLevel", e);
            oldSetZoomLevel.call(EditorZoom, e);
        };

        monaco.languages.register({ id: 'c15s' });
        monaco.languages.setLanguageConfiguration("c15s",
            {
                "surroundingPairs": [{"open":"{","close":"}"}, {"open":"(","close":")"}, {"open":"[","close":"]"}],
                "autoClosingPairs": [{"open":"{","close":"}"}, {"open":"(","close":")"}, {"open":"[","close":"]"}],
                "brackets":[["{","}"], ["(",")"], ["[","]"],]
            }
        );

        monaco.languages.setMonarchTokensProvider('c15s', {
            keywords: [
                'int',
                'uint',
                'float',
                'struct',
                'const',

                '_setled',

                '_load_a',
                '_load_b',

                '_tick',
                '_urand',
                '_push',
                '_pop_int',
                '_pop_uint',
                '_pop_float',
                'void', 'return', 'do', 'for', 'while', 'break', 'continue', 'if', 'else',
            ],
            operators: [
                '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
                '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
                '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
                '%=', '<<=', '>>=', '>>>='
            ],
            symbols:  /[=><!~?:&|+\-*\/\^%]+/,
            tokenizer: {
                root: [
                    [/\d+\.[fF]/, 'number'],
                    [/\d*\.\d+([eE][\-+]?\d+)?[Ff]?/, 'number'],
                    [/0[xX][0-9a-fA-F]+[uU]/, 'number'],
                    [/0[xX][0-9a-fA-F]+/, 'number'],
                    [/\d+[uU]/, 'number'],
                    [/\d+/, 'number'],
                    [/[a-zA-Z_$][\w$]*/,
                        { cases: { '@keywords': 'opcode','@default': 'address' } }],
                    { include: '@whitespace' },
                    [/[{}()\[\]]/, 'default'],
                    [/@symbols/, { cases: { '@operators': 'label', '@default'  : '' } } ],

                    [/[;,.]/, 'default'],
                ],

                comment: [
                    [/[^\/*]+/, 'comment' ],
                    [/\/\*/,    'comment', '@push' ],
                    ["\\*/",    'comment', '@pop'  ],
                    [/[\/*]/,   'comment' ]
                ],

                whitespace: [
                    [/[ \t\r\n]+/, 'white'],
                    [/\/\*/,       'comment', '@comment' ],
                    [/\/\/.*$/,    'comment'],
                ],
            },
        });

        monaco.languages.register({ id: 'c15' });
        monaco.languages.setMonarchTokensProvider('c15', {
            tokenizer: {
                root: [
                    [/\d+\.[fF]/, 'number'],
                    [/\d*\.\d+([eE][\-+]?\d+)?[Ff]?/, 'number'],
                    [/0[xX][0-9a-fA-F]+/, 'number'],
                    [/\d+/, 'number'],

                    [/^[A-Z]+\s?/, "opcode"],
                    [/^\.[a-z]+\s/, "sopcode"],
                    [/^#(.*)/, "comment"],
                    [/a{1}[0-9]+/, "address"],
                    [/[a-zA-Z0-9_]+:?/, "label"],
                ]
            }
        });

        monaco.editor.defineTheme('c15theme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'opcode', foreground: '00c4ff', bold: true },
                { token: 'sopcode', foreground: 'fc5603', bold: true },
                { token: 'address', foreground: 'dfa0ff' },
                { token: 'number', foreground: '8be86c' },
                { token: 'label', foreground: 'ffb700' },
                { token: 'comment', foreground: '00af1b' },
                { token: 'default', foreground: '909090' },
            ]
        });

        monaco.languages.registerCompletionItemProvider('c15s', {
            provideCompletionItems: () =>
            {
                return { suggestions: [] };
            }
        });

        monaco.languages.registerCompletionItemProvider('c15', {
            provideCompletionItems: () =>
            {
                return { suggestions: [] };
            }
        });

        editor = monaco.editor.create(el, {
            theme: 'c15theme',
            lineNumbers: 'on',
            scrollBeyondLastLine: true,
            model: (model = monaco.editor.createModel("", "c15")),
            automaticLayout: true,
            minimap: {
                enabled: false
            }
        });

        editor.addAction({
            id: 'run',
            label: 'Run',
            keybindings: [
                monaco.KeyCode.F5
            ],
            precondition: null,
            keybindingContext: null,
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: () => {
                document.getElementById("run").click();
                return null;
            }
        });

        var deltaDecorationsDuplex = [];
        editor.layout();
        editor.onDidChangeModelContent(() => {
            const value = editor.getValue();

            if (tabTable[activeTab].script)
            {
                errorList = [];

                const compiler = new Compiler();

                try
                {
                    const asm = compiler.compile(value);
                    assemble(asm, true);

                    deltaDecorationsDuplex = editor.deltaDecorations(deltaDecorationsDuplex, compiler.getSymbols().map((symbol) =>
                    {
                        const location = symbol.location;
                        const className = symbol.className;

                        return {
                            range: new monaco.Range(location.start.line, location.start.column, location.end.line, location.end.column),
                            options: { inlineClassName: className }
                        };
                    }));
                }
                catch (e)
                {
                    console.error(e);

                    errorList.push({
                        startLineNumber: e.location.start.line,
                        endLineNumber: e.location.end.line,
                        startColumn: e.location.start.column,
                        endColumn: e.location.end.column,
                        message: e.message,
                        severity: monaco.MarkerSeverity.Error
                    });
                }

                compiler.getWarnings().forEach(e =>
                {
                    errorList.push({
                        startLineNumber: e.location.start.line,
                        endLineNumber: e.location.end.line,
                        startColumn: e.location.start.column,
                        endColumn: e.location.end.column,
                        message: e.message,
                        severity: monaco.MarkerSeverity.Warning
                    });
                });

                monaco.editor.setModelMarkers(model, "owner", errorList);
            }
            else
            {
                assemble(value);
                monaco.editor.setModelMarkers(model, "owner", errorList);
            }

            save();
        });

        start();
    });



    window.removeEventListener("load", init);
};

var activeTab;
var tabTable;

Storage.prototype.getObj = function(key)
{
    return JSON.parse(this.getItem(key))
}

Storage.prototype.setObj = function(key, obj)
{
    return this.setItem(key, JSON.stringify(obj))
}

function loadScript(url, e)
{
    if (e.getElementsByClassName("loader").length)
        return;

    var div = document.createElement("div");
    div.setAttribute("class", "loader");

    e.appendChild(div);

    fetch(url)
        .then(response => response.json())
        .then(data =>
        {
            let index = tabTable.push(data);

            save();
            selectTab(index - 1);

            div.remove();
        });
}

var lastLength = -1;
var previousActiveTab = -1;

function renderTabs()
{
    if (lastLength !== tabTable.length)
    {
        let menu = document.getElementById("menu");
        menu.innerHTML = "";

        Array.from(tabTable).forEach((value, index, _) =>
        {
            if (index === activeTab) {
                menu.insertAdjacentHTML("beforeend", `<div class="active">
                            <img src="${value.script ? "img/icon2.svg" : "img/icon.svg"}" class="icon" />
                            ${value.name}
                            <img src="img/save.svg" onclick="exportTab()" class="edit" />
                            <img src="img/edit.svg" onclick="renameTab(${index})" class="edit" />
                            <img src="img/x.svg" onclick="deleteTab(${index})" class="x" />
                        </div>`)


            }
            else
                menu.insertAdjacentHTML("beforeend",
                    `<div onclick="selectTab(${index})"><img src="${value.script ? "img/icon2.svg" : "img/icon.svg"}" class="icon" />${value.name}</div>`)
        });

        menu.insertAdjacentHTML("beforeend", `<div id="addTabButton" onclick="addTab()"><img src="img/add.svg" class="add" /></div>`);

        const children = document.getElementById("menu").children;
        children[activeTab].scrollIntoView({ block: "end", inline: "nearest"});

        lastLength = tabTable.length;
        previousActiveTab = activeTab;
    }
    else
    {
        const children = document.getElementById("menu").children;

        children[previousActiveTab].outerHTML = `<div onclick="selectTab(${previousActiveTab})"><img src="${tabTable[previousActiveTab].script ? "img/icon2.svg" :
            "img/icon.svg"}" class="icon" />${tabTable[previousActiveTab].name}</div>`;

        children[activeTab].outerHTML = `<div class="active">
                            <img src="${tabTable[activeTab].script ? "img/icon2.svg" : "img/icon.svg"}" class="icon" />
                            ${tabTable[activeTab].name}
                            <img src="img/save.svg" onclick="exportTab()" class="edit" />
                            <img src="img/edit.svg" onclick="renameTab(${activeTab})" class="edit" />
                            <img src="img/x.svg" onclick="deleteTab(${activeTab})" class="x" />
                        </div>`;


        children[activeTab].scrollIntoView({ block: "end", inline: "nearest"});

        previousActiveTab = activeTab;
    }
}

function renameTab(index)
{
    let name = prompt("Please enter a new name. ", tabTable[index].name.replace(".asm", "").replace(".c", ""));

    if (name === null) return;

    if (name.length === 0) name = "untitled";

    tabTable[index].name = tabTable[index].script ? `${name}.c` : `${name}.asm`;

    save();
    selectTab(index);
}

function exportTab()
{
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + tabTable[activeTab].value);
    element.setAttribute('download', tabTable[activeTab].name);
    element.style.display = 'none';

    document.body.appendChild(element);
    element.click();

    document.body.removeChild(element);
}

function importScript(file)
{
    if (file === null) return;

    let reader = new FileReader();
    reader.onload = function()
    {
        let object = JSON.parse(reader.result);

        let index = tabTable.push(object);

        save();
        selectTab(index - 1);
    };
    reader.readAsText(file);
}

function addTab()
{
    let name = prompt("Please enter the name of your file:");

    if (name === null) return;

    if (name.length === 0) name = "untitled";

    let index;
    if (name.endsWith(".c"))
    {
        index = tabTable.push({name: `${name}`, value: "", script: true });
    }
    else if (name.endsWith(".asm"))
    {
        index = tabTable.push({name: `${name}`, value: "" });
    }
    else
    {
        alert("Error: You must have either .c or .asm at the end of your name.")
        return;
    }

    save();
    selectTab(index - 1);
}

function deleteTab(index)
{
    if (!confirm('Are you sure you want to delete this?')) return;

    let object = tabTable[index];

    if (object === null) return;

    tabTable.splice(index, 1);

    if (tabTable.length === 0) {

        tabTable.push({name: "untitled.asm", value : ""});
    }
    else if (activeTab !== 0)
        activeTab -= 1;


    selectTab(activeTab);
    save();
}

function selectPreviewTab()
{
    try 
    {
        if (!tabTable[activeTab].script)
            return;
    
        const compiler = new Compiler();
        const value = compiler.compile(editor.getValue());
        const index = tabTable.push({ name: tabTable[activeTab].name.replace(".c", ".asm"), value });

        save();
        selectTab(index - 1);
    }
    catch (e)
    {
    }
}

function selectTab(index)
{
    activeTab = index;

    editor.setValue(tabTable[activeTab].value);
    editor.removeOverlayWidget(OVERLAY_WIDGET);

    monaco.editor.setModelLanguage(model, tabTable[activeTab].script ? "c15s" : "c15");

    if (tabTable[activeTab].script)
    {
        editor.addOverlayWidget(OVERLAY_WIDGET);
    }

    renderTabs();
    window.localStorage.setObj("activeTab", activeTab);
}

function save()
{
    tabTable[activeTab].value = editor.getValue();
    window.localStorage.setObj("tabs", tabTable);
}

function start()
{
    let tabs = window.localStorage.getObj("tabs");
    let activeTabPrevious = window.localStorage.getObj("activeTab");
    activeTab = 0;

    if (tabs !== null)
    {
        tabTable = tabs;

        if (activeTabPrevious !== null)
            activeTab = activeTabPrevious;
    }
    else
    {
        tabTable = [];
        
        tabTable.push({name: "fib.c", script: true, value:
            "/* Iterative fibonacci */\nint fibonacci(int n)\n{\n    int a, b = 0, c = 1;\n\n    for (int i = 1; i < n; i++) \n    {\n        a = b;\n        b = c;\n        c = a + b;\n    }\n\n    return c;\n}\n\n// The memory region 'var_result' will contain 2584.\nint result = fibonacci(18);"
        });
        
        tabTable.push({name: "sqrt.c", script: true, value:
            "/* Fast integer square root. */\nint sqrt(int x) \n{\n    int s = 0, b = 32768; \n\n    while (b)  \n    { \n        int t = (s + b); \n        if (t * t <= x) s = t; \n        b >>= 1;\n    }\n\n    return s; \n} \n\n/* Fast power. */\nint pow(int base, int exp)\n{\n    int result = 1;\n\n    while (exp)\n    {\n        if ((exp & 1) == 1) result *= base;\n        exp >>= 1;\n        base *= base;\n    }\n    \n    return result;\n}\n\n// The memory region 'var_result' will contain 0x1b346c90.\nint result = pow(sqrt(0x1b346c90), 2);"
        });
        
    }

    selectTab(activeTab);
}


window.ondragenter = function (event) { event.preventDefault(); return false; };
window.ondragleave = function () { return false; };
window.ondragover = function (event) { event.preventDefault() }

window.ondrop = function (event)
{
    event.preventDefault();

    if (event.dataTransfer.files[0] === undefined) return;

    importScript(event.dataTransfer.files[0]);

    return false;
};

localStorage.openpages = Date.now();
window.addEventListener('storage', (e) =>
{
    if (e.key == "openpages")
        localStorage.page_available = Date.now();

    if (e.key == "page_available")
    {
        const doubleTabIndicatorDiv = document.getElementById("double-tab-indicator");
        doubleTabIndicatorDiv.style.display = "unset";
    }
}, false);

var PIXEL_STEP  = 10;
var LINE_HEIGHT = 40;
var PAGE_HEIGHT = 800;

function normalizeWheel(event) 
{
    var sX = 0, sY = 0,
        pX = 0, pY = 0;

    if ('detail'      in event) { sY = event.detail; }
    if ('wheelDelta'  in event) { sY = -event.wheelDelta / 120; }
    if ('wheelDeltaY' in event) { sY = -event.wheelDeltaY / 120; }
    if ('wheelDeltaX' in event) { sX = -event.wheelDeltaX / 120; }

    if ( 'axis' in event && event.axis === event.HORIZONTAL_AXIS ) {
        sX = sY;
        sY = 0;
    }

    pX = sX * PIXEL_STEP;
    pY = sY * PIXEL_STEP;

    if ('deltaY' in event) { pY = event.deltaY; }
    if ('deltaX' in event) { pX = event.deltaX; }

    if ((pX || pY) && event.deltaMode) {
        if (event.deltaMode == 1) {
            pX *= LINE_HEIGHT;
            pY *= LINE_HEIGHT;
        } else {
            pX *= PAGE_HEIGHT;
            pY *= PAGE_HEIGHT;
        }
    }

    if (pX && !sX) { sX = (pX < 1) ? -1 : 1; }
    if (pY && !sY) { sY = (pY < 1) ? -1 : 1; }

    return { spinX  : sX,
        spinY  : sY,
        pixelX : pX,
        pixelY : pY };
}

window.addEventListener("load", init);
document.getElementById("menu").addEventListener('wheel', (e) => {
    e.preventDefault();

    document.getElementById("menu").scrollLeft += normalizeWheel(e).pixelY;
});

let socket = null;
document.getElementById("run").onclick = function(event)
{
    const output = document.getElementById("output");
    
    if (el.style.width === "100%")
        el.style.width = "53%";

    output.innerHTML = "<div class=\"loader loader-big\"></div>";
    output.style.overflow = "hidden";
    output.style.display = "flex";
    output.style.alignItems = "center";
    output.style.justifyContent = "center";

    if (socket == null)
    {
        socket = new WebSocket('wss://cpu.vldr.org');
        socket.addEventListener('open', function (event)
        {
            socket.send(JSON.stringify(final));
        });

        socket.addEventListener('close', function (event)
        {
            socket = null;
        });

        socket.addEventListener("error", function (event)
        {
            socket = null;

            output.textContent += `Error! Failed to communicate with the processor.\n`;
            output.style.overflow = "";
        });

        socket.addEventListener('message', function (event)
        {
            output.style.overflow = "";
            output.style.display = "";
            output.style.alignItems = "";
            output.style.justifyContent = "";

            output.textContent += event.data;
            output.scrollTo(0, output.scrollHeight);
        });
    }
    else
        socket.send(JSON.stringify(final));
};

let buffer = [];
let errorList = [];
let memoryRegions = new Set();
let final = {};
let labels = [];
let readRegions = [];
let stackSize = 0;
let memorySize = 0;

function assemble(value, keepValue = false)
{
    buffer = [];

    if (!keepValue)
        errorList = [];

    labels = [];
    readRegions = [];
    memoryRegions = new Set();
    final = {};
    stackSize = 0;
    memorySize = 0;

    const commands = value.split(/\n/);

    for (let i = 0; i < commands.length; i++)
    {
        const cmd = commands[i].trim();

        if (!cmd.length)
        {
            continue;
        }

        const parameters = cmd.split(" ");

        if (parameters[0].match(COMMENT_REGEX))
        {
            continue;
        }

        if (parameters[0].match(LABEL_REGEX))
        {
            labels[parameters[0].replace(":", "")] = stackSize;
            continue;
        }

        switch (parameters[0])
        {
            case ".data":
                processData(i, parameters);
                break;
            case ".read":
                processRead(i, parameters);
                break;
            case "HALT":
                processHALT(i);
                break;
            case "FADD":
                buffer[stackSize++] = { i, opcode: 0x2D };
                break;
            case "FLTOINT":
                buffer[stackSize++] = { i, opcode: 0x2E };
                break;
            case "INTTOFL":
                buffer[stackSize++] = { i, opcode: 0x2F };
                break;
            case "FMULT":
                buffer[stackSize++] = { i, opcode: 0x30 };
                break;
            case "FDIV":
                buffer[stackSize++] = { i, opcode: 0x31 };
                break;
            case "LAND":
                buffer[stackSize++] = { i, opcode: 0x5B };
                break;
            case "LOR":
                buffer[stackSize++] = { i, opcode: 0x5C };
                break;
            case "GETPOPA":
                buffer[stackSize++] = { i, opcode: 0x54 };
                break;
            case "GETPOPB":
                buffer[stackSize++] = { i, opcode: 0x55 };
                break;
            case "GETPOPR":
                buffer[stackSize++] = { i, opcode: 0x5A };
                break;
            case "POPNOP":
                buffer[stackSize++] = { i, opcode: 0x5D };
                break;
            case "MOVOUTPUSH":
                buffer[stackSize++] = { i, opcode: 0x57 };
                break;
            case "MOVINPOP":
                buffer[stackSize++] = { i, opcode: 0x58 };
                break;
            case "ADD":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x05
                };
                break;
            case "SUB":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x06
                };
                break;
            case "MULT":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x07
                };
                break;
            case "DIV":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x08
                };
                break;
            case "SDIV":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x3A
                };
                break;
            case "SREM":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x3B
                };
                break;
            case "SMULT":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x3C
                };
                break;
            case "SADD":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x3D
                };
                break;
            case "SSUB":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x3E
                };
                break;

            case "VPUSH":
                processVPUSH(i, parameters);
                break;

            case "SAVEPUSH":
                buffer[stackSize++] = { i, opcode: 0x53 };
                break;
            case "SAVETOA":
                buffer[stackSize++] = { i, opcode: 0x153 };
                break;
            case "SAVETOB":
                buffer[stackSize++] = { i, opcode: 0x253 };
                break;

            case "NOP":
                buffer[stackSize++] = { i, opcode: 0x26 };
                break;
            case "SHIFTL":
                buffer[stackSize++] = { i, opcode: 0x27 };
                break;
            case "SHIFTR":
                buffer[stackSize++] = { i, opcode: 0x28 };
                break;
            case "AND":
                buffer[stackSize++] = { i, opcode: 0x29 };
                break;
            case "OR":
                buffer[stackSize++] = { i, opcode: 0x2A };
                break;
            case "XOR":
                buffer[stackSize++] = { i, opcode: 0x2B };
                break;
            case "TICK":
                buffer[stackSize++] = { i, opcode: 0x2C };
                break;
            case "REM":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x09
                };
                break;

            case "CMPLT": buffer[stackSize++] = { i, opcode: 0x1d }; break;
            case "CMPGT": buffer[stackSize++] = { i, opcode: 0x1E }; break;
            case "CMPLTE": buffer[stackSize++] = { i, opcode: 0x1F }; break;
            case "CMPGTE": buffer[stackSize++] = { i, opcode: 0x20 }; break;
            case "CMPE": buffer[stackSize++] = { i, opcode: 0x21 }; break;
            case "CMPNE": buffer[stackSize++] = { i, opcode: 0x22 }; break;

            case "SCMPLT": buffer[stackSize++] = { i, opcode: 0x3f }; break;
            case "SCMPGT": buffer[stackSize++] = { i, opcode: 0x40 }; break;
            case "SCMPLTE": buffer[stackSize++] = { i, opcode: 0x41 }; break;
            case "SCMPGTE": buffer[stackSize++] = { i, opcode: 0x42 }; break;
            case "SCMPE": buffer[stackSize++] = { i, opcode: 0x43 }; break;
            case "SCMPNE": buffer[stackSize++] = { i, opcode: 0x44 }; break;

            case "FCMPLT": buffer[stackSize++] = { i, opcode: 0x45 }; break;
            case "FCMPGT": buffer[stackSize++] = { i, opcode: 0x46 }; break;
            case "FCMPLTE": buffer[stackSize++] = { i, opcode: 0x47 }; break;
            case "FCMPGTE": buffer[stackSize++] = { i, opcode: 0x48 }; break;
            case "FCMPE": buffer[stackSize++] = { i, opcode: 0x49 }; break;
            case "FCMPNE": buffer[stackSize++] = { i, opcode: 0x4A }; break;

            case "FSUB": buffer[stackSize++] = { i, opcode: 0x4B }; break;
            case "SINC": buffer[stackSize++] = { i, opcode: 0x4C }; break;
            case "FINC": buffer[stackSize++] = { i, opcode: 0x4D }; break;
            case "SDEC": buffer[stackSize++] = { i, opcode: 0x4E }; break;
            case "FDEC": buffer[stackSize++] = { i, opcode: 0x4F }; break;

            case "SNEG": buffer[stackSize++] = { i, opcode: 0x50 }; break;
            case "FNEG": buffer[stackSize++] = { i, opcode: 0x51 }; break;

            case "NOT": buffer[stackSize++] = { i, opcode: 0x59 }; break;

            case "SWAP":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x17
                };
                break;
            case "RAND":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x1A
                };
                break;
            case "NEG":
                buffer[stackSize++] = {
                    i,
                    opcode: 0x25
                };
                break;
            case "SAVE":
                processSAVE(i, parameters);
                break;
            case "SAVEA":
                processSAVEA(i, parameters);
                break;
            case "SAVEB":
                processSAVEB(i, parameters);
                break;
            case "STORE":
                processSTORE(i, parameters);
                break;
            case "STOREPUSH":
                processSTOREPUSH(i, parameters);
                break;
            case "QSTORE":
                processQSTORE(i, parameters);
                break;
            case "QADD":
                processQOperation(i, parameters, 0x32);
                break;
            case "QSUB":
                processQOperation(i, parameters, 0x60);
                break;
            case "QLADD":
                processQOperation(i, parameters, 0x5E);
                break;
            case "QLSUB":
                processQOperation(i, parameters, 0x5F);
                break;
            case "GETAVB":
                processQOperation(i, parameters, 0x61);
                break;
            case "SETLED":
                buffer[stackSize++] = { i, opcode: 0x38 };
                break;
            case "VGETA":
                processVGETA(i, parameters);
                break;
            case "VGETB":
                processVGETB(i, parameters);
                break;
            case "GETA":
                processGETA(i, parameters);
                break;
            case "GETB":
                processGETB(i, parameters);
                break;
            case "PUSH":
                processPUSH(i, parameters);
                break;
            case "POP":
                processPOP(i, parameters);
                break;
            case "INC":
                processINC(i);
                break;
            case "DEC":
                processDEC(i);
                break;
            case "CMP":
                processCMP(i);
                break;
            case "JA":
                processJA(i, parameters);
                break;
            case "JNA":
                processJNA(i, parameters);
                break;
            case "JZ":
                processJZ(i, parameters);
                break;
            case "JNZ":
                processJNZ(i, parameters);
                break;
            case "JLT":
                processJLT(i, parameters);
                break;
            case "JLTE":
                processJLTE(i, parameters);
                break;
            case "JGTE":
                processJGTE(i, parameters);
                break;
            case "JGT":
                processJGT(i, parameters);
                break;
            case "JMP":
                processJMP(i, parameters);
                break;
            case "RCALL":
                processRCALL(i, parameters);
                break;
            case "CALL":
                processCALL(i, parameters);
                break;
            case "RTN":
                processRTN(i);
                break;
            case "MOV":
                processMOV(i, parameters);
                break;
            case "MOVIN":
                processMOVIN(i, parameters);
                break;
            case "MOVOUT":
                processMOVOUT(i, parameters);
                break;
            default:
                errorList.push({
                    startLineNumber: i + 1,
                    message: "Unknown opcode provided.",
                    severity: monaco.MarkerSeverity.Error, endColumn: 999
                });
                break;
        }
    }

    if (memorySize + stackSize > MAX_MEMORY)
    {
        errorList.push({
            startLineNumber: 0,
            endLineNumber: 99999,
            message: "Not enough space, (" + memorySize + "," + stackSize + ").",
            severity: monaco.MarkerSeverity.Error,
            endColumn: 999
        });
        return;
    }

    console.log(`Resources used: ${memorySize + stackSize} / ${MAX_MEMORY}`)

    let stackBuffer = [];

    for (let i = 0; i < stackSize; i++)
    {
        const operation = buffer[i];

        if (!operation)
            continue;

        if ("value" in operation)
        {
            stackBuffer[i] = operation.value;

            continue;
        }

        let opcode_string = operation.opcode.toString(16).padStart(2, "0");
        let arg0_string = "000";
        let arg1_string = "000";

        if ("arg1" in operation)
        {
            if (operation.takeAsValue0)
            {
                arg0_string = operation.arg0.toString(16).padStart(3, "0");
            }
            else if (typeof operation.arg0 == "string")
            {
                if (!(operation.arg0 in labels))
                {
                    errorList.push({
                        startLineNumber: operation.index + 1,
                        message: "The label '" + operation.arg0 + "' was not found.",
                        severity: monaco.MarkerSeverity.Error, endColumn: 999
                    });
                    break;
                }

                arg0_string = labels[operation.arg0].toString(16).padStart(3, "0");
            }
            else
            {
                arg0_string = (stackSize + operation.arg0).toString(16).padStart(3, "0");
                memoryRegions.add(stackSize + operation.arg0);
            }

            if (operation.takeAsValue1)
            {
                arg1_string = operation.arg1.toString(16).padStart(3, "0");
            }
            else if (typeof operation.arg1 == "string")
            {
                if (!(operation.arg1 in labels))
                {
                    errorList.push({
                        startLineNumber: operation.index + 1,
                        message: "The label '" + operation.arg1 + "' was not found.",
                        severity: monaco.MarkerSeverity.Error, endColumn: 999
                    });
                    break;
                }

                arg1_string = labels[operation.arg1].toString(16).padStart(3, "0");
            }
            else
            {
                arg1_string = (stackSize + operation.arg1).toString(16).padStart(3, "0");
                memoryRegions.add(stackSize + operation.arg1);
            }
        }
        else if ("arg0" in operation)
        {
            if (operation.takeAsValue0)
            {
                arg0_string = operation.arg0.toString(16).padStart(3, "0");
            }
            else if (typeof operation.arg0 == "string")
            {
                if (!(operation.arg0 in labels))
                {
                    errorList.push({
                        startLineNumber: operation.index + 1,
                        message: "The label '" + operation.arg0 + "' was not found.",
                        severity: monaco.MarkerSeverity.Error, endColumn: 999
                    });
                    break;
                }

                arg0_string = labels[operation.arg0].toString(16).padStart(3, "0");
            }
            else
            {
                arg0_string = (stackSize + operation.arg0).toString(16).padStart(3, "0");
                memoryRegions.add(stackSize + operation.arg0);
            }
        }

        stackBuffer[i] = parseInt(arg1_string + arg0_string + opcode_string, 16);
    }

    final.readRegions = [];
    for (let readRegionIndex in readRegions)
    {
        let readRegion = readRegions[readRegionIndex];

        if (typeof readRegion.address == "string")
        {
            if (!(readRegion.address in labels))
            {
                errorList.push({
                    startLineNumber: 0,
                    endLineNumber: 9999999,
                    message: "The label '" + readRegion.address + "' was not found.",
                    severity: monaco.MarkerSeverity.Error, endColumn: 999
                });
                break;
            }

            readRegion.address = parseInt(labels[readRegion.address]);
        }
        else
        {
            readRegion.address = parseInt(readRegion.address);
        }

        final.readRegions.push(
            readRegion
        );
    }

    final.stack = stackBuffer;
    final.regions = Array.from(memoryRegions).sort(function(a, b){return a - b});
}

function parseAddress(index, parameter)
{
    if (parameter.match(ADDR_REGEX))
    {
        const address = parseInt(parameter.replace("a", ""));

        if (address > 0xFFF)
        {
            errorList.push({
                startLineNumber: index + 1,
                message: "Addresses are limited to 12 bits",
                severity: monaco.MarkerSeverity.Error, endColumn: 999
            });
            return null;
        }

        if (memorySize < address + 1)
        {
            memorySize = address + 1;
        }

        return address;
    }
    else if (parameter.match(LABEL_INLINE_REGEX))
    {
        return parameter;
    }
    else
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected address.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });

        return null;
    }
}

function processData(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected one argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    //////////////////////////////////////

    const value = parseValue(index, parameters[1]);

    if (value == null) return;

    buffer[stackSize++] = { index, value: value };
}

function processRead(index, parameters)
{
    if (parameters.length - 1 != 2)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    //////////////////////////////////////

    let value = getAddressableValueOrNumericValue(index, parameters[1]);

    if (value == null)
    {
        return;
    }

    readRegions.push({
        address: value.value,
        name: parameters[2]
    });
}

function processHALT(index)
{
    buffer[stackSize++] = {
        index,
        opcode: 0x0
    };
}

function processCMP(index)
{
    buffer[stackSize++] = {
        index,
        opcode: 0x0E
    };
}

function processINC(index)
{
    buffer[stackSize++] = {
        index,
        opcode: 0x0B
    };
}

function processDEC(index)
{
    buffer[stackSize++] = {
        index,
        opcode: 0x0C
    };
}

function processRTN(index)
{
    buffer[stackSize++] = {
        index,
        opcode: 0x10
    };
}

function processSAVE(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x01,
        arg0: address
    };
}

function processSAVEA(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x18,
        arg0: address
    };
}

function processSAVEB(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x19,
        arg0: address
    };
}

function processCALL(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x0F,
        arg0: address
    };
}

function processMOVIN(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two address arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const source = parseAddress(index, parameters[1]);

    if (source == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x34,
        addresses: true,
        arg0: source,
    };
}

function processMOVOUT(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two address arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const dest = parseAddress(index, parameters[1]);

    if (dest == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x33,
        addresses: true,
        arg0: dest,
    };
}

function processMOV(index, parameters)
{
    if (parameters.length - 1 != 2)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two address arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const source = parseAddress(index, parameters[1]);

    if (source == null) return;

    const dest = parseAddress(index, parameters[2]);

    if (dest == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x12,
        addresses: true,
        arg0: source,
        arg1: dest
    };
}

function processJNZ(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x11,
        arg0: address
    };
}

function processJLT(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x13,
        arg0: address
    };
}

function processJLTE(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x14,
        arg0: address
    };
}

function processJGT(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x15,
        arg0: address
    };
}

function processJGTE(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x16,
        arg0: address
    };
}

function processJZ(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x0D,
        arg0: address
    };
}

function processJA(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x23,
        arg0: address
    };
}

function processJNA(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x24,
        arg0: address
    };
}

function processJMP(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x0A,
        arg0: address
    };
}

function processPUSH(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x1B,
        arg0: address
    };
}

function processPOP(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x1C,
        arg0: address
    };
}

function processGETA(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x03,
        arg0: address
    };
}

function processGETB(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x04,
        arg0: address
    };
}

function parseValue(index, valueToParse)
{
    let value = 0;

    if (valueToParse.startsWith("0x"))
    {
        value = parseInt(valueToParse.substring(2), 16);
    }
    else if (valueToParse.endsWith("f") || valueToParse.includes("."))
    {
        const Float32ToHex = (float32) => {
            const getHex = i => ('00' + i.toString(16)).slice(-2);
            var view = new DataView(new ArrayBuffer(4))
            view.setFloat32(0, float32);
            return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i))).join('');
        };

        value = parseInt(Float32ToHex(parseFloat(valueToParse.replace("f", ""))), 16);
    }
    else
    {
        value = parseInt(valueToParse, 10);
    }

    if (isNaN(value))
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a hexadecimal number or a decimal number.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return null;
    }

    if (value > 0xFFFFFFFF)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Values are limited to 32 bits.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return null;
    }

    return value;
}

function processSTOREPUSH(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected one argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    //////////////////////////////////////

    const value = parseValue(index, parameters[1]);

    if (value == null) return;

    //////////////////////////////////////

    buffer[stackSize] = {
        index,
        opcode: 0x56
    };

    buffer[stackSize + 1] = {
        index,
        value: value
    };

    stackSize += 2;
}

function processSTORE(index, parameters)
{
    if (parameters.length - 1 != 2)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    //////////////////////////////////////

    const value = parseValue(index, parameters[1]);

    if (value == null) return;

    //////////////////////////////////////

    const address = parseAddress(index, parameters[2]);

    if (address == null) return;

    buffer[stackSize] = {
        index,
        opcode: 0x02,
        arg0: address
    };

    buffer[stackSize + 1] = {
        index,
        value: value
    };

    stackSize += 2;
}

function processQSTORE(index, parameters)
{
    if (parameters.length - 1 != 2)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const arg0 = getAddressableValueOrNumericValue(index, parameters[1]);
    const arg1 = getAddressableValueOrNumericValue(index, parameters[2]);

    if (arg0 == null || arg1 == null)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Invalid argument values.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    buffer[stackSize] = {
        index,
        opcode: 0x37,
        takeAsValue0: !arg0.isAddress,
        takeAsValue1: !arg1.isAddress,
        arg0: arg0.value,
        arg1: arg1.value
    };

    stackSize += 1;
}

function getAddressableValueOrNumericValue(index, value)
{
    let parsedValue = parseAddress(index, value);
    let isAddress = parsedValue != null;

    if (!isAddress)
    {
        errorList.pop();

        parsedValue = parseValue(index, value);

        if (parsedValue && (parsedValue > 4095 || parsedValue < 0))
        {
            errorList.push({
                startLineNumber: index + 1,
                message: `The value ${parsedValue} must be within 0 and 4095.`,
                severity: monaco.MarkerSeverity.Error, endColumn: 999
            });
        }
    }

    return { isAddress, value: parsedValue };
}

function processQOperation(index, parameters, opcode)
{
    if (parameters.length - 1 != 2)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected two arguments.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const arg0 = getAddressableValueOrNumericValue(index, parameters[1]);
    const arg1 = getAddressableValueOrNumericValue(index, parameters[2]);

    if (arg0 == null || arg1 == null)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Invalid argument values.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    buffer[stackSize] = {
        index,
        opcode: opcode,
        takeAsValue0: !arg0.isAddress,
        takeAsValue1: !arg1.isAddress,
        arg0: arg0.value,
        arg1: arg1.value
    };

    stackSize += 1;
}

function processRCALL(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected a single argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const address = parseAddress(index, parameters[1]);

    if (address == null) return;

    buffer[stackSize++] = {
        index,
        opcode: 0x39,
        arg0: address
    };
}

function processVPUSH(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected one argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const arg0 = getAddressableValueOrNumericValue(index, parameters[1]);

    if (arg0 == null)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Invalid argument values.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    buffer[stackSize] = {
        index,
        opcode: 0x52,
        takeAsValue0: !arg0.isAddress,
        arg0: arg0.value,
    };

    stackSize += 1;
}

function processVGETA(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected one argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const arg0 = getAddressableValueOrNumericValue(index, parameters[1]);

    if (arg0 == null)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Invalid argument values.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    buffer[stackSize] = {
        index,
        opcode: 0x35,
        takeAsValue0: !arg0.isAddress,
        arg0: arg0.value,
    };

    stackSize += 1;
}

function processVGETB(index, parameters)
{
    if (parameters.length - 1 != 1)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Expected one argument.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    const arg0 = getAddressableValueOrNumericValue(index, parameters[1]);

    if (arg0 == null)
    {
        errorList.push({
            startLineNumber: index + 1,
            message: "Invalid argument values.",
            severity: monaco.MarkerSeverity.Error, endColumn: 999
        });
        return;
    }

    buffer[stackSize] = {
        index,
        opcode: 0x36,
        takeAsValue0: !arg0.isAddress,
        arg0: arg0.value,
    };

    stackSize += 1;
}
