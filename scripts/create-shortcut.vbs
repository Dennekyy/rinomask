' Cria um atalho do RinoMask na Area de Trabalho.
' Aponta direto para o electron.exe do projeto (sem janela de terminal).
' Caminhos sao calculados a partir da localizacao deste script (portatil).

Set fso = CreateObject("Scripting.FileSystemObject")
Set ws  = CreateObject("WScript.Shell")

scriptDir   = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
root        = fso.GetParentFolderName(scriptDir)                ' raiz do projeto
electronExe = root & "\node_modules\electron\dist\electron.exe"
iconFile    = root & "\build\icon.ico"

If Not fso.FileExists(electronExe) Then
  WScript.Echo "Electron nao encontrado em: " & electronExe
  WScript.Echo "Rode 'npm install' primeiro."
  WScript.Quit 1
End If

desktop = ws.SpecialFolders("Desktop")
lnkPath = desktop & "\RinoMask.lnk"

Set lnk = ws.CreateShortcut(lnkPath)
lnk.TargetPath       = electronExe
lnk.Arguments        = """" & root & """"
lnk.WorkingDirectory = root
If fso.FileExists(iconFile) Then
  lnk.IconLocation   = iconFile & ",0"
Else
  lnk.IconLocation   = electronExe & ",0"
End If
lnk.Description       = "RinoMask - navegador antidetect"
lnk.WindowStyle       = 1
' Identidade na barra de tarefas (precisa casar com app.setAppUserModelId no main).
lnk.Save

WScript.Echo "Atalho criado em: " & lnkPath
