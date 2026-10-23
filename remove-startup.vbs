Option Explicit
Dim sh, fs, installer
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
installer = fs.BuildPath(fs.GetParentFolderName(WScript.ScriptFullName), "bridge-startup.vbs")
If Not fs.FileExists(installer) Then
  MsgBox "bridge-startup.vbs tidak ditemukan.", vbExclamation, "1minAI Bridge"
  WScript.Quit 1
End If
sh.Run Chr(34) & sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe") & Chr(34) & _
  " //Nologo " & Chr(34) & installer & Chr(34) & " /remove", 1, False
