; Hook customizado do electron-builder (build.nsis.include) — roda alem da limpeza padrao
; (arquivos do programa, registro, atalhos, e %APPDATA%\RinoMask via deleteAppDataOnUninstall).
; Remove tambem rastros que a limpeza padrao nao cobre:
;  - antidetect-manager: nome anterior do app (ver migracao em electron/main.js) — instalacoes
;    antigas deixam dados la, mesmo apos o usuario atualizar para o nome RinoMask.
;  - camoufox: cache do motor de navegacao (~530 MB), baixado fora da pasta de dados do app.
!macro customUnInstall
  RMDir /r "$APPDATA\antidetect-manager"
  RMDir /r "$LOCALAPPDATA\camoufox"
!macroend
