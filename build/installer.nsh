; Hook customizado do electron-builder (build.nsis.include) — roda alem da limpeza padrao
; (arquivos do programa, registro, atalhos, e %APPDATA%\RinoMask via deleteAppDataOnUninstall).
; ${isUpdated} (macro do proprio template do electron-builder, ver
; node_modules/app-builder-lib/templates/nsis/uninstaller.nsh) distingue uma desinstalacao DE
; VERDADE de um "reinstalar por cima" pra atualizar versao — sem essa guarda, toda atualizacao
; apagaria o cache do motor (~530 MB, teria que rebaixar) e a pasta legada de novo.
; Rastros removidos so numa desinstalacao real:
;  - antidetect-manager: nome anterior do app (ver migracao em electron/main.js).
;  - camoufox (Local): cache do motor de navegacao, baixado fora da pasta de dados do app.
;  - camoufox (Roaming): pasta de app-data que o proprio binario do Camoufox/Firefox cria
;    (extensoes etc.), separada do userDataDir de cada perfil do RinoMask.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\antidetect-manager"
    RMDir /r "$LOCALAPPDATA\camoufox"
    RMDir /r "$APPDATA\camoufox"
  ${endif}
!macroend
