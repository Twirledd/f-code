// Single source of truth for IPC channel names.
export const IPC = {
  // toolchain
  toolchainDetect: 'toolchain:detect',
  toolchainInstallCommand: 'toolchain:installCommand',

  // project / files
  projectOpenDialog: 'project:openDialog',
  projectOpen: 'project:open',
  projectCreate: 'project:create',
  projectChooseLocation: 'project:chooseLocation',
  projectRecent: 'project:recent',
  projectRefresh: 'project:refresh',
  projectChanged: 'project:changed', // main -> renderer
  fileRead: 'file:read',
  fileWrite: 'file:write',
  fileCreate: 'file:create',
  fileDelete: 'file:delete',
  fileRename: 'file:rename',
  fileRevealInExplorer: 'file:reveal',

  // build / run / test
  buildStart: 'build:start',
  buildRun: 'build:run',
  buildTest: 'build:test',
  buildClean: 'build:clean',
  buildStop: 'build:stop',
  buildStatus: 'build:status', // main -> renderer
  consoleOutput: 'console:output', // main -> renderer
  consoleInput: 'console:input',
  testResults: 'test:results', // main -> renderer

  // LSP
  lspOpen: 'lsp:open',
  lspChange: 'lsp:change',
  lspClose: 'lsp:close',
  lspSave: 'lsp:save',
  lspCompletion: 'lsp:completion',
  lspHover: 'lsp:hover',
  lspDefinition: 'lsp:definition',
  lspDocumentSymbols: 'lsp:documentSymbols',
  lspDiagnostics: 'lsp:diagnostics', // main -> renderer
  lspStatus: 'lsp:status', // main -> renderer

  // Debug
  debugStart: 'debug:start',
  debugStop: 'debug:stop',
  debugContinue: 'debug:continue',
  debugPause: 'debug:pause',
  debugStepOver: 'debug:stepOver',
  debugStepIn: 'debug:stepIn',
  debugStepOut: 'debug:stepOut',
  debugSetBreakpoints: 'debug:setBreakpoints',
  debugScopes: 'debug:scopes',
  debugVariables: 'debug:variables',
  debugEvaluate: 'debug:evaluate',
  debugStatus: 'debug:status', // main -> renderer

  // SwiftUI preview (Simulator canvas)
  previewStart: 'preview:start',
  previewStop: 'preview:stop',
  previewEvent: 'preview:event',
  previewEnv: 'preview:env',
  previewTree: 'preview:tree', // main -> renderer
  previewStatus: 'preview:status', // main -> renderer

  // Remote Mac bridge
  macConfig: 'mac:config', // get saved connection + public key
  macConfigure: 'mac:configure', // save connection and connect
  macConnect: 'mac:connect',
  macSimulators: 'mac:simulators',
  macRun: 'mac:run',
  macBuild: 'mac:build',
  macTest: 'mac:test',
  macStop: 'mac:stop',
  macSetupInput: 'mac:setupInput',
  macTrustHost: 'mac:trustHost', // user compared the fingerprints: pin the host key
  macProtectKey: 'mac:protectKey', // passphrase-protect the SSH key (ssh-agent)
  macSwipe: 'mac:swipe',
  macButton: 'mac:button',
  macTap: 'mac:tap',
  macText: 'mac:text',
  macKey: 'mac:key',
  macUi: 'mac:ui', // appearance / content size
  macStatus: 'mac:status', // main -> renderer
  macRunStatus: 'mac:runStatus', // main -> renderer
  macFrame: 'mac:frame', // main -> renderer (base64 jpeg)

  // Source control (git on the PC)
  gitInfo: 'git:info',
  gitInit: 'git:init',
  gitDiff: 'git:diff',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitDiscard: 'git:discard',
  gitCommit: 'git:commit',
  gitFetch: 'git:fetch',
  gitPull: 'git:pull',
  gitPush: 'git:push',
  gitCheckout: 'git:checkout',
  gitCreateBranch: 'git:createBranch',
  gitAddRemote: 'git:addRemote',
  gitChooseCloneLocation: 'git:chooseCloneLocation',
  gitClone: 'git:clone',
  gitCloneCancel: 'git:cloneCancel',
  gitCloneProgress: 'git:cloneProgress', // main -> renderer

  // menu -> renderer commands
  menuCommand: 'menu:command',

  // window
  windowSetTitle: 'window:setTitle',
  windowSetTheme: 'window:setTheme',
  openExternal: 'shell:openExternal'
} as const
