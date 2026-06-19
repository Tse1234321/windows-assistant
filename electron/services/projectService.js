'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const electron = require('electron');

const gitService = require('./gitService');

const shell = electron.shell || {
  openPath: async () => 'Electron shell is unavailable.',
  showItemInFolder: () => {},
};
const app = electron.app;

const DEFAULT_EXCLUDES = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'AppData',
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.cache',
  '.vscode',
  'venv',
  '.venv',
  'release',
  'release-auto',
  'target',
  '__pycache__',
];

const FILTERS = [
  'All',
  'Code Project',
  'Git Repo',
  'Electron',
  'React / Vite',
  'Node.js',
  'Python',
  'C / C++',
  'Verilog',
  'Java',
  'C#',
  'Web',
  'Homework / School',
  'PDF / Report',
  'Image / Media',
  'Game',
  'Tool / App',
  'Backup',
  'Unknown',
];

const LANGUAGE_MODULES = {
  javascript: { name: 'JavaScript', files: { 'javascript/package.json': (name) => JSON.stringify({ name: name + '-javascript', version: '0.1.0', private: true, scripts: { start: 'node src/index.js' } }, null, 2), 'javascript/src/index.js': "console.log('Hello from JavaScript');\n" } },
  typescript: { name: 'TypeScript', files: { 'typescript/package.json': (name) => JSON.stringify({ name: name + '-typescript', version: '0.1.0', private: true, scripts: { build: 'tsc', start: 'node dist/index.js' }, devDependencies: { typescript: '^5.7.2' } }, null, 2), 'typescript/tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', outDir: 'dist', strict: true }, include: ['src'] }, null, 2), 'typescript/src/index.ts': "const message: string = 'Hello from TypeScript';\nconsole.log(message);\n" } },
  python: { name: 'Python', files: { 'python/README.md': '# Python\n\nPython workspace.\n', 'python/main.py': "def main():\n    print('Hello from Python')\n\n\nif __name__ == '__main__':\n    main()\n", 'python/requirements.txt': '' } },
  java: { name: 'Java', files: { 'java/src/Main.java': "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from Java\");\n    }\n}\n" } },
  csharp: { name: 'C#', files: { 'csharp/Program.cs': "Console.WriteLine(\"Hello from C#\");\n", 'csharp/README.md': '# C#\n\nRun dotnet new console if you want a full project file.\n' } },
  cpp: { name: 'C / C++', files: { 'cpp/main.cpp': "#include <iostream>\n\nint main() {\n    std::cout << \"Hello from C++\" << std::endl;\n    return 0;\n}\n", 'cpp/CMakeLists.txt': (name) => "cmake_minimum_required(VERSION 3.16)\nproject(" + name.replace(/[^A-Za-z0-9_]/g, '_') + "_cpp)\nset(CMAKE_CXX_STANDARD 17)\nadd_executable(app main.cpp)\n" } },
  go: { name: 'Go', files: { 'go/go.mod': (name) => 'module ' + name.replace(/[^a-zA-Z0-9_-]/g, '-') + '/go\n\ngo 1.22\n', 'go/main.go': "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello from Go\")\n}\n" } },
  rust: { name: 'Rust', files: { 'rust/Cargo.toml': (name) => '[package]\nname = "' + name.replace(/[^a-zA-Z0-9_-]/g, '-') + '-rust"\nversion = "0.1.0"\nedition = "2021"\n', 'rust/src/main.rs': 'fn main() {\n    println!("Hello from Rust");\n}\n' } },
  php: { name: 'PHP', files: { 'php/index.php': "<?php\necho 'Hello from PHP';\n" } },
  ruby: { name: 'Ruby', files: { 'ruby/main.rb': "puts 'Hello from Ruby'\n" } },
  dart: { name: 'Dart', files: { 'dart/main.dart': "void main() {\n  print('Hello from Dart');\n}\n" } },
  kotlin: { name: 'Kotlin', files: { 'kotlin/Main.kt': "fun main() {\n    println(\"Hello from Kotlin\")\n}\n" } },
  swift: { name: 'Swift', files: { 'swift/main.swift': "print(\"Hello from Swift\")\n" } },
  verilog: { name: 'Verilog', files: { 'verilog/top.v': "module top;\n  initial begin\n    $display(\"Hello from Verilog\");\n  end\nendmodule\n" } },
  sql: { name: 'SQL', files: { 'sql/schema.sql': "CREATE TABLE example (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);\n", 'sql/query.sql': 'SELECT * FROM example;\n' } },
  powershell: { name: 'PowerShell', files: { 'powershell/main.ps1': "Write-Host 'Hello from PowerShell'\n" } },
  htmlcss: { name: 'HTML / CSS', files: { 'web/index.html': '<!doctype html>\n<html><head><meta charset="utf-8"><title>Web Workspace</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Hello Web</h1></main><script src="app.js"></script></body></html>\n', 'web/styles.css': 'body { font-family: system-ui, sans-serif; margin: 40px; }\n', 'web/app.js': "console.log('Hello Web');\n" } },
  arduino: { name: 'Arduino', files: { 'sketch/sketch.ino': "// Arduino sketch - blink the on-board LED\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(500);\n  digitalWrite(LED_PIN, LOW);\n  delay(500);\n}\n", 'README.md': '# Arduino\n\nThe sketch lives in ./sketch (arduino-cli needs the folder name to match the .ino).\nIn VS Code: Terminal > Run Build Task to compile (arduino-cli, board arduino:avr:uno).\nFor upload, edit the COM port in .vscode/tasks.json.\n' } },
  vhdl: { name: 'VHDL', files: { 'vhdl/top.vhd': "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\nentity top is\n  port (\n    clk : in  STD_LOGIC;\n    rst : in  STD_LOGIC;\n    led : out STD_LOGIC\n  );\nend top;\n\narchitecture Behavioral of top is\n  -- internal signal: an 'out' port cannot be read back in plain VHDL\n  signal led_i : STD_LOGIC := '0';\nbegin\n  led <= led_i;\n  process(clk, rst)\n  begin\n    if rst = '1' then\n      led_i <= '0';\n    elsif rising_edge(clk) then\n      led_i <= not led_i;\n    end if;\n  end process;\nend Behavioral;\n" } },
  matlab: { name: 'MATLAB', files: { 'matlab/main.m': "% MATLAB workspace - plot a sine wave\nfs = 1000;          % sampling frequency (Hz)\nt = 0:1/fs:1;       % time vector\nf = 5;              % signal frequency (Hz)\nx = sin(2*pi*f*t);\nplot(t, x);\nxlabel('Time (s)');\nylabel('Amplitude');\ntitle('Sine wave');\ngrid on;\n", 'matlab/README.md': '# MATLAB\n\nRun main.m in MATLAB or GNU Octave.\n' } },
};

// VS Code build configs embedded into EE templates so new projects compile out of the box.
// Single-quoted strings so the JSON double-quotes need no escaping. Tasks run with cwd =
// workspaceFolder, so relative paths work; tools (arduino-cli, iverilog, ghdl, arm-none-eabi-gcc,
// octave) are expected on PATH after the toolchain install.
const VSCODE = {
  arduino: '{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "Arduino: Compile (Uno)",\n      "type": "shell",\n      "command": "arduino-cli",\n      "args": ["compile", "--fqbn", "arduino:avr:uno", "${workspaceFolder}/sketch"],\n      "group": { "kind": "build", "isDefault": true },\n      "problemMatcher": ["$gcc"]\n    },\n    {\n      "label": "Arduino: Upload (Uno - edit COM port)",\n      "type": "shell",\n      "command": "arduino-cli",\n      "args": ["upload", "-p", "COM3", "--fqbn", "arduino:avr:uno", "${workspaceFolder}/sketch"],\n      "problemMatcher": []\n    }\n  ]\n}\n',
  verilog: '{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "Verilog: Compile (iverilog)",\n      "type": "shell",\n      "command": "iverilog",\n      "args": ["-o", "sim.out", "verilog/top.v", "verilog/tb_top.v"],\n      "group": { "kind": "build", "isDefault": true },\n      "problemMatcher": []\n    },\n    {\n      "label": "Verilog: Run (vvp)",\n      "type": "shell",\n      "command": "vvp",\n      "args": ["sim.out"],\n      "dependsOn": "Verilog: Compile (iverilog)",\n      "problemMatcher": []\n    }\n  ]\n}\n',
  vhdl: '{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "VHDL: Analyze + Elaborate (GHDL)",\n      "type": "shell",\n      "command": "ghdl",\n      "args": ["-a", "vhdl/top.vhd"],\n      "group": { "kind": "build", "isDefault": true },\n      "problemMatcher": []\n    }\n  ]\n}\n',
  octave: '{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "Octave: Run main.m",\n      "type": "shell",\n      "command": "octave",\n      "args": ["--no-gui", "matlab/main.m"],\n      "group": { "kind": "build", "isDefault": true },\n      "problemMatcher": []\n    }\n  ]\n}\n',
  stm32Tasks: '{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "STM32: Compile (arm-none-eabi-gcc)",\n      "type": "shell",\n      "command": "arm-none-eabi-gcc",\n      "args": ["-c", "-mcpu=cortex-m4", "-mthumb", "-Wall", "src/main.c", "-o", "build/main.o"],\n      "group": { "kind": "build", "isDefault": true },\n      "problemMatcher": ["$gcc"]\n    }\n  ]\n}\n',
  stm32CppProps: '{\n  "version": 4,\n  "configurations": [\n    {\n      "name": "STM32",\n      "includePath": ["${workspaceFolder}/**"],\n      "compilerPath": "arm-none-eabi-gcc",\n      "cStandard": "c11",\n      "intelliSenseMode": "gcc-arm"\n    }\n  ]\n}\n',
};

const PROJECT_TEMPLATES = [
  { id: 'react-vite', name: 'React / Vite', description: 'Frontend React app with Vite.', devCommand: 'npm run dev', moduleIds: [], files: { 'package.json': (name) => JSON.stringify({ scripts: { dev: 'vite --host 127.0.0.1', build: 'vite build', preview: 'vite preview' }, dependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.0.7', react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: {}, private: true, name, version: '0.1.0' }, null, 2), 'index.html': '<div id="root"></div><script type="module" src="/src/App.jsx"></script>\n', 'src/App.jsx': "export default function App() {\n  return <main><h1>Hello React workspace</h1></main>;\n}\n" } },
  { id: 'electron', name: 'Electron App', description: 'Minimal Electron desktop app.', devCommand: 'npm run dev', moduleIds: [], files: { 'package.json': (name) => JSON.stringify({ scripts: { dev: 'electron .' }, devDependencies: { electron: '^42.4.1' }, private: true, main: 'main.js', name, version: '0.1.0' }, null, 2), 'main.js': "const { app, BrowserWindow } = require('electron');\n\napp.whenReady().then(() => {\n  const win = new BrowserWindow({ width: 1000, height: 700 });\n  win.loadFile('index.html');\n});\n", 'index.html': '<h1>Hello Electron</h1>\n' } },
  { id: 'python', name: 'Python', description: 'Python script workspace.', devCommand: '', moduleIds: ['python'], files: {} },
  { id: 'javascript', name: 'JavaScript', description: 'Node.js JavaScript workspace.', devCommand: '', moduleIds: ['javascript'], files: {} },
  { id: 'typescript', name: 'TypeScript', description: 'TypeScript workspace.', devCommand: '', moduleIds: ['typescript'], files: {} },
  { id: 'java', name: 'Java', description: 'Java starter workspace.', devCommand: '', moduleIds: ['java'], files: {} },
  { id: 'csharp', name: 'C#', description: 'C# starter workspace.', devCommand: '', moduleIds: ['csharp'], files: {} },
  { id: 'cpp', name: 'C / C++', description: 'C++ starter workspace with CMake.', devCommand: '', moduleIds: ['cpp'], files: {} },
  { id: 'go', name: 'Go', description: 'Go module workspace.', devCommand: '', moduleIds: ['go'], files: {} },
  { id: 'rust', name: 'Rust', description: 'Rust Cargo workspace.', devCommand: '', moduleIds: ['rust'], files: {} },
  { id: 'web', name: 'HTML / CSS / JS', description: 'Static web workspace.', devCommand: '', moduleIds: ['htmlcss'], files: {} },
  { id: 'data-stack', name: 'Python + SQL', description: 'Data scripting workspace.', devCommand: '', moduleIds: ['python', 'sql'], files: {} },
  { id: 'fullstack-js', name: 'TypeScript + Web', description: 'TypeScript and web starter workspace.', devCommand: '', moduleIds: ['typescript', 'htmlcss'], files: {} },
  { id: 'hardware', name: 'C++ + Verilog', description: 'Hardware / firmware starter workspace.', devCommand: '', moduleIds: ['cpp', 'verilog'], files: {} },
  { id: 'arduino', name: 'Arduino / 微控制器', description: 'Arduino / microcontroller sketch workspace.', devCommand: '', moduleIds: ['arduino'], files: { '.vscode/tasks.json': VSCODE.arduino } },
  { id: 'fpga-verilog', name: 'FPGA / Verilog', description: 'Verilog RTL + testbench for Quartus / Vivado.', devCommand: '', moduleIds: ['verilog'], files: { 'verilog/tb_top.v': "`timescale 1ns/1ps\nmodule tb_top;\n  reg clk = 0;\n  always #5 clk = ~clk;\n\n  initial begin\n    $dumpfile(\"tb_top.vcd\");\n    $dumpvars(0, tb_top);\n    #100 $finish;\n  end\nendmodule\n", 'README.md': (name) => '# ' + name + '\n\nVerilog RTL in verilog/top.v with a testbench in verilog/tb_top.v.\nSynthesize in Quartus / Vivado; simulate with ModelSim / Icarus Verilog.\nIn VS Code: Run Build Task to compile + simulate (iverilog), then "Verilog: Run (vvp)".\n', '.vscode/tasks.json': VSCODE.verilog } },
  { id: 'fpga-vhdl', name: 'FPGA / VHDL', description: 'VHDL RTL workspace for Quartus / Vivado.', devCommand: '', moduleIds: ['vhdl'], files: { '.vscode/tasks.json': VSCODE.vhdl } },
  { id: 'matlab', name: 'MATLAB / 訊號處理', description: 'MATLAB / Octave scripting workspace.', devCommand: '', moduleIds: ['matlab'], files: { '.vscode/tasks.json': VSCODE.octave } },
  { id: 'embedded-c', name: 'STM32 / 嵌入式 C', description: 'Bare-metal embedded C workspace.', devCommand: '', moduleIds: [], files: { 'src/main.c': "#include <stdint.h>\n\nint main(void) {\n    /* TODO: init clocks, GPIO and peripherals */\n    for (;;) {\n        /* main loop */\n    }\n    return 0;\n}\n", 'build/.gitkeep': '', '.vscode/tasks.json': VSCODE.stm32Tasks, '.vscode/c_cpp_properties.json': VSCODE.stm32CppProps, 'README.md': (name) => '# ' + name + '\n\nBare-metal embedded C. In VS Code: Run Build Task to compile src/main.c to build/main.o with arm-none-eabi-gcc.\nFull firmware (linking) needs a startup file + linker script for your specific MCU; flashing uses OpenOCD or STM32CubeIDE.\n' } },
  { id: 'kicad', name: 'KiCad PCB 專案', description: 'KiCad PCB project scaffold (folders + notes).', devCommand: '', moduleIds: [], files: { 'README.md': (name) => '# ' + name + '\n\nKiCad PCB project. Create the .kicad_pro / .kicad_sch / .kicad_pcb here in KiCad.\n\n- datasheets/ - component datasheets\n- gerbers/ - fabrication output\n- sim/ - SPICE simulations\n', 'datasheets/.gitkeep': '', 'gerbers/.gitkeep': '', 'sim/.gitkeep': '' } },
  { id: 'documents', name: 'Documents', description: 'Reports, notes, assets, and exports.', devCommand: '', moduleIds: [], files: { 'README.md': (name) => '# ' + name + '\n\nDocument workspace.\n', 'notes/.gitkeep': '', 'exports/.gitkeep': '', 'assets/.gitkeep': '' } },
  { id: 'custom-combo', name: 'Custom Combo', description: 'Choose any language modules to combine.', devCommand: '', moduleIds: [], files: {} },
  { id: 'custom-folder', name: 'Custom Folder', description: 'Clean empty workspace folder.', devCommand: '', moduleIds: [], files: { 'README.md': (name) => '# ' + name + '\n' } },
];

const CODE_FILTERS = new Set([
  'Electron',
  'React / Vite',
  'Node.js',
  'Python',
  'C / C++',
  'Verilog',
  'Java',
  'C#',
  'Web',
  'Git Repo',
]);

const SOURCE_EXTS = new Set([
  '.html', '.css', '.scss', '.sass', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro',
  '.json', '.mjs', '.cjs',
  '.py', '.ipynb',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.ino',
  '.java', '.kt', '.kts',
  '.cs', '.csproj', '.sln',
  '.v', '.sv', '.vh', '.vhd', '.vhdl',
  '.go', '.rs', '.php', '.rb', '.swift', '.dart', '.lua', '.r', '.m', '.scala', '.pl',
  '.sh', '.bat', '.ps1', '.sql', '.asm', '.s',
]);

const REPORT_EXTS = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx']);
const MEDIA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.avi', '.mkv']);
const TOOL_EXTS = new Set(['.exe', '.msi', '.lnk', '.bat', '.cmd']);

const HOMEWORK_KEYWORDS = [
  'homework', '作業', '報告', 'lab', '實驗', 'calculus', 'physics', '電路', 'circuit',
  '1140570', '考試', '英文',
];
const GAME_KEYWORDS = ['steam', 'garena', 'curseforge', 'slay the spire', 'minecraft', 'game', '遊戲'];
const TOOL_KEYWORDS = ['installer', 'setup', 'shortcut', 'tool', 'tools', 'app', 'utility', '工具'];
const BACKUP_KEYWORDS = ['backup', '備份', 'aomei'];

const SCAN_LIMITS = {
  maxCandidateFolders: 1200,
  maxFilesPerFolder: 1800,
  maxSizeFiles: 8000,
  maxSizeDepth: 4,
};

let scanSeq = 0;
let activeScan = null;
let scanStatus = {
  active: false,
  canceled: false,
  scannedRoots: 0,
  totalRoots: 0,
  scannedFolders: 0,
  currentRoot: '',
  message: 'Idle',
};

function setScanStatus(patch) {
  scanStatus = {
    ...scanStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getScanStatus() {
  return { ok: true, status: { ...scanStatus } };
}

function cancelScan() {
  if (activeScan) {
    activeScan.canceled = true;
    setScanStatus({ canceled: true, message: 'Cancel requested' });
    return { ok: true, canceled: true };
  }
  return { ok: true, canceled: false };
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function safeAppPath(name, fallbackName) {
  try {
    if (app && app.isReady()) return app.getPath(name);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.homedir(), fallbackName);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    if (!value || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function defaultScanRoots() {
  return uniqueStrings([
    safeAppPath('desktop', 'Desktop'),
    safeAppPath('documents', 'Documents'),
    safeAppPath('downloads', 'Downloads'),
    safeAppPath('pictures', 'Pictures'),
    safeAppPath('videos', 'Videos'),
    safeAppPath('music', 'Music'),
    path.join(os.homedir(), 'Desktop', 'windows assistant'),
  ]);
}

function safeFolderName(name) {
  return String(name || 'new-workspace')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'new-workspace';
}

async function writeTemplateFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, content, 'utf-8');
  return target;
}

function publicTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    devCommand: template.devCommand || '',
    moduleIds: template.moduleIds || [],
    modules: (template.moduleIds || []).map((id) => LANGUAGE_MODULES[id] && LANGUAGE_MODULES[id].name).filter(Boolean),
    fileCount: Object.keys(template.files || {}).length,
    files: Object.keys(template.files || {}),
  };
}

function languageOptions() {
  return Object.entries(LANGUAGE_MODULES).map(([id, module]) => ({ id, name: module.name }));
}

function selectedModuleIds(template, payload = {}) {
  const requested = Array.isArray(payload.languageIds) ? payload.languageIds.filter((id) => LANGUAGE_MODULES[id]) : [];
  if (requested.length) return Array.from(new Set(requested));
  return Array.from(new Set((template.moduleIds || []).filter((id) => LANGUAGE_MODULES[id])));
}

function filesForTemplate(template, moduleIds, workspaceName) {
  const files = { ...(template.files || {}) };
  for (const id of moduleIds) {
    Object.assign(files, LANGUAGE_MODULES[id].files || {});
  }
  if (moduleIds.length) {
    const names = moduleIds.map((id) => LANGUAGE_MODULES[id].name).join(', ');
    files['README.md'] = files['README.md'] || ((name) => '# ' + name + '\n\nLanguages: ' + names + '\n');
  }
  return files;
}

async function createFromTemplate(config, payload = {}) {
  const startedAt = Date.now();
  const template = PROJECT_TEMPLATES.find((item) => item.id === payload.templateId) || PROJECT_TEMPLATES[0];
  const moduleIds = selectedModuleIds(template, payload);
  const name = safeFolderName(payload.name || template.name);
  const baseDir = payload.baseDir || (normalizeProjectHub(config).scanRoots[0] || safeAppPath('desktop', 'Desktop'));
  const target = path.join(baseDir, name);

  if (!isDirectory(baseDir)) return { ok: false, error: `Base folder not found: ${baseDir}` };
  if (fs.existsSync(target)) return { ok: false, error: `Folder already exists: ${target}` };

  const files = filesForTemplate(template, moduleIds, name);
  await fs.promises.mkdir(target, { recursive: true });
  const writtenFiles = await Promise.all(Object.entries(files).map(async ([relativePath, writer]) => {
    const content = typeof writer === 'function' ? writer(name) : writer;
    return writeTemplateFile(target, relativePath, content);
  }));

  return {
    ok: true,
    template: publicTemplate(template),
    languageIds: moduleIds,
    languages: moduleIds.map((id) => LANGUAGE_MODULES[id].name),
    writtenFiles,
    durationMs: Date.now() - startedAt,
    project: {
      name,
      path: target,
      gitReminderHours: 2,
      backupReminderHours: 24,
    },
  };
}

function normalizeProjectHub(config) {
  const raw = config && config.projectHub && typeof config.projectHub === 'object' ? config.projectHub : {};
  const hasScanRoots = Array.isArray(raw.scanRoots);
  const scanRoots = hasScanRoots ? raw.scanRoots : defaultScanRoots();
  const excludeFolders = Array.isArray(raw.excludeFolders) ? raw.excludeFolders : DEFAULT_EXCLUDES;
  const maxDepth = Number.isFinite(Number(raw.maxDepth)) ? Number(raw.maxDepth) : 2;
  const pinnedProjects = Array.isArray(raw.pinnedProjects)
    ? raw.pinnedProjects
        .map((item) => {
          if (typeof item === 'string') return { path: item, name: path.basename(item), isFile: false };
          if (!item || typeof item !== 'object' || !item.path) return null;
          return {
            name: item.name || path.basename(item.path),
            path: item.path,
            isFile: !!item.isFile,
            category: item.category || '',
          };
        })
        .filter(Boolean)
    : [];
  return {
    scanRoots: uniqueStrings(scanRoots),
    excludeFolders: uniqueStrings(excludeFolders.length ? excludeFolders : DEFAULT_EXCLUDES),
    maxDepth: Math.max(0, Math.min(5, Math.floor(maxDepth))),
    pinnedProjects,
  };
}

function pathKey(target) {
  return path.resolve(target).toLowerCase();
}

function safeStat(target) {
  try {
    return fs.statSync(target);
  } catch (_) {
    return null;
  }
}

async function safeStatAsync(target) {
  try {
    return await fs.promises.stat(target);
  } catch (_) {
    return null;
  }
}

function pathExists(target) {
  return !!safeStat(target);
}

function isDirectory(target) {
  const stat = safeStat(target);
  return !!stat && stat.isDirectory();
}

async function readDirSafe(dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
}

function splitExcludeRules(hub) {
  const names = new Set();
  const paths = [];
  for (const rule of hub.excludeFolders || []) {
    if (!rule || typeof rule !== 'string') continue;
    const trimmed = rule.trim();
    if (!trimmed) continue;
    if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
      paths.push(path.resolve(trimmed).toLowerCase());
    } else {
      names.add(trimmed.toLowerCase());
    }
  }
  return { names, paths };
}

function shouldSkipDirName(name, hub = normalizeProjectHub({})) {
  const { names } = splitExcludeRules(hub);
  return names.has(String(name || '').toLowerCase());
}

function shouldSkipPath(target, hub = normalizeProjectHub({})) {
  const resolved = path.resolve(target).toLowerCase();
  const { names, paths } = splitExcludeRules(hub);
  const parts = resolved.split(/[\\/]+/).map((part) => part.toLowerCase());
  if (parts.some((part) => names.has(part))) return true;
  return paths.some((excluded) => {
    const rel = path.relative(excluded, resolved);
    return resolved === excluded || (rel && !rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

function extOf(name) {
  return path.extname(String(name || '').toLowerCase());
}

function hasKeyword(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.some((keyword) => lower.includes(String(keyword).toLowerCase()));
}

function emptyStats() {
  return {
    totalFiles: 0,
    detectedFiles: 0,
    codeFiles: 0,
    reportFiles: 0,
    mediaFiles: 0,
    toolFiles: 0,
    byExt: {},
    fileNames: [],
    dirNames: [],
    sampleFiles: [],
    truncated: false,
  };
}

function addFileStats(stats, fileName) {
  const lower = fileName.toLowerCase();
  const ext = extOf(lower);
  stats.totalFiles += 1;
  stats.byExt[ext] = (stats.byExt[ext] || 0) + 1;
  if (stats.fileNames.length < 160) stats.fileNames.push(fileName);
  if (stats.sampleFiles.length < 10) stats.sampleFiles.push(fileName);
  if (SOURCE_EXTS.has(ext)) {
    stats.detectedFiles += 1;
    stats.codeFiles += 1;
  } else if (REPORT_EXTS.has(ext)) {
    stats.detectedFiles += 1;
    stats.reportFiles += 1;
  } else if (MEDIA_EXTS.has(ext)) {
    stats.detectedFiles += 1;
    stats.mediaFiles += 1;
  } else if (TOOL_EXTS.has(ext) || lower.includes('installer') || lower.includes('setup')) {
    stats.detectedFiles += 1;
    stats.toolFiles += 1;
  }
}

async function collectStats(dir, hub, depth = 0, stats = emptyStats()) {
  if (stats.totalFiles >= SCAN_LIMITS.maxFilesPerFolder) {
    stats.truncated = true;
    return stats;
  }
  const entries = await readDirSafe(dir);
  if (!entries) return stats;

  for (const entry of entries) {
    if (stats.totalFiles >= SCAN_LIMITS.maxFilesPerFolder) {
      stats.truncated = true;
      break;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirName(entry.name, hub) || shouldSkipPath(full, hub)) continue;
      if (stats.dirNames.length < 120) stats.dirNames.push(entry.name);
      if (depth < hub.maxDepth) await collectStats(full, hub, depth + 1, stats);
    } else if (entry.isFile()) {
      addFileStats(stats, entry.name);
    }
  }
  return stats;
}

function countExt(stats, exts) {
  return exts.reduce((sum, ext) => sum + (stats.byExt[ext] || 0), 0);
}

async function readPackageInfo(dir, hasPackageJson) {
  if (!hasPackageJson) return null;
  try {
    const parsed = JSON.parse(await fs.promises.readFile(path.join(dir, 'package.json'), 'utf-8'));
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
      ...(parsed.peerDependencies || {}),
      ...(parsed.optionalDependencies || {}),
    };
    const scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
    return {
      deps,
      scripts,
      scriptNames: Object.keys(scripts),
      hasElectron: !!deps.electron || !!deps['electron-builder'] || /electron/i.test(String(parsed.main || '')),
      hasReact: !!deps.react || !!deps['@vitejs/plugin-react'],
      hasVite: !!deps.vite || !!deps['@vitejs/plugin-react'] || !!deps['@vitejs/plugin-vue'],
      hasDevScript: !!scripts.dev,
      hasBuildScript: !!scripts.build,
      hasRunnableScript: Object.keys(scripts).length > 0,
    };
  } catch (_) {
    return {
      deps: {},
      scripts: {},
      scriptNames: [],
      hasElectron: false,
      hasReact: false,
      hasVite: false,
      hasDevScript: false,
      hasBuildScript: false,
      hasRunnableScript: false,
    };
  }
}

function directMarkers(entries) {
  const names = new Set((entries || []).map((entry) => entry.name.toLowerCase()));
  return {
    hasGit: names.has('.git'),
    hasPackageJson: names.has('package.json'),
    hasRequirements: names.has('requirements.txt'),
    hasPyproject: names.has('pyproject.toml'),
    hasCMake: names.has('cmakelists.txt'),
    hasMakefile: names.has('makefile'),
    hasPom: names.has('pom.xml'),
    hasGradle: names.has('build.gradle') || names.has('build.gradle.kts'),
    hasViteConfig: ['vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'vite.config.cjs'].some((name) => names.has(name)),
    hasAssets: names.has('assets'),
    hasPublic: names.has('public'),
    hasVenv: names.has('venv') || names.has('.venv'),
    hasIndexHtml: names.has('index.html'),
  };
}

function buildClassification({ name, markers, packageInfo, stats }) {
  const haystack = [name, ...stats.fileNames, ...stats.dirNames].join(' ');
  const filters = new Set();
  const tags = new Set();
  let category = 'Unknown';
  let weight = 0;

  const pyCount = countExt(stats, ['.py', '.ipynb']);
  const cppCount = countExt(stats, ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.ino']);
  const verilogCount = countExt(stats, ['.v', '.sv', '.vh', '.vhd', '.vhdl']);
  const javaCount = countExt(stats, ['.java', '.kt', '.kts']);
  const csharpCount = countExt(stats, ['.cs', '.csproj', '.sln']);
  const webCount = countExt(stats, ['.html', '.css', '.scss', '.sass', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro']);
  const homework = hasKeyword(haystack, HOMEWORK_KEYWORDS);
  const game = hasKeyword(haystack, GAME_KEYWORDS);
  const tool = hasKeyword(haystack, TOOL_KEYWORDS) || stats.toolFiles > 0;
  const backup = hasKeyword(haystack, BACKUP_KEYWORDS);

  if (markers.hasGit) {
    filters.add('Git Repo');
    tags.add('Git Repo');
  }
  if (homework) tags.add('Homework / School');
  if (game) tags.add('Game');
  if (tool) tags.add('Tool / App');
  if (backup) tags.add('Backup');

  function setCategory(next, nextWeight) {
    category = next;
    weight = nextWeight;
    filters.add(next);
    tags.add(next);
    if (CODE_FILTERS.has(next)) filters.add('Code Project');
  }

  if (packageInfo && packageInfo.hasElectron) {
    setCategory('Electron', 120);
    tags.add('Node.js');
  } else if ((packageInfo && (packageInfo.hasReact || packageInfo.hasVite)) || markers.hasViteConfig) {
    setCategory('React / Vite', 116);
    tags.add('Web');
    tags.add('Node.js');
  } else if (packageInfo) {
    setCategory('Node.js', 108);
  } else if (markers.hasRequirements || markers.hasPyproject || markers.hasVenv || pyCount > 0) {
    setCategory('Python', 102);
  } else if (markers.hasCMake || markers.hasMakefile || cppCount > 0) {
    setCategory('C / C++', 100);
  } else if (verilogCount > 0) {
    setCategory('Verilog', 98);
  } else if (markers.hasPom || markers.hasGradle || javaCount > 0) {
    setCategory('Java', 96);
  } else if (csharpCount > 0) {
    setCategory('C#', 94);
  } else if (markers.hasIndexHtml || markers.hasAssets || markers.hasPublic || webCount > 0) {
    setCategory('Web', 92);
  } else if (homework) {
    setCategory('Homework / School', 70);
  } else if (stats.reportFiles > 0 && stats.reportFiles >= Math.max(stats.mediaFiles, stats.toolFiles, stats.codeFiles)) {
    setCategory('PDF / Report', 62);
  } else if (stats.mediaFiles > 0 && stats.mediaFiles >= Math.max(stats.reportFiles, stats.toolFiles, stats.codeFiles)) {
    setCategory('Image / Media', 58);
  } else if (game) {
    setCategory('Game', 54);
  } else if (tool) {
    setCategory('Tool / App', 50);
  } else if (backup) {
    setCategory('Backup', 46);
  } else if (markers.hasGit) {
    setCategory('Git Repo', 80);
    filters.add('Code Project');
  } else {
    setCategory('Unknown', 5);
  }

  if (markers.hasGit) weight += 12;
  if (stats.detectedFiles > 0) weight += Math.min(20, stats.detectedFiles);

  return {
    category,
    filters: Array.from(filters),
    tags: Array.from(tags),
    weight,
  };
}

async function analyzeFolder(dir, hub) {
  const folderStat = await safeStatAsync(dir);
  if (!folderStat || !folderStat.isDirectory()) return null;
  const entries = await readDirSafe(dir);
  if (!entries) return null;

  const markers = directMarkers(entries);
  const packageInfo = await readPackageInfo(dir, markers.hasPackageJson);
  const stats = await collectStats(dir, hub);
  const classification = buildClassification({
    name: path.basename(dir),
    markers,
    packageInfo,
    stats,
  });

  return {
    name: path.basename(dir),
    path: dir,
    folderPath: dir,
    isFile: false,
    exists: true,
    category: classification.category,
    tags: classification.tags,
    filterCategories: classification.filters,
    detectedLanguage: classification.category,
    detectedFileCount: stats.detectedFiles,
    totalFileCount: stats.totalFiles,
    hasGit: markers.hasGit,
    isGitRepo: markers.hasGit,
    hasPackageJson: markers.hasPackageJson,
    hasRunnableScript: !!(packageInfo && packageInfo.hasRunnableScript),
    hasDevScript: !!(packageInfo && packageInfo.hasDevScript),
    hasBuildScript: !!(packageInfo && packageInfo.hasBuildScript),
    executableScripts: packageInfo ? packageInfo.scriptNames : [],
    lastModified: folderStat.mtime.toISOString(),
    sizeBytes: null,
    sizeStatus: 'pending',
    sourceSample: stats.sampleFiles,
    scanTruncated: stats.truncated,
    weight: classification.weight,
  };
}

async function collectCandidateFolders(root, hub, token, seen) {
  const candidates = [];
  const stat = await safeStatAsync(root);
  if (!stat || !stat.isDirectory() || shouldSkipPath(root, hub)) return candidates;

  const entries = await readDirSafe(root);
  if (!entries) return candidates;

  for (const entry of entries) {
    if (token.canceled || candidates.length >= SCAN_LIMITS.maxCandidateFolders) break;
    if (!entry.isDirectory()) continue;
    if (shouldSkipDirName(entry.name, hub)) continue;
    const full = path.join(root, entry.name);
    if (shouldSkipPath(full, hub)) continue;
    const key = pathKey(full);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(full);
  }

  return candidates;
}

async function listProjects(config) {
  const hub = normalizeProjectHub(config);
  const token = { id: ++scanSeq, canceled: false };
  activeScan = token;
  const roots = hub.scanRoots.filter((root) => isDirectory(root) && !shouldSkipPath(root, hub));
  const projects = [];
  const seen = new Set();

  setScanStatus({
    active: true,
    canceled: false,
    scannedRoots: 0,
    totalRoots: roots.length,
    scannedFolders: 0,
    currentRoot: '',
    message: 'Scanning Project Hub roots',
  });

  try {
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      if (token.canceled) break;
      const root = roots[rootIndex];
      setScanStatus({
        currentRoot: root,
        scannedRoots: rootIndex,
        message: `Reading ${root}`,
      });

      const candidates = await collectCandidateFolders(root, hub, token, seen);
      for (const folder of candidates) {
        if (token.canceled) break;
        const item = await analyzeFolder(folder, hub);
        if (item) projects.push(item);
        setScanStatus({
          scannedFolders: scanStatus.scannedFolders + 1,
          message: `Classified ${path.basename(folder)}`,
        });
        if (scanStatus.scannedFolders % 20 === 0) await yieldToEventLoop();
      }
      setScanStatus({ scannedRoots: rootIndex + 1 });
    }
  } finally {
    if (activeScan === token) activeScan = null;
    setScanStatus({
      active: false,
      canceled: token.canceled,
      currentRoot: '',
      message: token.canceled ? 'Scan canceled' : 'Scan complete',
    });
  }

  projects.sort((a, b) => {
    if ((b.weight || 0) !== (a.weight || 0)) return (b.weight || 0) - (a.weight || 0);
    const bTime = Date.parse(b.lastModified || 0);
    const aTime = Date.parse(a.lastModified || 0);
    return bTime - aTime || a.name.localeCompare(b.name);
  });

  return {
    ok: true,
    projects,
    filters: FILTERS,
    projectHub: hub,
    scannedRoots: roots,
    configuredRoots: hub.scanRoots,
    scannedDirs: scanStatus.scannedFolders,
    scanStatus: { ...scanStatus },
    canceled: token.canceled,
  };
}

function resolvePayloadTarget(payload) {
  if (!payload || !payload.projectPath) return null;
  return {
    name: payload.projectName || path.basename(payload.projectPath),
    path: payload.projectPath,
    isFile: !!payload.isFile,
  };
}

async function openFolder(target, isFile) {
  if (!pathExists(target)) return { ok: false, error: `Path not found: ${target}` };
  if (isFile) {
    shell.showItemInFolder(target);
    return { ok: true, message: 'Shown in folder' };
  }
  const err = await shell.openPath(target);
  return err ? { ok: false, error: err } : { ok: true, message: 'Opened folder' };
}

function spawnDetached(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: false,
  });
  if (process.platform !== 'win32') {
    try {
      child.unref();
    } catch (_) {
      /* noop */
    }
  }
  return child;
}

function openInVSCode(target, isFile) {
  if (!pathExists(target)) return { ok: false, error: `Path not found: ${target}` };
  return new Promise((resolve) => {
    try {
      const cwd = isFile ? path.dirname(target) : target;
      const args = isFile ? [target] : ['.'];
      const child = spawnDetached('code', args, cwd);
      child.on('error', (e) => resolve({ ok: false, error: `Could not start VS Code: ${e.message}` }));
      setTimeout(() => resolve({ ok: true, message: 'Opened in VS Code' }), 400);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function openTerminal(target, isFile) {
  if (!pathExists(target)) return { ok: false, error: `Path not found: ${target}` };
  return new Promise((resolve) => {
    try {
      const cwd = isFile ? path.dirname(target) : target;
      let child;
      if (process.platform === 'win32') {
        child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}"`], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
      } else if (process.platform === 'darwin') {
        child = spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' });
      } else {
        child = spawn('x-terminal-emulator', [], { cwd, detached: true, stdio: 'ignore' });
      }
      child.on('error', (e) => resolve({ ok: false, error: `Could not open terminal: ${e.message}` }));
      try {
        child.unref();
      } catch (_) {
        /* noop */
      }
      setTimeout(() => resolve({ ok: true, message: 'Opened terminal' }), 400);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function runNpmScript(target, scriptName) {
  if (!isDirectory(target)) return { ok: false, error: `Folder not found: ${target}` };
  const packagePath = path.join(target, 'package.json');
  if (!fs.existsSync(packagePath)) return { ok: false, error: 'This folder has no package.json.' };
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    if (!pkg.scripts || !pkg.scripts[scriptName]) return { ok: false, error: `package.json has no ${scriptName} script.` };
  } catch (_) {
    return { ok: false, error: 'Could not read package.json scripts.' };
  }

  return new Promise((resolve) => {
    try {
      const child = spawnDetached(`npm run ${scriptName}`, [], target);
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      setTimeout(() => resolve({ ok: true, message: `Started npm run ${scriptName}` }), 600);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function runAction(_config, payload) {
  const target = resolvePayloadTarget(payload);
  if (!target) return { ok: false, error: 'Project folder not found.' };

  switch (payload.action) {
    case 'openFolder':
      return openFolder(target.path, target.isFile);
    case 'openVSCode':
      return openInVSCode(target.path, target.isFile);
    case 'openTerminal':
      return openTerminal(target.path, target.isFile);
    case 'gitStatus':
      return { ok: true, status: await gitService.checkProject({ name: target.name, path: target.path }) };
    case 'runDev':
      return runNpmScript(target.path, 'dev');
    case 'runBuild':
      return runNpmScript(target.path, 'build');
    default:
      return { ok: false, error: `Unknown action: ${payload.action}` };
  }
}

async function calculateFolderSize(target, config) {
  const hub = normalizeProjectHub(config);
  let total = 0;
  let files = 0;
  let truncated = false;

  async function walk(dir, depth) {
    if (files >= SCAN_LIMITS.maxSizeFiles || depth > SCAN_LIMITS.maxSizeDepth) {
      truncated = true;
      return;
    }
    const entries = await readDirSafe(dir);
    if (!entries) return;
    for (const entry of entries) {
      if (files >= SCAN_LIMITS.maxSizeFiles) {
        truncated = true;
        break;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDirName(entry.name, hub) || shouldSkipPath(full, hub)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const stat = await safeStatAsync(full);
        if (stat) {
          total += stat.size;
          files += 1;
        }
      }
    }
  }

  if (!isDirectory(target) || shouldSkipPath(target, hub)) {
    return { ok: false, error: 'Folder not found or excluded.' };
  }
  await walk(target, 0);
  return { ok: true, path: target, bytes: total, files, truncated };
}

module.exports = {
  listProjects,
  runAction,
  getScanStatus,
  cancelScan,
  calculateFolderSize,
  createFromTemplate,
  PROJECT_TEMPLATES,
  LANGUAGE_MODULES,
  languageOptions,
  normalizeProjectHub,
  defaultScanRoots,
  shouldSkipDirName,
  shouldSkipPath,
};
