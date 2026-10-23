Option Explicit

' Double-click: install per-user startup and start hidden now.
' /run: launch only; /remove: remove this startup shortcut only.
' Keep this file beside bridge.mjs and config.local.json.
Dim sh, fs, folder, shortcutPath, nodePath, action, link, rc, i
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
shortcutPath = fs.BuildPath(sh.SpecialFolders("Startup"), "1minAI Bridge.lnk")
action = "/install"
If WScript.Arguments.Count > 0 Then action = LCase(WScript.Arguments(0))

If action = "/remove" Then
  If fs.FileExists(shortcutPath) Then fs.DeleteFile shortcutPath, True
  MsgBox "Startup 1minAI Bridge dihapus untuk akun Windows ini." & vbCrLf & _
    "Bridge yang sudah berjalan tetap aktif sampai dihentikan atau logout.", vbInformation, "1minAI Bridge"
  WScript.Quit 0
End If

If action <> "/install" And action <> "/run" Then
  MsgBox "Gunakan /install, /run, atau /remove.", vbExclamation, "1minAI Bridge"
  WScript.Quit 1
End If

If Not fs.FileExists(fs.BuildPath(folder, "bridge.mjs")) Then
  Fail "bridge.mjs tidak ditemukan. Letakkan VBS di folder bridge."
End If
If Not fs.FileExists(fs.BuildPath(folder, "config.local.json")) Then
  Fail "config.local.json belum ada. Jalankan start.cmd untuk setup pertama."
End If
nodePath = FindNode()
If nodePath = "" Then Fail "node.exe tidak ditemukan pada PATH. Periksa instalasi Node.js."

If action = "/install" Then
  Set link = sh.CreateShortcut(shortcutPath)
  link.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
  link.Arguments = "//B //Nologo " & Quote(WScript.ScriptFullName) & " /run"
  link.WorkingDirectory = folder
  link.Description = "Start 1minAI bridge at Windows sign-in"
  link.IconLocation = nodePath & ",0"
  link.Save
End If

If Not BridgeRunning() Then
  sh.CurrentDirectory = folder
  ' Run node directly: no cmd shell, no interactive setup, no visible window.
  On Error Resume Next
  rc = sh.Run(Quote(nodePath) & " " & Quote(fs.BuildPath(folder, "bridge.mjs")), 0, False)
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Fail "Node.js tidak dapat dijalankan. Coba start.cmd untuk melihat error."
  End If
  On Error GoTo 0
  For i = 1 To 15
    WScript.Sleep 500
    If BridgeRunning() Then Exit For
  Next
End If

If Not BridgeRunning() Then
  Fail "Bridge belum siap di port 20129. Jalankan start.cmd untuk diagnosis."
End If
If action = "/install" Then
  MsgBox "Startup terpasang dan bridge aktif tanpa jendela terminal." & vbCrLf & _
    "Bridge otomatis mulai saat akun Windows ini login." & vbCrLf & _
    "Jangan pindahkan folder bridge setelah pemasangan.", vbInformation, "1minAI Bridge"
End If

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function

Function FindNode()
  Dim item, candidate, paths
  FindNode = ""
  paths = Split(sh.Environment("PROCESS")("PATH"), ";")
  For Each item In paths
    item = Trim(Replace(item, Chr(34), ""))
    If item <> "" Then
      candidate = fs.BuildPath(sh.ExpandEnvironmentStrings(item), "node.exe")
      If fs.FileExists(candidate) Then
        FindNode = candidate
        Exit Function
      End If
    End If
  Next
  candidate = sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
  If fs.FileExists(candidate) Then FindNode = candidate
End Function

Function BridgeRunning()
  Dim req
  BridgeRunning = False
  On Error Resume Next
  Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  req.setTimeouts 500, 500, 500, 1000
  req.setProxy 1
  req.open "GET", "http://127.0.0.1:20129/health", False
  req.send
  If Err.Number = 0 Then
    If req.status = 200 Then
      If InStr(req.responseText, "experimental-tool-emulation") > 0 Then BridgeRunning = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub Fail(message)
  ' Controlled messages only: never read/print API keys or config contents.
  If action = "/install" Then
    MsgBox message, vbExclamation, "1minAI Bridge"
  Else
    On Error Resume Next
    sh.LogEvent 1, "1minAI Bridge startup: " & message
    On Error GoTo 0
  End If
  WScript.Quit 1
End Sub
